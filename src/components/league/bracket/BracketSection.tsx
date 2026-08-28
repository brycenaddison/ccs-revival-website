/**
 * Bracket — the League Admin section for seeding a playoff bracket.
 *
 * The public bracket, with a team picker in every **entry** slot. That is the entire write surface:
 * `PATCH /tournaments/schedule/:id` with `teamAId` / `teamBId`, the same call `MatchEditor` makes,
 * and the same one a league admin already has for any other match. Seeds, wiring, match days and
 * which nodes exist are structure, are site-admin only, and are not editable here — they are not
 * even rendered as though they might be.
 *
 * Deliberately the same component as the public view, given a `slotControl`. A second bracket layout
 * that had to be kept in agreement with the first is the thing this avoids: what an admin arranges is
 * pixel-for-pixel what a viewer will see.
 *
 * **A derived slot gets no picker at all**, rather than a disabled one. It already reads "Winner of
 * Match 7", which says more than a grayed-out box could, and it is filled by propagation the moment
 * the source is decided — see the Resync button below.
 *
 * Two things this screen cannot do, both downstream of one decision:
 *
 *  1. `GET /:conf/season` is fetched **anonymously** — see the header on `api/seasonView.ts`, where
 *     the reasoning lives. So an **unpublished bracket phase does not appear here**. Publish it, or
 *     seed it in Site Admin → Season Structure. Making this read credentialed would break the
 *     invariant that an admin sees the season everyone else sees, which is worth more than this.
 *  2. The season document names teams by `code`, and a PATCH wants an id, so the conf's team list is
 *     the join. A slot holding a team that is not in `/teams/:conf` shows as unset rather than
 *     mislabeled — it cannot happen through this screen, only through a team moving conference.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { Toast } from "../../Toast";
import { ACTION_SM, ErrorLine, Pill } from "../../admin/adminUi";
import { PhaseTabs } from "../../season/PhaseTabs";
import { BracketPhaseView } from "../../season/BracketPhaseView";
import { StandingsReference, type ReferenceTable } from "../../season/StandingsReference";
import { useSeason } from "../../../hooks/useSeason";
import { useWindowSize } from "../../../hooks/useWindowSize";
import { queries, queryRoots } from "../../../lib/queries";
import {
  editMatch,
  errorMessage,
  isBracketPhase,
  isGroupPhase,
  propagatePhase,
  type MatchEdit,
  type SeasonBracketMatch,
  type SeasonBracketSide,
  type SeasonPayload,
  type SlotSide,
  type TeamRecord,
} from "../../../lib/api";

/**
 * Taller than the public bracket's 150, because every entry slot carries a `<select>`.
 *
 * The layout only promises a full row unit between two cards in a column, so this has to clear the
 * tallest card *this* screen can produce — a pending match with a picker on both rows and a kickoff
 * line underneath.
 */
const ADMIN_ROW_PITCH = 176;

export function BracketSection() {
  const { conf = "" } = useParams();
  const isMobile = useWindowSize() < 768;
  const { season, loading, error, refetch } = useSeason(conf);
  const teams = useQuery(queries.teamsForConf(conf));
  const [saved, setSaved] = useState<string | null>(null);
  const [picked, setPicked] = useState<number | null>(null);

  const brackets = useMemo(() => (season?.phases ?? []).filter(isBracketPhase), [season]);
  const phase = brackets.find(p => p.id === picked) ?? brackets[0] ?? null;

  // Only group phases the bracket could actually be seeded from — a later one has not been played.
  const reference = useMemo<ReferenceTable[]>(
    () => (phase ? groupTables(season, phase.ordinal) : []),
    [season, phase],
  );

  // Waits for the team list too, not only the season. Without it every picker resolves its current
  // team to null for a frame and the bracket flashes a screen of "— TBD —" over slots that are set.
  // A *failed* team load is not pending, so it falls through to the notice below.
  if (loading || teams.isPending) return <p className="text-text-dim">Loading the season…</p>;

  if (error) {
    return (
      <div className="flex flex-col items-start gap-3">
        <ErrorLine message={`Couldn't load the season: ${error}`} />
        <button type="button" onClick={refetch} className={ACTION_SM}>
          Try again
        </button>
      </div>
    );
  }

  if (!phase) {
    return (
      <p className="py-6 text-center text-text-dim">
        No published bracket phase in this league. A bracket that is still a draft is seeded in Site
        Admin until it is published.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm leading-relaxed text-text-secondary">
        Pick who plays each seeded position. Slots fed by an earlier match fill in on their own once
        it is decided — press <strong className="text-text-bright">Resync bracket</strong> after
        recording a result. Which matches exist, how they are wired and what the seeds are called is
        set in Site Admin.
      </p>

      <PhaseTabs
        phases={brackets}
        selectedId={phase.id}
        activeId={season?.activePhaseId ?? null}
        onSelect={setPicked}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-2.5">
          <span className="font-display text-lg tracking-widest text-text-bright">
            {phase.name.toUpperCase()}
          </span>
          <Pill muted>
            {phase.matchDays} match {phase.matchDays === 1 ? "day" : "days"}
          </Pill>
        </div>
        <Resync conf={conf} phaseId={phase.id} />
      </div>

      {teams.isError && (
        <ErrorLine
          message={`Couldn't load the team list, so the pickers are empty: ${errorMessage(teams.error)}`}
        />
      )}

      {/*
        `minmax(0, 1fr)` and not `1fr`. A bare `1fr` is `minmax(auto, 1fr)`, and that `auto` floor
        sizes the track from its content's min-content width — so a 2000px bracket would widen the
        column past the page instead of scrolling inside it. This is the same reason `SectionFrame`
        carries `min-w-0`.
      */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        {/*
          Wrapped, because `BracketPhaseView` returns a fragment — the canvas and its legend. Dropped
          straight into the grid those become *two* items, and the legend would take the sidebar's
          cell. `min-w-0` says the same thing as the track's `minmax(0, …)`, one level down.
        */}
        <div className="min-w-0">
          {/* Keyed on the phase so switching one throws away every picker's in-flight state. */}
          <BracketPhaseView
            key={phase.id}
            phase={phase}
            conf={conf}
            isMobile={isMobile}
            rowPitch={ADMIN_ROW_PITCH}
            bleed={false}
            slotControl={(slot, side, match) =>
              // A derived slot keeps the viewer's rendering: "Winner of Match 7" is the honest
              // answer, and there is nothing here for anyone to set.
              side.from ? null : (
                <SlotPicker
                  key={`${match.matchId}:${slot}`}
                  match={match}
                  slot={slot}
                  side={side}
                  teams={teams.data ?? []}
                  onSaved={setSaved}
                />
              )
            }
          />
        </div>

        {/*
          Deliberately *not* `items-start` on the grid. A sticky child can only travel inside its
          containing block, so the aside has to stretch to the row's full height — which the default
          `align-items: stretch` gives it — for the panel inside to stay put while the bracket
          scrolls past. `top-16` clears the nav, which pins at the top of every page.
        */}
        <aside>
          <div className="sticky top-16 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-lg border border-border p-3">
            <StandingsReference compact tables={reference} />
          </div>
        </aside>
      </div>

      <Toast message={saved} onClose={() => setSaved(null)} />
    </div>
  );
}

/** Every group phase before `ordinal`, as the reference panel's tables. */
function groupTables(season: SeasonPayload | null, ordinal: number): ReferenceTable[] {
  if (!season) return [];

  return season.phases
    .filter(isGroupPhase)
    .filter(p => p.ordinal < ordinal)
    .flatMap(p =>
      p.groups.map(group => ({
        key: `${p.id}:${group.ordinal}:${group.name}`,
        heading: `${p.name} · Group ${group.name}`,
        rows: group.standings.map(row => ({
          key: row.code,
          place: row.place,
          code: row.code,
          tied: row.tied,
          seriesWins: row.seriesWins,
          seriesLosses: row.seriesLosses,
          scenario: row.scenario,
        })),
      })),
    );
}

function Resync({ conf, phaseId }: { conf: string; phaseId: number }) {
  const qc = useQueryClient();
  const [note, setNote] = useState<string | null>(null);

  /**
   * Re-derives every downstream team in this phase from the results that exist now.
   *
   * Idempotent, so this is a safe button rather than a dangerous one: it reports only what it
   * rewrote, and it clears as well as sets — a corrected upstream result sends the downstream team
   * back to null to be re-derived. Strictly weaker than the picker beside it, which is why it is on
   * this screen at all: it writes only into slots propagation already owns, and only what the
   * recorded results imply.
   */
  const propagate = useMutation({
    mutationFn: () => propagatePhase(conf, phaseId),
    onSuccess: async updates => {
      await refreshBracket(qc);
      setNote(
        updates.length === 0
          ? "Nothing was stale — every derived team already matches the results."
          : `Re-derived ${updates.length} ${updates.length === 1 ? "team" : "teams"}.`,
      );
    },
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {note && <span className="text-xs text-text-secondary">{note}</span>}
      {/* Inline rather than `ErrorLine`, which carries an `mt-3` meant for a block under a form. */}
      {propagate.isError && (
        <span role="alert" className="text-xs text-ccs-red">
          {errorMessage(propagate.error)}
        </span>
      )}
      <button
        type="button"
        onClick={() => propagate.mutate()}
        disabled={propagate.isPending}
        title="Fills in every team this bracket's results imply. Safe to press any time — it also clears a team whose result was corrected."
        className={ACTION_SM}
      >
        <RefreshCw size={13} aria-hidden="true" />
        {propagate.isPending ? "Resyncing…" : "Resync bracket"}
      </button>
    </div>
  );
}

/**
 * Everything a seeding change touches.
 *
 * `season` is the bracket on this screen and on the Standings tab; `schedule` is the day view in the
 * next section along; `standings` is the group table a result feeds. `MatchEditor` already
 * invalidates the last two — the season root is the one this screen adds.
 */
function refreshBracket(qc: ReturnType<typeof useQueryClient>): Promise<unknown> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: queryRoots.season }),
    qc.invalidateQueries({ queryKey: queryRoots.schedule }),
    qc.invalidateQueries({ queryKey: queryRoots.standings }),
  ]);
}

function SlotPicker({
  match,
  slot,
  side,
  teams,
  onSaved,
}: {
  match: SeasonBracketMatch;
  slot: SlotSide;
  side: SeasonBracketSide;
  teams: readonly TeamRecord[];
  onSaved: (message: string) => void;
}) {
  const qc = useQueryClient();

  // The season document names teams by code; a PATCH wants an id. Unknown code resolves to null,
  // which shows as unset rather than as some other team.
  const idOf = (code: string | undefined): number | null =>
    (code === undefined ? undefined : teams.find(t => t.code === code)?.id) ?? null;

  const current = idOf(side.team?.code);
  const opposite = idOf((slot === "top" ? match.bottom : match.top).team?.code);

  const save = useMutation({
    mutationFn: (id: number | null) => {
      // Written out rather than a computed key: that widens the object to an index signature, which
      // is no longer assignable to `MatchEdit`.
      const patch: MatchEdit = slot === "top" ? { teamAId: id } : { teamBId: id };
      return editMatch(match.matchId, patch);
    },
    onSuccess: async () => {
      await refreshBracket(qc);
      onSaved("Slot saved.");
    },
  });

  return (
    <div className="min-w-0">
      <select
        value={current ?? ""}
        disabled={save.isPending}
        aria-label={`${slot === "top" ? "Top" : "Bottom"} team${side.seed ? `, seed ${side.seed}` : ""}`}
        onChange={e => save.mutate(e.target.value === "" ? null : Number(e.target.value))}
        className={`w-full cursor-pointer truncate rounded border bg-bg-input px-1.5 py-1 font-heading text-[12px] text-text ${
          save.isError ? "border-ccs-red" : "border-border"
        }`}
      >
        <option value="">— TBD —</option>
        {teams
          .filter(t => t.id !== opposite)
          .map(t => (
            <option key={t.id} value={t.id}>
              {t.code} — {t.name}
            </option>
          ))}
      </select>
      {save.isError && (
        <p className="mt-0.5 text-[10px] text-ccs-red">{errorMessage(save.error)}</p>
      )}
    </div>
  );
}
