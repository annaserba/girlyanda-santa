import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, first, schema } from "@/lib/db";
import { requireAdmin, badRequest } from "@/lib/api";
import { canonical } from "@/lib/event-config";

export async function POST(req: NextRequest) {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;
  const parsed = z
    .object({
      userId: z.string().min(1),
      city: z.string().trim().min(1).max(120),
      site: z.string().trim().min(1).max(120),
    })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return badRequest("Укажите аккаунт, город и площадку координатора.");
  const exists = await first(
    db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.id, parsed.data.userId)),
  );
  if (!exists) return badRequest("Аккаунт не найден.");
  await db
    .insert(schema.coordinatorScope)
    .values({
      userId: parsed.data.userId,
      city: canonical(parsed.data.city),
      site: canonical(parsed.data.site),
    })
    .onConflictDoNothing();
  return NextResponse.json({ ok: true });
}
export async function DELETE(req: NextRequest) {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;
  const parsed = z
    .object({ id: z.number().int().positive() })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Некорректный идентификатор доступа.");
  await db
    .delete(schema.coordinatorScope)
    .where(eq(schema.coordinatorScope.id, parsed.data.id));
  return NextResponse.json({ ok: true });
}
