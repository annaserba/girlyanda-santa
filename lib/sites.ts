import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { canonical } from "./event-config";
import { cleanSiteName, type SiteOption } from "./work-sites";

type SiteWriter = Pick<typeof db, "select" | "insert" | "update" | "delete">;
type Site = typeof schema.workSite.$inferSelect;

export class SiteError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export async function getSiteOptions(
  reader: Pick<typeof db, "select"> = db,
): Promise<SiteOption[]> {
  const rows = await reader
    .select({
      id: schema.workSite.id,
      city: schema.workSite.city,
      name: schema.workSite.name,
    })
    .from(schema.workSite);
  return rows.sort(
    (a, b) =>
      a.city.localeCompare(b.city, "ru-RU") ||
      a.name.localeCompare(b.name, "ru-RU"),
  );
}

/** Caller holds the shared roster advisory lock for every catalog write. */
export async function resolveSiteName(
  tx: SiteWriter,
  city: string,
  input: string,
) {
  const name = cleanSiteName(input);
  if (!name) return "";
  if (name.length > 120)
    throw new SiteError("Название площадки — не более 120 символов.");
  const cityKey = canonical(city);
  const nameKey = canonical(name);
  const [existing] = await tx
    .select({ name: schema.workSite.name })
    .from(schema.workSiteAlias)
    .innerJoin(
      schema.workSite,
      eq(schema.workSite.id, schema.workSiteAlias.siteId),
    )
    .where(
      and(
        eq(schema.workSiteAlias.cityKey, cityKey),
        eq(schema.workSiteAlias.nameKey, nameKey),
      ),
    );
  if (existing) return existing.name;
  const [site] = await tx
    .insert(schema.workSite)
    .values({ city: cleanSiteName(city), cityKey, name, nameKey })
    .returning();
  await tx
    .insert(schema.workSiteAlias)
    .values({ cityKey, nameKey, siteId: site.id });
  return site.name;
}

async function findSite(tx: SiteWriter, id: number) {
  const [site] = await tx
    .select()
    .from(schema.workSite)
    .where(eq(schema.workSite.id, id));
  if (!site) throw new SiteError("Площадка не найдена. Обновите список.", 404);
  return site;
}

async function relabel(tx: SiteWriter, sources: number[], target: Site) {
  const aliases = await tx
    .select()
    .from(schema.workSiteAlias)
    .where(inArray(schema.workSiteAlias.siteId, sources));
  const names = new Set(aliases.map((alias) => alias.nameKey));
  const belongs = (row: { city: string; site: string }) =>
    canonical(row.city) === target.cityKey && names.has(canonical(row.site));
  const participants = (
    await tx
      .select({
        id: schema.participant.id,
        city: schema.participant.city,
        site: schema.participant.site,
      })
      .from(schema.participant)
  ).filter(belongs);
  if (participants.length)
    await tx
      .update(schema.participant)
      .set({ site: target.name })
      .where(
        inArray(
          schema.participant.id,
          participants.map((p) => p.id),
        ),
      );

  // A merge retains the union of coordinator permissions and removes duplicates.
  // Keep an existing exact target row when possible so ordinary renames retain IDs.
  const scopes = (await tx.select().from(schema.coordinatorScope)).filter(
    belongs,
  );
  const users = new Set(scopes.map((scope) => scope.userId));
  for (const userId of users) {
    const rows = scopes.filter((scope) => scope.userId === userId);
    const keep =
      rows.find(
        (s) => s.city === target.cityKey && s.site === target.nameKey,
      ) ?? rows[0];
    const duplicates = rows.filter((s) => s.id !== keep.id).map((s) => s.id);
    if (duplicates.length)
      await tx
        .delete(schema.coordinatorScope)
        .where(inArray(schema.coordinatorScope.id, duplicates));
    await tx
      .update(schema.coordinatorScope)
      .set({ city: target.cityKey, site: target.nameKey })
      .where(eq(schema.coordinatorScope.id, keep.id));
  }
  return { participants: participants.length, coordinators: users.size };
}

export async function renameSite(tx: SiteWriter, id: number, input: string) {
  const source = await findSite(tx, id);
  const name = cleanSiteName(input);
  if (!name || name.length > 120)
    throw new SiteError("Укажите название площадки до 120 символов.");
  const nameKey = canonical(name);
  const [taken] = await tx
    .select()
    .from(schema.workSiteAlias)
    .where(
      and(
        eq(schema.workSiteAlias.cityKey, source.cityKey),
        eq(schema.workSiteAlias.nameKey, nameKey),
      ),
    );
  if (taken && taken.siteId !== id)
    throw new SiteError(
      "Такое название уже используется. Выберите объединение площадок.",
      409,
    );
  if (!taken)
    await tx
      .insert(schema.workSiteAlias)
      .values({ cityKey: source.cityKey, nameKey, siteId: id });
  const target = { ...source, name, nameKey };
  const counts = await relabel(tx, [id], target);
  await tx
    .update(schema.workSite)
    .set({ name, nameKey })
    .where(eq(schema.workSite.id, id));
  return { site: { id, city: source.city, name }, ...counts };
}

export async function mergeSites(
  tx: SiteWriter,
  sourceId: number,
  targetId: number,
) {
  if (sourceId === targetId)
    throw new SiteError("Выберите другую площадку для объединения.");
  const source = await findSite(tx, sourceId);
  const target = await findSite(tx, targetId);
  if (source.cityKey !== target.cityKey)
    throw new SiteError("Объединять можно только площадки одного города.");
  const counts = await relabel(tx, [sourceId, targetId], target);
  await tx
    .update(schema.workSiteAlias)
    .set({ siteId: targetId })
    .where(eq(schema.workSiteAlias.siteId, sourceId));
  await tx.delete(schema.workSite).where(eq(schema.workSite.id, sourceId));
  return {
    site: { id: target.id, city: target.city, name: target.name },
    ...counts,
  };
}
