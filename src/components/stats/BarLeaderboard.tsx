/**
 * Animated ranked bar chart — the Bars view on every stats tab.
 *
 * Presentational only: callers sort, slice, format *and* color. That is what lets one component serve
 * champions, teams and players, which arrive as three unrelated shapes — and color has to come from
 * the caller because only it knows whether a high value is good (see `rampColor` in `lib/statUi.ts`).
 *
 * It was dead code until this refactor. The Leaderboard had grown its own inline copy that gained three
 * things this one lacked — zero-centerd scaling for signed stats, Infinity handling, and the compare
 * selection dots — while losing the grow-from-zero animation. Both sets are folded in here and the
 * inline copy is gone.
 */

import { MEDAL_COLORS } from "../../lib/statUi";
import { teamGradient } from "../../lib/teamStyle";
import { PlayerLink } from "../profile/PlayerLink";

export interface BarLeaderboardRow {
  /** Stable key. For players this is the per-role row key, not the player id. */
  key: string;
  /**
   * Position label, when it isn't just the row's place in the list.
   *
   * Records boards need this: ties share a rank there, so two rows both reading `T-1` is the truth and
   * numbering them 1 and 2 is not.
   */
  rank?: string;
  name: string;
  /** When present, the name is a durable player reference rather than an ordinary row label. */
  profileId?: number | null;
  sub?: string;
  /** Numeric value used for bar length. May be negative or Infinity. */
  value: number;
  /** Pre-formatted value shown at the end of the bar. */
  display: string;
  /**
   * Bar color. Supplied by the caller because only it knows whether a high value is good — see
   * `rampColor` in `lib/statUi.ts`. Also used for the block that stands in for a missing logo.
   */
  color?: string;
  /**
   * Where the bar's gradient ends, when the subject has a second color — a team's `colorSecondary`,
   * via `secondaryHex`. Without it the bar fades `color` out toward transparent, which is the look
   * every team had before the column existed and the one a team with no secondary keeps.
   */
  colorEnd?: string;
  logo?: string;
}

interface Props {
  title: string;
  rows: readonly BarLeaderboardRow[];
  badge?: string;
  /** A line under the title — "Click a row to compare", and similar. */
  note?: string;
  caption?: React.ReactNode;
  isMobile?: boolean;
  emptyMessage?: string;
  /**
   * Gold/silver/bronze on the first three ranks. Pass false when the list is not a top-N — in an
   * unsliced "all" view the first row is just the first row, not a medal.
   */
  medals?: boolean;
  /** Rows the caller has selected, in slot order. Enables the trailing color dot. */
  selectedKeys?: readonly string[];
  selectColors?: readonly string[];
  onSelect?: (key: string) => void;
}

export function BarLeaderboard({
  title,
  rows,
  badge,
  note,
  caption,
  isMobile = false,
  emptyMessage = "No qualifying rows found.",
  medals = true,
  selectedKeys,
  selectColors,
  onSelect,
}: Props) {
  // Scaled on absolute value so a signed stat is zero-centerd: a −400 gold diff has to draw as a
  // short bar, not the longest one on the board. Non-finite values (a deathless KDA) are pinned to
  // the maximum, since they sort to the top but cannot be scaled.
  const max = rows.reduce((m, r) => (Number.isFinite(r.value) ? Math.max(m, Math.abs(r.value)) : m), 0);

  return (
    <div className={`bg-bg2 border border-border rounded-lg ${isMobile ? "px-3 py-4" : "px-5 py-5"}`}>
      <div className="flex justify-between items-baseline mb-1">
        <h3 className="font-display text-base text-text-bright tracking-widest m-0">{title}</h3>
        {badge && <span className="text-[10px] text-text-dim font-heading tracking-wider">{badge}</span>}
      </div>
      {note && <p className="text-[11px] text-text-dim mb-4">{note}</p>}

      {rows.length === 0 ? (
        <div className="py-5 text-center text-text-dim text-[13px]">{emptyMessage}</div>
      ) : (
        // No inner scroll container: the table this sits beside grows to its full height and uses the
        // page scrollbar, and a scrollbar nested inside a scrolling page is two competing gestures.
        <div>
          {rows.map((row, i) => {
            const isTop3 = medals && i < 3;
            const magnitude = Number.isFinite(row.value) ? Math.abs(row.value) : max;
            const width = max > 0 ? (magnitude / max) * 100 : 0;
            // No color means the team has none set upstream, which is common. A theme-aware neutral
            // reads on both backgrounds; a hex fallback would be invisible on one of them.
            const brand = row.color;
            const fill = brand
              ? `linear-gradient(90deg, ${brand}, ${row.colorEnd ?? `${brand}88`})`
              : "var(--bar-unset)";
            // The stand-in for a missing logo is the same badge gradient the rest of the site draws
            // for that team, so the block reads as the team and not as a swatch of the bar.
            const block = brand
              ? row.colorEnd
                ? teamGradient(brand, row.colorEnd)
                : brand
              : "var(--bar-unset)";
            const slot = selectedKeys?.indexOf(row.key) ?? -1;
            const selected = slot >= 0;

            const body = (
              <>
                <span
                  // Wide enough for a `T-1` tie label, so a tied row doesn't push its own bar out of
                  // line with the untied rows above it.
                  className="font-display font-bold text-right min-w-[34px] shrink-0"
                  style={{
                    fontSize: isTop3 ? 18 : 13,
                    color: isTop3 ? MEDAL_COLORS[i] : "var(--text-secondary)",
                    textShadow: isTop3 ? `0 0 8px ${MEDAL_COLORS[i]}44` : "none",
                  }}
                >
                  {row.rank ?? i + 1}
                </span>

                <div
                  className={`flex items-center gap-2 shrink-0 ${
                    isMobile ? "min-w-[104px] max-w-[104px]" : "min-w-[176px] max-w-[176px]"
                  }`}
                >
                  {row.logo ? (
                    <img
                      src={row.logo}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="rounded object-contain shrink-0"
                      style={{ width: 20, height: 20 }}
                    />
                  ) : (
                    <span className="rounded shrink-0" style={{ width: 20, height: 20, background: block }} />
                  )}
                  <div className="min-w-0">
                    <PlayerLink
                      profileId={row.profileId}
                      stopPropagation
                      className={`block truncate font-heading text-[13px] no-underline hover:text-brand ${
                        isTop3 ? "text-text-bright font-bold" : "text-text font-medium"
                      }`}
                    >
                      {row.name}
                    </PlayerLink>
                    {row.sub && (
                      <div className="text-[10px] text-text-secondary font-heading tracking-wide truncate">{row.sub}</div>
                    )}
                  </div>
                </div>

                <div className={`flex-1 bg-bg rounded overflow-hidden ${isTop3 ? "h-[24px]" : "h-[20px]"}`}>
                  {/*
                    Two animations doing two jobs. `transition-[width]` carries a bar that survived a
                    data change from its old width to its new one. `bar-grow` scales in a bar that was
                    just mounted, which has no old width to transition from — the case that made most
                    bars appear instantly after a stat change.
                  */}
                  <div
                    className="h-full rounded transition-[width] duration-[600ms]"
                    style={{
                      width: `${width}%`,
                      background: fill,
                      transitionTimingFunction: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
                      boxShadow: isTop3 && brand ? `0 0 12px ${brand}44` : "none",
                      opacity: row.value < 0 ? 0.45 : isTop3 ? 1 : 0.8,
                      transformOrigin: "left",
                      animation: "bar-grow 600ms cubic-bezier(0.25, 0.46, 0.45, 0.94)",
                    }}
                  />
                </div>

                <span
                  className={`font-mono text-right shrink-0 ${
                    isTop3 ? "text-text-bright font-bold text-[14px]" : "text-text-secondary text-[12px]"
                  } ${isMobile ? "min-w-[52px]" : "min-w-[72px]"}`}
                >
                  {row.display}
                </span>

                {selectedKeys && (
                  <span
                    className="w-2 shrink-0 rounded-full"
                    style={{ height: 16, background: selected ? selectColors?.[slot] ?? "var(--accent)" : "transparent" }}
                  />
                )}
              </>
            );

            const layout = `w-full flex items-center py-1.5 text-left rounded ${
              i < rows.length - 1 ? "mb-1.5" : ""
            } ${isMobile ? "gap-2" : "gap-3"}`;

            return onSelect ? (
              <div
                key={row.key}
                onClick={() => onSelect(row.key)}
                onKeyDown={event => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  onSelect(row.key);
                }}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                className={`${layout} ${selected ? "bg-brand/10" : "hover:bg-bg3"}`}
              >
                {body}
              </div>
            ) : (
              <div key={row.key} className={layout}>
                {body}
              </div>
            );
          })}
        </div>
      )}

      {caption && <div className="mt-2 text-xs text-text-dim">{caption}</div>}
    </div>
  );
}
