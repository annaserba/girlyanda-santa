import "server-only";
import { eq } from "drizzle-orm";
import { db, first, schema } from "@/lib/db";
import {
  EVENT_DEFAULTS,
  eventConfigSchema,
  type EventConfig,
} from "./event-config";

export async function getEventConfig(
  reader: Pick<typeof db, "select"> = db,
): Promise<EventConfig> {
  const row = await first(
    reader
      .select()
      .from(schema.appSetting)
      .where(eq(schema.appSetting.key, "event.config")),
  );
  if (!row?.value) return { ...EVENT_DEFAULTS };
  const parsed = eventConfigSchema.safeParse(JSON.parse(row.value));
  if (!parsed.success)
    throw new Error(
      "Некорректные настройки события. Обратитесь к организатору.",
    );
  return parsed.data;
}
