import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
import { db, first, schema } from "@/lib/db";
import { badRequest } from "@/lib/api";
import { getOrCreateParticipant } from "@/lib/session";
import { profileSchema } from "@/lib/event-config";
import { getEventConfig } from "@/lib/event-settings";
import { resolveSiteName } from "@/lib/sites";

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
  let savedSite = profile.site;
  let savedProfile;
  const error = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(2026, 1)`);
    const current = await first(
      tx
        .select()
        .from(schema.participant)
        .where(eq(schema.participant.id, participant.id)),
    );
    if (!current || current.userId !== participant.userId)
      return "Анкета недоступна. Обновите страницу и войдите снова.";
    const completed = await first(
      tx
        .select({ id: schema.draw.id })
        .from(schema.draw)
        .where(
          and(
            eq(schema.draw.garlandVersion, 1),
            eq(schema.draw.status, "completed"),
          ),
        )
        .limit(1),
    );
    if (completed)
      return "После жеребьёвки анкету меняет только организатор по согласованию. Пожелания можно дополнять в списке ниже.";
    const config = await getEventConfig(tx);
    if (consent && !current.consentAt && !config.registrationOpen)
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
    savedSite = await resolveSiteName(tx, profile.city, profile.site);
    [savedProfile] = await tx
      .update(schema.participant)
      .set({
        ...profile,
        name: profile.name || current.name,
        site: savedSite,
        consentAt: consent ? (current.consentAt ?? new Date()) : null,
      })
      .where(eq(schema.participant.id, participant.id))
      .returning({
        name: schema.participant.name,
        city: schema.participant.city,
        site: schema.participant.site,
        shift: schema.participant.shift,
        track: schema.participant.track,
        pickupPoint: schema.participant.pickupPoint,
        wishes: schema.participant.wishes,
        consentAt: schema.participant.consentAt,
        reserveVolunteer: schema.participant.reserveVolunteer,
      });
    return null;
  });
  return error
    ? badRequest(error)
    : NextResponse.json({ ok: true, site: savedSite, profile: savedProfile });
}
