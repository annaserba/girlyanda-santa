import { canonical, type EventConfig } from "@/lib/event-config";
import { getGarlandDisplay } from "@/lib/garland-display";
import type { AdminGarlandSnapshot } from "@/lib/admin-garland";
import { GarlandMap } from "./garland-map";
import { AdminGarlandView } from "./admin-garland-view";

export function AdminGarlandOverview({
  snapshot,
  config,
}: {
  snapshot: AdminGarlandSnapshot;
  config: EventConfig;
}) {
  const display = getGarlandDisplay(snapshot, config);
  const grouped = new Map<string, string[]>();
  for (const person of snapshot.people) {
    const key = canonical(person.city);
    grouped.set(key, [...(grouped.get(key) ?? []), person.name]);
  }
  const cityDetails = Object.fromEntries(
    [...grouped].map(([key, names]) => [
      key,
      {
        names:
          names.slice(0, 8).join("\n") +
          (names.length > 8 ? `\nЕщё участников: ${names.length - 8}` : ""),
      },
    ]),
  );
  return (
    <AdminGarlandView
      people={snapshot.people}
      gifts={snapshot.gifts}
      phase={snapshot.phase}
    >
      <GarlandMap
        summary={display.summary}
        phase={display.phase}
        ringIntensity={display.decoration.intensity}
        cityDetails={cityDetails}
      />
    </AdminGarlandView>
  );
}
