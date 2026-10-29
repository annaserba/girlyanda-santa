const bulbs = [
  { x: 40, y: 13, color: "#bd5750" },
  { x: 144, y: 23, color: "#d9a943" },
  { x: 248, y: 30, color: "#628368" },
  { x: 352, y: 35, color: "#d9a943" },
  { x: 456, y: 38, color: "#bd5750" },
  { x: 560, y: 39, color: "#d9a943" },
  { x: 664, y: 38, color: "#628368" },
  { x: 768, y: 35, color: "#d9a943" },
  { x: 872, y: 30, color: "#bd5750" },
  { x: 976, y: 23, color: "#d9a943" },
  { x: 1080, y: 13, color: "#628368" },
];

/** Decorative, local and static: lights never represent participant/gift state. */
export function AdminHolidayLights() {
  return (
    <div className="admin-holiday-lights" aria-hidden="true">
      <svg viewBox="0 0 1120 80" fill="none" focusable="false">
        <path d="M-30 6 Q560 72 1150 6" stroke="#83947d" strokeWidth="1.6" />
        {bulbs.map(({ x, y, color }) => (
          <g key={x} transform={`translate(${x} ${y})`}>
            <path d="M0 0V6" stroke="#83947d" strokeWidth="1.6" />
            <ellipse
              className="admin-holiday-bulb"
              cy="16"
              rx="5"
              ry="8"
              fill={color}
              style={{ color }}
            />
            <rect x="-3.5" y="5" width="7" height="5" rx="1.5" fill="#667a61" />
            <path
              d="M-1.5 13V16"
              stroke="#fffaf0"
              strokeOpacity=".65"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </g>
        ))}
      </svg>
    </div>
  );
}
