import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { badRequest, requireAdmin } from "@/lib/api";
import { eventConfigSchema, canonical } from "@/lib/event-config";

export async function PUT(req: NextRequest) {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;
  const parsed = eventConfigSchema.safeParse(
    await req.json().catch(() => null),
  );
  if (!parsed.success)
    return badRequest("Проверьте сумму, координаты и порядок дат.");
  const cities = parsed.data.locations.map((l) => canonical(l.city));
  if (new Set(cities).size !== cities.length)
    return badRequest("Город в координатах должен встречаться один раз.");
  const error = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(2026, 1)`);
    const [completed] = await tx
      .select()
      .from(schema.draw)
      .where(
        and(
          eq(schema.draw.garlandVersion, 1),
          eq(schema.draw.status, "completed"),
        ),
      )
      .limit(1);
    if (
      completed &&
      (parsed.data.registrationOpen ||
        parsed.data.budget !== completed.budget ||
        parsed.data.ringPolicy !== completed.ringPolicy)
    )
      return "После жеребьёвки нельзя открыть приём анкет или менять лимит и правило колец. Сроки и карту можно уточнить.";
    const value = JSON.stringify(parsed.data);
    await tx
      .insert(schema.appSetting)
      .values({ key: "event.config", value })
      .onConflictDoUpdate({
        target: schema.appSetting.key,
        set: { value, updatedAt: new Date() },
      });
    return null;
  });
  return error ? badRequest(error) : NextResponse.json({ ok: true });
}
