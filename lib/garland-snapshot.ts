import "server-only";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db, first, schema } from "@/lib/db";
import type { EventConfig } from "./event-config";
import { summarizeGifts } from "./garland-summary";

// Only aggregate-safe fields are selected. The home page receives no identities,
// contact details, pickup points, reveal tokens, or the assignment graph.
export async function getGarlandSnapshot(config: EventConfig) {
  const draw = await first(
    db
      .select({ id: schema.draw.id })
      .from(schema.draw)
      .where(
        and(
          eq(schema.draw.status, "completed"),
          eq(schema.draw.garlandVersion, 1),
        ),
      )
      .orderBy(desc(schema.draw.executedAt))
      .limit(1),
  );
  if (draw) {
    const rows = await db
      .select({
        city: schema.participant.city,
        site: schema.participant.site,
        receivedAt: schema.assignment.receivedAt,
      })
      .from(schema.assignment)
      .innerJoin(
        schema.participant,
        eq(schema.participant.id, schema.assignment.receiverId),
      )
      .where(eq(schema.assignment.drawId, draw.id));
    return { phase: "gifts" as const, summary: summarizeGifts(rows, config) };
  }

  const registrations = await db
    .select({ city: schema.participant.city, site: schema.participant.site })
    .from(schema.participant)
    .where(isNotNull(schema.participant.consentAt));
  return {
    phase: "registration" as const,
    summary: summarizeGifts(
      registrations.map((row) => ({
        city: row.city,
        site: row.site,
        receivedAt: null,
      })),
      config,
    ),
  };
}
