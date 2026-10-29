import "server-only";
import { randomBytes } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Draw } from "@/lib/db/schema";
import { DrawError } from "@/lib/draw";
import { runGarlandDraw } from "@/lib/garland-draw";
import { profileReady } from "@/lib/event-config";
import { getEventConfig } from "@/lib/event-settings";

export interface ExecuteResult {
  draw: Draw;
  assignments: number;
  rings: number;
  historyRelaxed: boolean;
  revealLinks: { giver: string; url: string }[];
}
export function appBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.BETTER_AUTH_URL ??
    "http://localhost:3000"
  );
}
/** Shared roster lock and transaction prevent duplicate or partial runs.
 * No external notifications, even for old drafts with legacy flags enabled.
 */
export async function executeDraw(input: Draw): Promise<ExecuteResult> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(2026, 1)`);
    const [draw] = await tx
      .select()
      .from(schema.draw)
      .where(eq(schema.draw.id, input.id))
      .for("update");
    if (!draw || draw.status !== "draft")
      throw new DrawError(
        "Эта жеребьёвка уже выполнена или удалена. Обновите страницу.",
      );
    if (draw.garlandVersion !== 1)
      throw new DrawError(
        "Это черновик старой версии. Создайте новую жеребьёвку после сбора анкет.",
      );
    const completed = await tx
      .select({ id: schema.draw.id })
      .from(schema.draw)
      .where(
        and(
          eq(schema.draw.garlandVersion, 1),
          eq(schema.draw.status, "completed"),
        ),
      )
      .limit(1);
    if (completed.length)
      throw new DrawError(
        "Гирлянда уже распределена. Повторная жеребьёвка изменит получателей; используйте резерв для замен.",
      );
    const config = await getEventConfig(tx);
    if (config.registrationOpen)
      throw new DrawError("Сначала закройте приём анкет в правилах события.");
    const all = await tx.select().from(schema.participant);
    const participants = all.filter((p) => p.consentAt && profileReady(p));
    const exclusions = await tx.select().from(schema.exclusion);
    const recent = draw.historyDepth
      ? await tx
          .select({ id: schema.draw.id })
          .from(schema.draw)
          .where(eq(schema.draw.status, "completed"))
          .orderBy(desc(schema.draw.createdAt))
          .limit(draw.historyDepth)
      : [];
    const history = recent.length
      ? await tx
          .select({
            giverId: schema.assignment.giverId,
            receiverId: schema.assignment.receiverId,
          })
          .from(schema.assignment)
          .where(
            inArray(
              schema.assignment.drawId,
              recent.map((d) => d.id),
            ),
          )
      : [];
    const result = runGarlandDraw(
      participants,
      exclusions.map((e) => [e.aId, e.bId]),
      history.map((h) => [h.giverId, h.receiverId]),
      draw.ringPolicy,
    );
    const byId = new Map(participants.map((p) => [p.id, p]));
    const rows = [...result.pairs].map(([giverId, receiverId]) => ({
      drawId: draw.id,
      giverId,
      receiverId,
      revealToken: randomBytes(24).toString("hex"),
    }));
    await tx.insert(schema.assignment).values(rows);
    const [updated] = await tx
      .update(schema.draw)
      .set({
        status: "completed",
        executedAt: new Date(),
        deliverEmail: false,
        deliverPush: false,
      })
      .where(eq(schema.draw.id, draw.id))
      .returning();
    return {
      draw: updated,
      assignments: rows.length,
      rings: result.rings,
      historyRelaxed: result.historyRelaxed,
      revealLinks: rows.map((r) => ({
        giver: byId.get(r.giverId)!.name,
        url: `${appBaseUrl()}/reveal/${r.revealToken}`,
      })),
    };
  });
}
