import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, first, schema } from "@/lib/db";
import { badRequest, requireAdmin } from "@/lib/api";
import { DrawError } from "@/lib/draw";
import { executeDraw } from "@/lib/draw-runner";
import { getEventConfig } from "@/lib/event-settings";
import { profileReady } from "@/lib/event-config";
import { runGarlandDraw } from "@/lib/garland-draw";

export async function GET() {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;

  const draws = await db
    .select()
    .from(schema.draw)
    .orderBy(desc(schema.draw.createdAt));
  return NextResponse.json(draws);
}

const bodySchema = z.object({
  name: z.string().min(1),
  budget: z.number().int().nonnegative().nullable().optional(),
  // Personal results stay in the app. Retired channels cannot be enabled.
  deliverReveal: z.boolean().default(true),
  deliverEmail: z.literal(false).default(false),
  deliverPush: z.literal(false).default(false),
  previewLimit: z.number().int().positive().max(100).default(3),
  // Kept for older clients; enabling self-assignment is never accepted.
  allowSelfDraw: z.literal(false).default(false),
  // 0 = don't avoid previous pairings; N = avoid the last N draws.
  historyDepth: z.number().int().nonnegative().max(50).default(0),
  // ISO datetime string. When in the future the draw is created as a draft
  // and the scheduler runs it then; otherwise it runs immediately.
  scheduledAt: z.string().datetime().nullable().optional(),
  // ISO datetime string. When the pairs become public; null = never.
  pairsVisibleAt: z.string().datetime().nullable().optional(),
});

export async function POST(req: NextRequest) {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    if (
      parsed.error.issues.some((issue) => issue.path[0] === "allowSelfDraw")
    ) {
      return badRequest("Дарить самому себе нельзя.");
    }
    if (
      parsed.error.issues.some(
        (issue) =>
          issue.path[0] === "deliverEmail" || issue.path[0] === "deliverPush",
      )
    ) {
      return badRequest(
        "Автоматические уведомления отключены. Используйте вкладку «Рассылка» для корпоративной почты.",
      );
    }
    return badRequest("Проверьте настройки жеребьёвки.");
  }
  const cfg = parsed.data;

  const scheduledAt = cfg.scheduledAt ? new Date(cfg.scheduledAt) : null;
  const pairsVisibleAt = cfg.pairsVisibleAt
    ? new Date(cfg.pairsVisibleAt)
    : null;
  const isFuture = scheduledAt != null && scheduledAt.getTime() > Date.now();

  // Quick participant check up-front so scheduling a doomed draw fails fast.
  const config = await getEventConfig();
  if (config.registrationOpen)
    return badRequest("Сначала закройте приём анкет в правилах события.");
  const participants = (await db.select().from(schema.participant)).filter(
    (p) => p.consentAt && profileReady(p),
  );
  if (participants.length < 3) {
    return badRequest(
      "Нужны минимум три подтверждённые анкеты: без подарков себе и взаимных пар.",
    );
  }
  if (isFuture) {
    const exclusions = await db.select().from(schema.exclusion);
    try {
      runGarlandDraw(
        participants,
        exclusions.map((e) => [e.aId, e.bId]),
        [],
        config.ringPolicy,
      );
    } catch (err) {
      if (err instanceof DrawError) return badRequest(err.message);
      throw err;
    }
  }

  // Always create the draw row first (status draft).
  const draw = (await first(
    db
      .insert(schema.draw)
      .values({
        name: cfg.name,
        garlandVersion: 1,
        budget: config.budget,
        ringPolicy: config.ringPolicy,
        deliverReveal: cfg.deliverReveal,
        deliverEmail: false,
        deliverPush: false,
        previewLimit: cfg.previewLimit,
        allowSelfDraw: false,
        historyDepth: cfg.historyDepth,
        status: "draft",
        scheduledAt,
        pairsVisibleAt,
      })
      .returning(),
  ))!;

  // Future-scheduled: leave as a draft for the in-process scheduler.
  if (isFuture) {
    return NextResponse.json(
      { draw, scheduled: true, scheduledAt: scheduledAt!.toISOString() },
      { status: 201 },
    );
  }

  // Run now.
  try {
    const result = await executeDraw(draw);
    return NextResponse.json(
      {
        draw: result.draw,
        assignments: result.assignments,
        rings: result.rings,
        historyRelaxed: result.historyRelaxed,
        revealLinks: cfg.deliverReveal ? result.revealLinks : undefined,
      },
      { status: 201 },
    );
  } catch (e) {
    // Roll back the empty draft so a failed draw doesn't litter history.
    await db
      .delete(schema.draw)
      .where(and(eq(schema.draw.id, draw.id), eq(schema.draw.status, "draft")));
    if (e instanceof DrawError) return badRequest(e.message);
    throw e;
  }
}

/** Only unexecuted drafts may be cancelled; completed history is immutable. */
export async function DELETE(req: NextRequest) {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;
  const parsed = z
    .object({ id: z.number().int().positive() })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return badRequest("Некорректный идентификатор жеребьёвки.");
  const removed = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(2026, 1)`);
    return tx
      .delete(schema.draw)
      .where(
        and(
          eq(schema.draw.id, parsed.data.id),
          eq(schema.draw.status, "draft"),
        ),
      )
      .returning({ id: schema.draw.id });
  });
  return removed.length
    ? NextResponse.json({ ok: true })
    : badRequest("Можно отменить только ещё не выполненный черновик.");
}
