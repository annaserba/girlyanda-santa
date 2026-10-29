import type { summarizeGifts } from "@/lib/garland-summary";
import type { CSSProperties } from "react";
import { GarlandMapCanvas } from "@/components/garland-map-canvas";
import { canonical } from "@/lib/event-config";
import {
  buildCityRing,
  placeCityLabels,
  projectRussianLocation,
  RUSSIA_MAP_WIDTH,
  RUSSIA_MAP_HEIGHT,
  RUSSIA_OUTLINE,
  ADDITIONAL_REGION_OUTLINES,
} from "@/lib/russia-map";

export function GarlandMap({
  summary,
  phase = "gifts",
  ringIntensity = 1,
  cityDetails,
}: {
  summary: ReturnType<typeof summarizeGifts>;
  phase?: "registration" | "gifts";
  ringIntensity?: number;
  cityDetails?: Record<string, { names: string }>;
}) {
  const cities = summary.cities.flatMap((city) => {
    const point = projectRussianLocation(city.location);
    return point ? [{ ...city, point }] : [];
  });
  const ring = buildCityRing(cities.map((city) => city.point));
  const labels = placeCityLabels(cities);
  return (
    <div className="garland-map space-y-4">
      <GarlandMapCanvas>
        <svg
          viewBox={`0 0 ${RUSSIA_MAP_WIDTH} ${RUSSIA_MAP_HEIGHT}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-labelledby="garland-map-title"
          aria-describedby="garland-map-description"
          className="garland-russia-svg w-full"
        >
          <title id="garland-map-title">
            {`${cityDetails ? "Карта организатора." : ""} ${phase === "registration" ? "Карта записи участников." : "Карта получения подарков."} Карта России. Опорные города и подтверждённые данные участников.`}
          </title>
          <desc id="garland-map-description">
            Цветная линия — декоративная гирлянда городов, не тайные пары и не
            маршрут доставки. Жёлтые города имеют полученные подарки, серые —
            пока нет. Полые маркеры — опорные города без подтверждённых анкет.
            Карта сохраняет пропорции выбранной плоской проекции. Донецкая,
            Луганская, Запорожская и Херсонская области показаны дополнительным
            слоем административных областей без обводки. Это не линия
            фактического контроля.
          </desc>
          <g aria-hidden="true">
            {ADDITIONAL_REGION_OUTLINES.map((region) => (
              <path
                key={region.id}
                className="garland-additional-region"
                data-region={region.id}
                d={region.path}
                fill="#1b2b4e"
                stroke="none"
              >
                <title>{region.name}</title>
              </path>
            ))}
          </g>
          <path
            className="garland-russia-outline"
            d={RUSSIA_OUTLINE}
            fill="#1b2b4e"
            stroke="none"
          />
          {ring && (
            <g
              className="garland-city-ring"
              aria-hidden="true"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={ring} stroke="#9ba789" strokeWidth={5} opacity={0.2} />
              <path d={ring} stroke="#577778" strokeWidth={2} />
              <g opacity={Math.max(0, Math.min(1, ringIntensity))}>
                {["#f8d479", "#d66f68", "#70ac8d", "#90b3d7"].map(
                  (color, index) => (
                    <path
                      key={color}
                      className="garland-ring-lights"
                      d={ring}
                      stroke={color}
                      strokeWidth={3}
                      strokeDasharray="1 15"
                      strokeDashoffset={-index * 4}
                      style={
                        {
                          color,
                          "--garland-light-offset": `${-index * 4}px`,
                          animationDelay: `0s, ${index * -1.4}s`,
                        } as CSSProperties
                      }
                    />
                  ),
                )}
              </g>
            </g>
          )}
          {cities.map((city) => {
            const { point } = city;
            const label = labels.get(city.city);
            const detail = cityDetails?.[canonical(city.city)];
            const marker = (
              <circle
                className={
                  city.received
                    ? "garland-city-marker garland-city-received"
                    : "garland-city-marker"
                }
                r={6}
                fill={
                  city.received ? "#fbbf24" : city.total ? "#64748b" : "none"
                }
                stroke={city.total ? "#0f172a" : "#9baac3"}
                strokeWidth={1.5}
              />
            );
            return (
              <g
                key={city.city}
                transform={`translate(${point[0]},${point[1]})`}
              >
                {detail ? (
                  <a
                    href="#garland-participants"
                    data-admin-city={city.city}
                    className="garland-admin-city-link"
                    aria-label={`${city.city}: показать участников`}
                  >
                    <circle r={14} fill="transparent" />
                    {marker}
                    <title>{city.city + "\n" + detail.names}</title>
                  </a>
                ) : (
                  marker
                )}
                {label && (
                  <text
                    className="garland-map-city-label"
                    x={label.x - point[0]}
                    y={label.y - point[1]}
                    textAnchor={label.anchor}
                    fill="#fff3d6"
                    fontSize={11}
                    fontWeight={600}
                  >
                    {city.city}
                  </text>
                )}
                {!detail && (
                  <title>
                    {!city.total
                      ? city.city
                      : phase === "registration"
                        ? `${city.city}: записались ${city.total}`
                        : `${city.city}: получено ${city.received} из ${city.total}`}
                  </title>
                )}
              </g>
            );
          })}
        </svg>
      </GarlandMapCanvas>
      <ul className="sr-only" aria-label="Подтверждённые данные по городам">
        {summary.cities
          .filter((city) => city.total > 0)
          .map((city) => (
            <li key={city.city}>
              {city.city}:{" "}
              {phase === "registration"
                ? `записались ${city.total}`
                : `получено ${city.received} из ${city.total}`}
              .
              {city.sites.map((site) => (
                <span key={site.site}>
                  {" "}
                  {site.site}:{" "}
                  {phase === "registration"
                    ? `записались ${site.total}`
                    : `получено ${site.received} из ${site.total}`}
                  .
                </span>
              ))}
              {!city.location && " Координаты ещё не добавлены организатором."}
            </li>
          ))}
      </ul>
    </div>
  );
}
