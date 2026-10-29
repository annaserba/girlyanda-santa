import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db, first, schema } from "@/lib/db";
import { badRequest, requireAdmin } from "@/lib/api";

export async function GET() {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;

  const rows = await db.select().from(schema.exclusion);
  return NextResponse.json(rows);
}

const createSchema = z.object({
  aId: z.number().int().positive(),
  bId: z.number().int().positive(),
});

export async function POST(req: NextRequest) {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return badRequest("Проверьте выбранных участников.");
  if (parsed.data.aId === parsed.data.bId) {
    return badRequest("Для исключения выберите двух разных участников.");
  }

  const row = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(2026, 1)`);
    return first(tx.insert(schema.exclusion).values({ aId: parsed.data.aId, bId: parsed.data.bId }).returning());
  });

  return NextResponse.json(row, { status: 201 });
}
