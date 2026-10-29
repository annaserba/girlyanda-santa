import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { badRequest, requireAdmin } from "@/lib/api";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;

  const id = Number((await params).id);
  if (Number.isNaN(id)) return badRequest("Некорректный идентификатор.");

  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(2026, 1)`);
    await tx.delete(schema.exclusion).where(eq(schema.exclusion.id, id));
  });
  return NextResponse.json({ ok: true });
}
