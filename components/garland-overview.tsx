import type { getGarlandSnapshot } from "@/lib/garland-snapshot";
import { getGarlandDisplay } from "@/lib/garland-display";
import type { EventConfig } from "@/lib/event-config";
import { GarlandMap } from "./garland-map";

export function GarlandOverview({
  snapshot,
  config,
}: {
  snapshot: Awaited<ReturnType<typeof getGarlandSnapshot>>;
  config: EventConfig;
}) {
  const display = getGarlandDisplay(snapshot, config);
  return (
    <section
      aria-labelledby="garland-heading"
      className="garland-overview space-y-4 text-left"
    >
      <h2
        id="garland-heading"
        className="garland-overview-heading text-2xl font-semibold"
      >
        Общая карта гирлянды
      </h2>
      <GarlandMap
        summary={display.summary}
        phase={display.phase}
        ringIntensity={display.decoration.intensity}
      />
    </section>
  );
}
