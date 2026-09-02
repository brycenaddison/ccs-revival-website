/**
 * Percentile radar for up to three players.
 *
 * SVG rather than the old dashboard's `<canvas>`: the grid and labels then inherit the theme's
 * colors through CSS variables, so the chart follows the light/dark toggle instead of needing a
 * repaint hook, and the axis labels stay real text.
 */

import type { RadarPoint } from "../../lib/statViews";

export interface RadarSeries {
  key: string;
  label: string;
  color: string;
  points: RadarPoint[];
}

interface Props {
  series: readonly RadarSeries[];
  size?: number;
}

/** Rings drawn behind the shapes, at these fractions of the radius. */
const RINGS = [0.25, 0.5, 0.75, 1];

export function CompareRadar({ series, size = 260 }: Props) {
  const axes = series[0]?.points ?? [];
  if (axes.length < 3) return null;

  const cx = size / 2;
  const cy = size / 2;
  // Leaves room for the axis labels, which sit outside the outer ring.
  const r = size / 2 - 34;

  // Start at 12 o'clock and go clockwise, so the first axis reads as the "top" of the shape.
  const angleAt = (i: number): number => (i / axes.length) * Math.PI * 2 - Math.PI / 2;
  const pointAt = (i: number, frac: number): [number, number] => {
    const a = angleAt(i);
    return [cx + Math.cos(a) * r * frac, cy + Math.sin(a) * r * frac];
  };
  const polygon = (fracs: readonly number[]): string =>
    fracs.map((f, i) => pointAt(i, f).join(",")).join(" ");

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Player comparison radar">
      {RINGS.map(ring => (
        <polygon
          key={ring}
          points={polygon(axes.map(() => ring))}
          fill="none"
          stroke="var(--border)"
          strokeWidth={1}
        />
      ))}

      {axes.map((axis, i) => {
        const [x, y] = pointAt(i, 1);
        // Nudged outward along the same angle so labels clear the outer ring.
        const [lx, ly] = pointAt(i, 1.18);
        return (
          <g key={axis.label}>
            <line x1={cx} y1={cy} x2={x} y2={y} stroke="var(--border)" strokeWidth={1} />
            <text
              x={lx}
              y={ly}
              textAnchor={Math.abs(lx - cx) < 6 ? "middle" : lx > cx ? "start" : "end"}
              dominantBaseline="middle"
              fontSize={9}
              fill="var(--text-secondary)"
              style={{ fontFamily: "var(--font-heading, inherit)", letterSpacing: "0.05em", textTransform: "" }}
            >
              {axis.label}
            </text>
          </g>
        );
      })}

      {series.map(s => (
        <g key={s.key}>
          <polygon
            // A shape pinned at zero on every axis collapses to a point; floor it so it stays visible.
            points={polygon(s.points.map(p => Math.max(p.scaled, 0.04)))}
            fill={s.color}
            fillOpacity={0.16}
            stroke={s.color}
            strokeWidth={2}
            strokeLinejoin="round"
          />
          {s.points.map((p, i) => {
            const [x, y] = pointAt(i, Math.max(p.scaled, 0.04));
            return <circle key={p.label} cx={x} cy={y} r={2.5} fill={s.color} />;
          })}
        </g>
      ))}
    </svg>
  );
}
