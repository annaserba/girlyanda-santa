import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNotNull, ne, or, sql } from "drizzle-orm";
import { db, first, schema } from "@/lib/db";
import { badRequest } from "@/lib/api";
import { getOrCreateParticipant } from "@/lib/session";
import { profileSchema } from "@/lib/event-config";
import { getEventConfig } from "@/lib/event-settings";

export async function PUT(req: NextRequest) {
  const participant = await getOrCreateParticipant();
  if (!participant)
    return NextResponse.json(
      { error: "Сначала войдите в аккаунт." },
      { status: 401 },
    );
  const parsed = profileSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return badRequest(parsed.error.issues[0]?.message ?? "Проверьте анкету.");
  const { consent, ...profile } = parsed.data;
  const error = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(2026, 1)`);
    const assigned = await first(
      tx
        .select({ id: schema.assignment.id })
        .from(schema.assignment)
        .innerJoin(schema.draw, eq(schema.draw.id, schema.assignment.drawId))
        .where(
          and(
            eq(schema.draw.garlandVersion, 1),
            or(
              eq(schema.assignment.giverId, participant.id),
              eq(schema.assignment.receiverId, participant.id),
            ),
          ),
        )
        .limit(1),
    );
    if (assigned)
      return "После жеребьёвки анкету меняет только организатор по согласованию. Пожелания можно дополнять в списке ниже.";
    const config = await getEventConfig(tx);
    if (consent && !config.registrationOpen)
      return "Приём анкет закрыт организатором.";
    if (consent && participant.userId) {
      const owner = await first(
        tx
          .select({ email: schema.user.email })
          .from(schema.user)
          .where(eq(schema.user.id, participant.userId)),
      );
      if (owner?.email) {
        const duplicate = await first(
          tx
            .select({ id: schema.participant.id })
            .from(schema.participant)
            .where(
              and(
                ne(schema.participant.id, participant.id),
                isNotNull(schema.participant.consentAt),
                eq(schema.participant.email, owner.email.toLowerCase()),
              ),
            )
            .limit(1),
        );
        if (duplicate)
          return "Эта почта уже есть в подтверждённой анкете. Попросите организатора привязать к ней ваш аккаунт, чтобы не участвовать дважды.";
      }
    }
    await tx
      .update(schema.participant)
      .set({ ...profile, consentAt: consent ? new Date() : null })
      .where(eq(schema.participant.id, participant.id));
    return null;
  });
  return error ? badRequest(error) : NextResponse.json({ ok: true });
}
