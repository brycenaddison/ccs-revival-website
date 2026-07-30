/**
 * The player comparison, pinned to the bottom of the viewport.
 *
 * It used to sit at the end of the page, below however many table rows the filters happened to produce,
 * so the best thing on the Stats page was the thing nobody scrolled to. Pinning it means selecting a
 * second player shows you the comparison immediately.
 *
 * No collapse control: it is absent until something is selected and present while it is, which is one
 * fewer piece of state and one fewer thing to explain.
 *
 * Mobile and desktop lay out differently on purpose. Desktop has the width for the radar and every
 * player column side by side. Mobile does not, and stacking them made the dock the only vertically
 * scrolling panel in the app — so the columns become a swipe deck, one player at a time, with the radar
 * above it because that is the part worth seeing without interacting.
 *
 * Position: `MobileBottomBar` is `fixed bottom-0 z-[200]`, and `--bottom-nav-h` in index.css carries its
 * height, so this sits exactly on top of it and below it in stacking order. The Toast at `z-[999]` still
 * wins over both.
 */

import { useState } from "react";
import { roleLabel, type PlayerStats } from "../../lib/api";
import { shortName } from "../../lib/statViews";
import { COMPARE_COLORS } from "../../lib/statUi";
import { CompareRadar, type RadarSeries } from "./CompareRadar";

/**
 * Desktop height cap, and the bottom padding the page reserves while the dock is open.
 *
 * Reserving the cap rather than the measured height over-reserves whenever the dock is shorter, which
 * costs a little empty scroll. The other error — reserving too little — hides table rows behind the dock
 * with no way to reach them, so the padding errs generous.
 */
export const COMPARE_DOCK_MAX = "45vh";

interface Props {
  players: readonly PlayerStats[];
  series: readonly RadarSeries[];
  /** How many players passed the filters — the population each percentile is measured against. */
  poolSize: number;
  onClear: () => void;
  isMobile: boolean;
}

/** One player's axis readout. Identical in both layouts; only the container differs. */
function PlayerColumn({
  player,
  slot,
  points,
}: {
  player: PlayerStats;
  slot: number;
  points: RadarSeries["points"] | undefined;
}) {
  return (
    <div className="bg-bg3 border border-border rounded-lg p-3 relative overflow-hidden">
      <span className="absolute top-0 left-0 right-0 h-0.5" style={{ background: COMPARE_COLORS[slot] }} />
      <div className="font-heading font-bold text-sm text-text-bright truncate">{shortName(player.name)}</div>
      <div className="text-[10px] text-text-muted font-heading tracking-wide mb-2">
        {player.team} · {roleLabel(player.role)} · {player.games}G
      </div>
      {points?.map(pt => (
        <div key={pt.label} className="flex justify-between items-center text-[11px] py-0.5">
          <span className="text-text-secondary">{pt.label}</span>
          <span className="font-mono text-text">{pt.display}</span>
        </div>
      ))}
    </div>
  );
}

export function CompareDock({ players, series, poolSize, onClear, isMobile }: Props) {
  const [slide, setSlide] = useState(0);

  if (players.length === 0) return null;

  // Clamped, because removing a player can leave the index past the end of the deck.
  const active = Math.min(slide, players.length - 1);

  return (
    <div
      className="fixed left-0 right-0 z-[190] bg-bg2 border-t border-border"
      style={{ bottom: isMobile ? "var(--bottom-nav-h)" : 0 }}
    >
      <div
        className="max-w-[1280px] mx-auto"
        style={{
          padding: isMobile ? "10px 12px" : "14px 32px",
          // Desktop can grow into a scroller if three players' axes exceed the cap. Mobile shows one
          // player at a time, so it never needs to.
          maxHeight: isMobile ? undefined : COMPARE_DOCK_MAX,
          overflowY: isMobile ? undefined : "auto",
        }}
      >
        <div className="flex justify-between items-center mb-1">
          <h3 className="font-display text-base text-text-bright tracking-widest m-0">PLAYER COMPARISON</h3>
          <button
            onClick={onClear}
            className="text-[10px] font-heading tracking-wider uppercase text-ccs-red border border-ccs-red rounded px-2.5 py-1 bg-transparent"
          >
            Clear
          </button>
        </div>

        {isMobile ? (
          <>
            <p className="text-[10px] text-text-dim mb-2">
              Percentile within role, among {poolSize} filtered players.
            </p>
            <div className="flex justify-center">
              <CompareRadar series={series} size={130} />
            </div>

            {/* Native scroll-snap, no library — the same idiom ScoreboardTicker uses for its strip. */}
            <div
              onScroll={e => {
                const el = e.currentTarget;
                setSlide(el.clientWidth > 0 ? Math.round(el.scrollLeft / el.clientWidth) : 0);
              }}
              className="flex gap-3 overflow-x-auto snap-x snap-mandatory mt-2"
              style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
            >
              {players.map((p, i) => (
                <div key={p.rowKey} className="snap-center shrink-0 w-full">
                  <PlayerColumn player={p} slot={i} points={series[i]?.points} />
                </div>
              ))}
            </div>

            {players.length > 1 && (
              <div className="flex justify-center gap-1.5 mt-2">
                {players.map((p, i) => (
                  <span
                    key={p.rowKey}
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: COMPARE_COLORS[i], opacity: i === active ? 1 : 0.3 }}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-[11px] text-text-dim mb-3">
              Each axis is a percentile within that player&apos;s own role, among the {poolSize} players passing the
              filters above.
            </p>
            <div className="flex gap-5 items-start">
              <div className="shrink-0">
                <CompareRadar series={series} size={200} />
              </div>
              <div
                className="flex-1 grid gap-3 w-full"
                style={{ gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))" }}
              >
                {players.map((p, i) => (
                  <PlayerColumn key={p.rowKey} player={p} slot={i} points={series[i]?.points} />
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
