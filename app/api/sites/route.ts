import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { badRequest, requireAdmin, requireUser } from "@/lib/api";
import { getSiteOptions, mergeSites, renameSite, SiteError } from "@/lib/sites";

export async function GET() {
  const { response } = await requireUser();
  if (response) return response;
  return NextResponse.json(
    { sites: await getSiteOptions() },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

const editSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("rename"),
    sourceId: z.number().int().positive(),
    name: z.string().trim().min(1).max(120),
  }),
  z.object({
    action: z.literal("merge"),
    sourceId: z.number().int().positive(),
    targetId: z.number().int().positive(),
  }),
]);

export async function PATCH(req: NextRequest) {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;
  const parsed = editSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return badRequest("Проверьте площадку, название и действие.");
  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(2026, 1)`);
      const data = parsed.data;
      return data.action === "rename"
        ? renameSite(tx, data.sourceId, data.name)
        : mergeSites(tx, data.sourceId, data.targetId);
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof SiteError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    throw error;
  }
}
