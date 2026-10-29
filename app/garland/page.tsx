import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getEventConfig } from "@/lib/event-settings";
import { getAdminGarlandSnapshot } from "@/lib/admin-garland-snapshot";
import { AdminGarlandOverview } from "@/components/admin-garland-overview";
import { FestiveShell } from "@/components/festive-shell";
import { getOgSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export default async function GarlandPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/dashboard");
  const [config, appearance] = await Promise.all([
    getEventConfig(),
    getOgSettings(),
  ]);
  const snapshot = await getAdminGarlandSnapshot(config);
  return (
    <FestiveShell
      siteTitle={appearance.title}
      signedIn={!!user}
      organizer={user?.role === "admin"}
    >
      <header className="festive-map-intro">
        <p className="festive-eyebrow">Карта организатора</p>
        <h1>{appearance.title}</h1>
        <p>
          {snapshot.phase === "registration"
            ? "Идёт запись участников"
            : "Гирлянда получения подарков"}
        </p>
      </header>
      <AdminGarlandOverview snapshot={snapshot} config={config} />
    </FestiveShell>
  );
}
