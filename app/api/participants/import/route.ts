import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { badRequest } from "@/lib/api";
import { staffAccess, managesSite } from "@/lib/staff";
import { getEventConfig } from "@/lib/event-settings";
import { parseMemberList, memberIdentity } from "@/lib/import-members";
import { resolveSiteName } from "@/lib/sites";
import { canonical } from "@/lib/event-config";

export async function POST(req: NextRequest) {
  const access = await staffAccess();
  if (!access || (!access.admin && !access.scopes.length))
    return NextResponse.json(
      { error: "Доступ только организатору или координатору." },
      { status: 403 },
    );
  const parsed = z
    .object({
      text: z.string().min(1).max(2_000_000),
      consentConfirmed: z.literal(true),
    })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return badRequest(
      "Нужны список и подтверждение добровольного участия каждого человека.",
    );
  let entries: ReturnType<typeof parseMemberList>;
  try {
    entries = parseMemberList(parsed.data.text);
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : "Ошибка списка.");
  }
  if (!entries.length || entries.length > 1500)
    return badRequest("За один раз можно добавить от 1 до 1500 анкет.");
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(2026, 1)`);
    if (!(await getEventConfig(tx)).registrationOpen)
      return "Приём анкет закрыт.";
    // Refresh scope inside the same lock as rename/merge and resolve old names
    // before checking access. Do not create catalog rows for rejected imports.
    const currentAccess = access.admin
      ? access
      : {
          ...access,
          scopes: await tx
            .select()
            .from(schema.coordinatorScope)
            .where(eq(schema.coordinatorScope.userId, access.user.id)),
        };
    const aliases = await tx.select().from(schema.workSiteAlias);
    const sites = await tx.select().from(schema.workSite);
    const resolvedEntries = entries.map((p) => {
      const alias = aliases.find(
        (a) =>
          a.cityKey === canonical(p.city) && a.nameKey === canonical(p.site),
      );
      const site = alias ? sites.find((s) => s.id === alias.siteId) : undefined;
      return site ? { ...p, site: site.name } : p;
    });
    if (resolvedEntries.some((p) => !managesSite(currentAccess, p)))
      return "В списке есть чужая площадка. Импорт отменён полностью.";
    const existing = await tx.select().from(schema.participant);
    const identities = new Set(existing.map(memberIdentity));
    const emails = new Set(
      existing.flatMap((p) => (p.email ? [p.email.toLowerCase()] : [])),
    );
    const accounts = await tx
      .select({ email: schema.user.email })
      .from(schema.user);
    accounts.forEach((a) => emails.add(a.email.toLowerCase()));
    for (let i = 0; i < resolvedEntries.length; i++) {
      const p = resolvedEntries[i];
      const key = memberIdentity(p);
      if (identities.has(key) || (p.email && emails.has(p.email)))
        return `Строка ${i + 1}: участник или почта уже есть. Весь импорт отменён, существующие анкеты не изменены.`;
      identities.add(key);
      if (p.email) emails.add(p.email);
    }
    const records = [];
    for (const { consent: _consent, ...p } of resolvedEntries) {
      const site = await resolveSiteName(tx, p.city, p.site);
      records.push({
        ...p,
        site,
        email: p.email || null,
        consentAt: new Date(),
      });
    }
    await tx.insert(schema.participant).values(records);
    return null;
  });
  return result
    ? result === "В списке есть чужая площадка. Импорт отменён полностью."
      ? NextResponse.json({ error: result }, { status: 403 })
      : badRequest(result)
    : NextResponse.json({ ok: true, count: entries.length });
}
