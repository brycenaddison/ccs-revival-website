import { useEffect, useState } from "react";

/**
 * Animated top-N bar chart, salvaged from the previous stats view.
 *
 * Presentational only — callers sort, slice and format. That keeps it usable for both the
 * home-page stat leaders and the full stats leaderboard, which draw from different shapes.
 */

export interface BarLeaderboardRow {
  /** Stable key. For players this is the per-role row key, not the player id. */
  key: string;
  name: string;
  sub?: string;
  /** Numeric value used for bar length. */
  value: number;
  /** Pre-formatted value shown at the end of the bar. */
  display: string;
  /** Bar colour, usually the team's primary. */
  color?: string;
  logo?: string;
}

interface Props {
  title: string;
  rows: readonly BarLeaderboardRow[];
  badge?: string;
  isMobile?: boolean;
  emptyMessage?: string;
}

const RANK_COLORS = ["#FFD700", "#C0C0C0", "#CD7F32"];

export function BarLeaderboard({
  title,
  rows,
  badge,
  isMobile = false,
  emptyMessage = "No qualifying players found.",
}: Props) {
  // Bars grow from zero whenever the dataset changes, which is the whole point of the chart.
  const signature = rows.map(r => r.key).join("|") + "::" + title;
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    setGrown(false);
    const id = window.setTimeout(() => setGrown(true), 50);
    return () => window.clearTimeout(id);
  }, [signature]);

  const max = rows.length > 0 ? Math.max(...rows.map(r => (Number.isFinite(r.value) ? r.value : 0))) : 1;

  return (
    <div className={`bg-bg2 border border-border rounded-lg ${isMobile ? "px-3 py-4" : "px-6 py-6"}`}>
      <div className="flex justify-between items-center mb-5">
        <h3 className="font-display text-base text-text-bright tracking-widest m-0">{title}</h3>
        {badge && <span className="text-[10px] text-accent font-heading tracking-wider">{badge}</span>}
      </div>

      {rows.length === 0 ? (
        <div className="py-5 text-center text-text-dim text-[13px]">{emptyMessage}</div>
      ) : (
        rows.map((row, i) => {
          const isTop3 = i < 3;
          const safeValue = Number.isFinite(row.value) ? row.value : max;
          const pct = max > 0 ? (safeValue / max) * 100 : 0;
          const color = row.color || "#555";
          return (
            <div
              key={row.key}
              className={`flex items-center py-1.5 ${i < rows.length - 1 ? "mb-2" : ""} ${isMobile ? "gap-2" : "gap-3"}`}
            >
              <span
                className="font-display font-bold text-right min-w-[24px]"
                style={{
                  fontSize: isTop3 ? 18 : 14,
                  color: isTop3 ? RANK_COLORS[i] : "var(--text-muted)",
                  textShadow: isTop3 ? `0 0 8px ${RANK_COLORS[i]}44` : "none",
                }}
              >
                {i + 1}
              </span>

              <div className={`flex items-center gap-2 shrink-0 ${isMobile ? "min-w-[90px]" : "min-w-[140px]"}`}>
                {row.logo ? (
                  <img
                    src={row.logo}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="rounded object-contain shrink-0"
                    style={{ width: isMobile ? 18 : 22, height: isMobile ? 18 : 22 }}
                  />
                ) : (
                  <span
                    className="rounded shrink-0"
                    style={{ width: isMobile ? 18 : 22, height: isMobile ? 18 : 22, background: color }}
                  />
                )}
                <div className="min-w-0">
                  <div
                    className={`font-heading truncate ${isTop3 ? "text-text-bright font-bold text-sm" : "text-text font-medium text-[13px]"}`}
                  >
                    {row.name}
                  </div>
                  {row.sub && (
                    <div className="text-[9px] text-text-muted font-heading tracking-wide">{row.sub}</div>
                  )}
                </div>
              </div>

              <div className={`flex-1 bg-bg rounded overflow-hidden relative ${isTop3 ? "h-[26px]" : "h-[22px]"}`}>
                <div
                  className="h-full rounded transition-[width] duration-[600ms]"
                  style={{
                    background: `linear-gradient(90deg, ${color}, ${color}88)`,
                    width: grown ? `${pct}%` : "0%",
                    transitionTimingFunction: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
                    boxShadow: isTop3 ? `0 0 12px ${color}44` : "none",
                    opacity: isTop3 ? 1 : 0.8,
                  }}
                />
              </div>

              <span
                className={`font-mono text-right ${isTop3 ? "text-text-bright font-bold text-[15px]" : "text-text-secondary font-normal text-[13px]"} ${isMobile ? "min-w-[44px]" : "min-w-[56px]"}`}
              >
                {row.display}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}
