/**
 * The Standings tab: one conference's season, a tab per phase.
 *
 * Everything here comes from `GET /:conf/season`, which is the read built for this page. What that
 * replaced is worth naming, because it explains the shape: the tab used to be a single table of
 * `/standings/:conf` — season-wide records, so a group table silently counted playoff results — beside
 * a legend hard-coded to an eight-team format the API never confirmed. Both are gone. Records are
 * scoped to the phase, and every outcome shown is one the league actually configured.
 *
 * **One conference at a time.** With several running, a strip picks one and only that one is fetched.
 * A season is per-conference: two divisions can be on different phases with different groups and
 * different brackets, and a merged table describes a competition nobody is playing.
 */

import { useMemo, useState } from "react";
import { useLeague } from "../../lib/leagueContext";
import { useSeason } from "../../hooks/useSeason";
import { groupLabels } from "../../lib/leagueAdapters";
import { isBracketPhase } from "../../lib/api";
import { GroupPhaseView } from "../season/GroupPhaseView";
import { BracketPhaseView } from "../season/BracketPhaseView";
import { PhaseTabs } from "../season/PhaseTabs";

interface Props {
  isMobile: boolean;
}

export function StandingsView({ isMobile }: Props) {
  const { tournaments, selectedConfs } = useLeague();

  /*
   * Which conference, when several are running.
   *
   * Held here rather than pushed into `?conf=` — and it must **not** call `setSelection`. That
   * collapses `selectedConfs` to the one conf, which makes `selectedConfs.length > 1` false, which
   * makes this strip vanish the instant it is used.
   */
  const [confPick, setConfPick] = useState<string | null>(null);
  const conf = (confPick && selectedConfs.includes(confPick) ? confPick : selectedConfs[0]) ?? null;

  const labels = useMemo(() => groupLabels(tournaments, selectedConfs), [tournaments, selectedConfs]);

  return (
    <div className="mx-auto max-w-[1200px]">
      <h2 className="mb-4 font-display text-[22px] text-text-bright">Standings</h2>

      {/* `overflow-y-hidden` because `overflow-x` being set at all makes `overflow-y` compute to
          `auto`, and a single row of buttons has no business owning a vertical scrollbar. */}
      {selectedConfs.length > 1 && (
        <div className="mb-4 flex flex-nowrap gap-4 overflow-x-auto overflow-y-hidden">
          {selectedConfs.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setConfPick(c)}
              className={`shrink-0 cursor-pointer border-none bg-transparent p-0 font-heading text-[12px] ${
                c === conf ? "text-text-bright" : "text-text-muted"
              }`}
            >
              {labels.get(c) ?? c.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {/*
        Keyed on the conf so switching one throws away the phase selection, the bracket's scroll
        position and its measured card boxes in a single gesture. Phase ids are conf-scoped, so
        carrying one across would select nothing; doing it with effects instead would need three of
        them and would still render once with conf B under a phase id from conf A.
      */}
      {conf ? <SeasonPanel key={conf} conf={conf} isMobile={isMobile} /> : <Empty />}
    </div>
  );
}

function Empty() {
  return <div className="py-10 text-center text-[13px] text-text-dim">Standings aren&rsquo;t available yet.</div>;
}

function SeasonPanel({ conf, isMobile }: { conf: string; isMobile: boolean }) {
  const { season, loading, error, refetch } = useSeason(conf);

  /*
   * The phase tab.
   *
   * Only the reader's explicit pick is stored; everything else is resolved from the payload on every
   * render. That is what stops a background refetch from moving the tab out from under someone:
   * once `picked` is set, `activePhaseId` is never consulted again. Before any pick it is null and
   * the server's choice wins on the first render data exists — no effect, no flash, no second render.
   *
   * Validating `picked` against the phases actually present is what makes a stale pick self-heal: a
   * phase that gets unpublished falls back to the server's choice instead of rendering a blank tab.
   */
  const [picked, setPicked] = useState<number | null>(null);

  const phases = season?.phases ?? [];
  const known = (id: number | null | undefined): number | null =>
    id != null && phases.some(p => p.id === id) ? id : null;
  const phaseId = known(picked) ?? known(season?.activePhaseId) ?? phases[0]?.id ?? null;
  const phase = phases.find(p => p.id === phaseId) ?? null;

  if (loading) return <div className="py-10 text-center text-[13px] text-text-dim">Loading standings…</div>;

  if (error) {
    return (
      <div className="mx-auto mt-8 max-w-[500px] px-5 text-center">
        <p className="mb-4 text-sm leading-relaxed text-text-muted">{error}</p>
        <button
          onClick={refetch}
          className="cursor-pointer rounded-md border-none bg-brand px-7 py-3 font-heading text-sm font-medium text-white"
        >
          Try again
        </button>
      </div>
    );
  }

  // `getOne` folds a missing route to null, so this covers an unknown conference *and* an API old
  // enough not to serve `/season` at all. Both are absence, and a viewer reads them the same way.
  if (!season) return <Empty />;

  if (!phase) {
    return <div className="py-10 text-center text-[13px] text-text-dim">This season hasn&rsquo;t been set up yet.</div>;
  }

  return (
    <>
      <PhaseTabs
        phases={phases}
        selectedId={phase.id}
        activeId={season.activePhaseId}
        onSelect={setPicked}
      />

      {/* With one phase there is no strip, so the heading is the only thing naming what is on screen. */}
      {phases.length < 2 && (
        <div className="mb-4 font-heading text-[13px] text-text-secondary">
          {phase.name}
        </div>
      )}

      {isBracketPhase(phase) ? (
        <BracketPhaseView phase={phase} conf={conf} isMobile={isMobile} />
      ) : (
        <GroupPhaseView phase={phase} conf={conf} isMobile={isMobile} />
      )}
    </>
  );
}
