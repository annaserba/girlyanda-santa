import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { badRequest } from "@/lib/api";
import { staffAccess, managesSite } from "@/lib/staff";
import { getEventConfig } from "@/lib/event-settings";
import { parseMemberList, memberIdentity } from "@/lib/import-members";

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
  if (entries.some((p) => !managesSite(access, p)))
    return NextResponse.json(
      { error: "В списке есть чужая площадка. Импорт отменён полностью." },
      { status: 403 },
    );
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(2026, 1)`);
    if (!(await getEventConfig(tx)).registrationOpen)
      return "Приём анкет закрыт.";
    const existing = await tx.select().from(schema.participant);
    const identities = new Set(existing.map(memberIdentity));
    const emails = new Set(
      existing.flatMap((p) => (p.email ? [p.email.toLowerCase()] : [])),
    );
    const accounts = await tx
      .select({ email: schema.user.email })
      .from(schema.user);
    accounts.forEach((a) => emails.add(a.email.toLowerCase()));
    for (let i = 0; i < entries.length; i++) {
      const p = entries[i];
      const key = memberIdentity(p);
      if (identities.has(key) || (p.email && emails.has(p.email)))
        return `Строка ${i + 1}: участник или почта уже есть. Весь импорт отменён, существующие анкеты не изменены.`;
      identities.add(key);
      if (p.email) emails.add(p.email);
    }
    await tx
      .insert(schema.participant)
      .values(
        entries.map(({ consent: _consent, ...p }) => ({
          ...p,
          email: p.email || null,
          consentAt: new Date(),
        })),
      );
    return null;
  });
  return result
    ? badRequest(result)
    : NextResponse.json({ ok: true, count: entries.length });
}
