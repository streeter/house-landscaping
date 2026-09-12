import type { Zone } from "../domain/document";

interface Props {
  zones: Zone[];
  idPrefix: string;
  labels?: boolean;
}

const points = (polygon: [number, number][]) =>
  polygon.map(([x, y]) => `${x},${y}`).join(" ");

export function ZoneLayers({ zones, idPrefix, labels = true }: Props) {
  const filled = zones
    .map((zone, index) => ({ zone, index }))
    .filter(({ zone }) => zone.polygons.length > 0);
  const pairs = filled.flatMap((left, index) =>
    filled.slice(index + 1).map((right) => [left, right] as const),
  );
  const clipId = (index: number) => `${idPrefix}-zone-clip-${index}`;
  const hatchId = `${idPrefix}-overlap-hatch`;

  return (
    <g pointerEvents="none" aria-label="Irrigation coverage zones">
      <defs>
        {filled.map(({ zone, index }) => (
          <clipPath key={zone.id} id={clipId(index)}>
            {zone.polygons.map((polygon, piece) => (
              <polygon key={piece} points={points(polygon)} />
            ))}
          </clipPath>
        ))}
        <pattern
          id={hatchId}
          patternUnits="userSpaceOnUse"
          width="1.5"
          height="1.5"
          patternTransform="rotate(45)"
        >
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="1.5"
            stroke="#304c3e"
            strokeWidth=".25"
          />
        </pattern>
      </defs>
      {filled.map(({ zone }) =>
        zone.polygons.map((polygon, piece) => {
          const center = polygon
            .reduce<[number, number]>(
              ([x, y], point) => [x + point[0], y + point[1]],
              [0, 0],
            )
            .map((value) => value / polygon.length);
          return (
            <g key={`${zone.id}-${piece}`}>
              <polygon
                points={points(polygon)}
                fill={zone.color}
                fillOpacity=".23"
                stroke={zone.color}
                strokeWidth=".34"
              />
              {labels && (
                <text
                  x={center[0]}
                  y={center[1]}
                  textAnchor="middle"
                  fontSize="1.5"
                  fontWeight="700"
                  fill="#203a2a"
                  stroke="white"
                  strokeWidth=".35"
                  paintOrder="stroke"
                >
                  {zone.name}
                </text>
              )}
            </g>
          );
        }),
      )}
      {pairs.map(([left, right]) => (
        <g
          key={`${left.zone.id}-${right.zone.id}`}
          clipPath={`url(#${clipId(left.index)})`}
        >
          <g clipPath={`url(#${clipId(right.index)})`}>
            <rect
              x="0"
              y="0"
              width="40"
              height="120"
              fill={`url(#${hatchId})`}
              opacity=".8"
            />
          </g>
        </g>
      ))}
    </g>
  );
}
