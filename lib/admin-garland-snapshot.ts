import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { isAdmin } from "@/lib/session";
import type { EventConfig } from "./event-config";
import { summarizeGifts } from "./garland-summary";
import type { AdminGarlandSnapshot } from "./admin-garland";

export async function getAdminGarlandSnapshot(
  config: EventConfig,
): Promise<AdminGarlandSnapshot> {
  if (!(await isAdmin()))
    throw new Error("Персональная карта доступна только организатору.");
  return db.transaction(
    async (tx) => {
      const [draw] = await tx
        .select({ id: schema.draw.id })
        .from(schema.draw)
        .where(
          and(
            eq(schema.draw.status, "completed"),
            eq(schema.draw.garlandVersion, 1),
          ),
        )
        .orderBy(desc(schema.draw.executedAt))
        .limit(1);
      const gifts = draw
        ? await tx
            .select({
              giverId: schema.assignment.giverId,
              receiverId: schema.assignment.receiverId,
              sentAt: schema.assignment.sentAt,
              receivedAt: schema.assignment.receivedAt,
              reserveSentAt: schema.assignment.reserveSentAt,
              reserveState: schema.assignment.reserveState,
            })
            .from(schema.assignment)
            .where(eq(schema.assignment.drawId, draw.id))
        : [];
      const rows = await tx
        .select({
          id: schema.participant.id,
          name: schema.participant.name,
          city: schema.participant.city,
          site: schema.participant.site,
          shift: schema.participant.shift,
          track: schema.participant.track,
          consentAt: schema.participant.consentAt,
        })
        .from(schema.participant);
      const assigned = new Set(
        gifts.flatMap((gift) => [gift.giverId, gift.receiverId]),
      );
      const people = rows
        .filter((p) => (draw ? assigned.has(p.id) : !!p.consentAt))
        .map(({ consentAt: _consentAt, ...p }) => p)
        .sort((a, b) => a.name.localeCompare(b.name, "ru-RU"));
      const incoming = new Map(gifts.map((gift) => [gift.receiverId, gift]));
      return {
        phase: draw ? "gifts" : "registration",
        summary: summarizeGifts(
          people.map((p) => ({
            city: p.city,
            site: p.site,
            receivedAt: incoming.get(p.id)?.receivedAt ?? null,
          })),
          config,
        ),
        people,
        gifts: gifts.map((gift) => ({
          giverId: gift.giverId,
          receiverId: gift.receiverId,
          sent: !!gift.sentAt,
          received: !!gift.receivedAt,
          reserveSent: !!gift.reserveSentAt,
          reserveState: gift.reserveState,
        })),
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
