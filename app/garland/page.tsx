import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getEventConfig } from "@/lib/event-settings";
import { getGarlandSnapshot } from "@/lib/garland-snapshot";
import { GarlandOverview } from "@/components/garland-overview";
import { FestiveShell } from "@/components/festive-shell";
import { getOgSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export default async function GarlandPage() {
  const [config, user, appearance] = await Promise.all([
    getEventConfig(),
    getCurrentUser(),
    getOgSettings(),
  ]);
  if (!config.mapPublished && !user) redirect("/login");
  const snapshot = await getGarlandSnapshot(config);
  return (
    <FestiveShell
      siteTitle={appearance.title}
      signedIn={!!user}
      organizer={user?.role === "admin"}
    >
      <header className="festive-map-intro">
        <p className="festive-eyebrow">Каждый подарок имеет значение</p>
        <h1>{appearance.title}</h1>
        <p>
          {snapshot.phase === "registration"
            ? "Идёт запись участников"
            : "Гирлянда получения подарков"}
        </p>
      </header>
      <GarlandOverview snapshot={snapshot} config={config} />
    </FestiveShell>
  );
}
