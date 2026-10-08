/**
 * League Admin seeding uses the configured bracket or manual-round layout.
 *
 * Entry slots have the same team pickers in either layout. They write through
 * `PATCH /tournaments/schedule/:id`, the same call a league admin has for any other match.
 * Seeds, wiring, match days and
 * which nodes exist are structure, are site-admin only, and are not editable here — they are not
 * even rendered as though they might be.
 *
 * Both presentations use the public view with `slotControl`, so a slot is edited the same way
 * regardless of the phase's presentation.
 *
 * Derived slots show their provenance instead of a picker. Only source wiring owns propagation. A
 * slot seeded from an earlier table is derived too; after Resync, one it left empty shows why (`held`).
 * Only Resync reports that, so a reload shows the plain provenance again.
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

import { useId, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { ErrorLine } from "../../admin/adminUi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TooltipHint } from "../../TooltipHint";
import { PhaseTabs } from "../../season/PhaseTabs";
import { BracketPhaseView } from "../../season/BracketPhaseView";
import { hasBracketFeeders, hasDerivedSlots } from "../../../lib/bracketLayout";
import { StandingsReference, type ReferenceTable } from "../../season/StandingsReference";
import { useSeason } from "../../../hooks/useSeason";
import { useWindowSize } from "../../../hooks/useWindowSize";
import { queries, queryRoots } from "../../../lib/queries";
import { heldAction, heldLabel, propagationSummary, roundIndex, tableStatus } from "../../../lib/seeding";
import {
  editMatch,
  errorMessage,
  isBracketPhase,
  isGroupPhase,
  isSeedFrom,
  propagatePhase,
  type HeldSlot,
  type MatchEdit,
  type PropagationReport,
  type SeasonBracketMatch,
  type SeasonBracketSide,
  type SeasonPayload,
  type SeasonSeedFrom,
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
  const [picked, setPicked] = useState<number | null>(null);
  // The last Resync's held seed slots, kept with the phase they belong to.
  const [held, setHeld] = useState<{ phaseId: number; slots: HeldSlot[] } | null>(null);

  const brackets = useMemo(() => (season?.phases ?? []).filter(isBracketPhase), [season]);
  const phase = brackets.find(p => p.id === picked) ?? brackets[0] ?? null;
  const connected = phase ? hasBracketFeeders(phase) : false;
  const derived = phase ? hasDerivedSlots(phase) : false;
  const manualRounds = phase ? !(phase.bracketView ?? connected) : false;
  const heldSlots = held && phase && held.phaseId === phase.id ? held.slots : [];

  // Only tables the bracket could be seeded from: earlier phases, and this phase's own when its
  // rounds are seeded from it. A later phase has not been played.
  const reference = useMemo<ReferenceTable[]>(
    () => (phase ? seedingTables(season, phase.id, phase.ordinal) : []),
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
        <Button type="button" variant="outline" size="sm" onClick={refetch}>
          Try again
        </Button>
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
        {manualRounds
          ? <>Pick the teams in each round's matchups. Each selection saves immediately.</>
          : <>Pick who plays each seeded position.</>}
        {derived && <> Slots fed by an earlier match or table fill in automatically. Use Resync bracket after recording a result.</>}
        {" "}The phase view, which matches exist and how they are wired are set in Site Admin.
      </p>

      <PhaseTabs
        phases={brackets}
        selectedId={phase.id}
        activeId={season?.activePhaseId ?? null}
        onSelect={setPicked}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-2.5">
          <span className="font-display text-lg text-text-bright">{phase.name}</span>
          <Badge variant="muted">
            {phase.matchDays} match {phase.matchDays === 1 ? "day" : "days"}
          </Badge>
        </div>
        {derived && (
          <Resync conf={conf} phaseId={phase.id} onReport={report => setHeld({ phaseId: phase.id, slots: report.held })} />
        )}
      </div>

      {teams.isError && (
        <ErrorLine
          message={`Couldn't load the team list, so the pickers are empty: ${errorMessage(teams.error)}`}
        />
      )}

      {/*
        `minmax(0, 1fr)` and not `1fr`. A bare `1fr` is `minmax(auto, 1fr)`, and that `auto` floor
        sizes the track from its content's min-content width, so a 2000px bracket would widen the
        column past the page instead of scrolling inside it. This is the same reason `SectionFrame`
        carries `min-w-0`.

        The reference comes first, on the left, so it reads before the bracket it informs and sits on
        the same side as the settings navigation; below `xl` it stacks above the bracket.
      */}
      <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
        {/*
          Deliberately *not* `items-start` on the grid. A sticky child can only travel inside its
          containing block, so the aside has to stretch to the row's full height (which the default
          `align-items: stretch` gives it) for the panel inside to stay put while the bracket
          scrolls past. The offset is from the top of the page's scroller, which `SiteLayout` starts
          under the nav; there is no nav height to clear, because nothing scrolls under the nav.
          The viewport inherits the panel's max height, which is what lets Scroll Area scroll it.
        */}
        <aside aria-label="Standings reference">
          <Card className="sticky top-4 gap-0 py-0">
            <ScrollArea className="max-h-[calc(100dvh-8rem)] [&>[data-slot=scroll-area-viewport]]:max-h-[inherit]">
              <div className="p-3">
                <StandingsReference compact tables={reference} />
              </div>
            </ScrollArea>
          </Card>
        </aside>

        {/*
          Wrapped, because `BracketPhaseView` returns a fragment: the canvas and its legend. Dropped
          straight into the grid those become *two* items, and the legend would take a cell of its
          own. `min-w-0` says the same thing as the track's `minmax(0, …)`, one level down.
        */}
        <div className="min-w-0">
          {/* Pickers belong to this phase's fixture IDs. */}
          <BracketPhaseView
            key={phase.id}
            phase={phase}
            conf={conf}
            isMobile={isMobile}
            rowPitch={ADMIN_ROW_PITCH}
            bleed={false}
            nameGroupPhases={(season?.phases ?? []).filter(isGroupPhase).length > 1}
            slotControl={(slot, side, match) => {
              const reason = isSeedFrom(side.from)
                ? heldSlots.find(h => h.scheduleMatchId === match.matchId && h.side === slot)?.reason
                : undefined;
              if (reason && isSeedFrom(side.from)) {
                return (
                  <HeldSlotNote
                    reason={reason}
                    from={side.from}
                    team={side.team?.name ?? null}
                    own={side.from.phase === phase.id}
                  />
                );
              }
              // A derived slot keeps the viewer's rendering: "Winner of Match 7" is the honest
              // answer, and there is nothing here for anyone to set.
              return side.from ? null : (
                <SlotPicker
                  key={`${match.matchId}:${slot}`}
                  match={match}
                  slot={slot}
                  side={side}
                  teams={teams.data ?? []}
                  onSaved={message => toast.success(message)}
                />
              );
            }}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Every table before `ordinal`, plus this phase's own, as the reference panel's: each group of a
 * group phase, and each bracket phase that serves a standings table. The phase's own table is the
 * one its seeds pick opponents from. This read serves no `final` on a group table, so only bracket
 * tables carry a status.
 */
function seedingTables(season: SeasonPayload | null, phaseId: number, ordinal: number): ReferenceTable[] {
  if (!season) return [];

  return season.phases
    .filter(p => p.ordinal < ordinal || p.id === phaseId)
    .flatMap((p): ReferenceTable[] => {
      if (isGroupPhase(p)) {
        return p.groups.map(group => ({
          key: `${p.id}:${group.ordinal}:${group.name}`,
          heading: `${p.name} · Group ${group.name}`,
          rows: group.standings.map(row => ({
            key: row.code,
            position: row.position,
            place: row.place,
            code: row.code,
            tied: row.tied,
            seriesWins: row.seriesWins,
            seriesLosses: row.seriesLosses,
            scenario: row.scenario,
          })),
        }));
      }
      if (!p.standings) return [];
      const round = roundIndex(
        p.rounds.filter(r => r.matches.length > 0).map(r => r.matchDay),
        p.lockedThrough ?? 0,
      );
      return [
        {
          key: `${p.id}:table`,
          heading: p.id === phaseId ? `${p.name} (this phase)` : p.name,
          status: tableStatus({ kind: "bracket", final: p.final, lockedThrough: p.lockedThrough }, round),
          rows: p.standings.map(row => ({
            key: row.code,
            position: row.position,
            place: row.place,
            code: row.code,
            tied: row.tied,
            seriesWins: row.seriesWins,
            seriesLosses: row.seriesLosses,
            scenario: null,
          })),
        },
      ];
    });
}

/** A seed slot the last Resync left empty, or filled but frozen, and what to do about it. */
function HeldSlotNote({
  reason,
  from,
  team,
  own,
}: {
  reason: HeldSlot["reason"];
  from: SeasonSeedFrom;
  team: string | null;
  /** The slot reads its own phase's table over the earlier rounds. */
  own: boolean;
}) {
  const action = heldAction(reason);
  return (
    <p className="min-w-0 text-[11px] leading-snug text-ccs-orange">
      {/* A frozen slot keeps the team already playing there. */}
      {team && <span className="block truncate font-heading text-[13px] text-text">{team}</span>}
      <span className="block truncate">{heldLabel(reason, from.place, from.phaseName, own)}</span>
      {action && <span className="block text-text-dim">{action}</span>}
    </p>
  );
}

function Resync({
  conf,
  phaseId,
  onReport,
}: {
  conf: string;
  phaseId: number;
  onReport: (report: PropagationReport) => void;
}) {
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
    onSuccess: async report => {
      await refreshBracket(qc);
      onReport(report);
      setNote(propagationSummary(report));
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
      <TooltipHint
        content="Fills in every team this bracket's results imply. Safe to press any time: it also clears a team whose result was corrected."
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => propagate.mutate()}
          disabled={propagate.isPending}
        >
          <RefreshCw size={13} aria-hidden="true" />
          {propagate.isPending ? "Resyncing…" : "Resync bracket"}
        </Button>
      </TooltipHint>
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

  // The season document serves each slot's team ID, which is what a PATCH wants. A slot without one
  // shows as unset rather than as whichever team holds its code now.
  const current = side.team?.id ?? null;
  const opposite = (slot === "top" ? match.bottom : match.top).team?.id ?? null;

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

  const errorId = useId();

  return (
    <div className="min-w-0">
      <NativeSelect
        size="sm"
        value={current ?? ""}
        disabled={save.isPending}
        aria-label={`${slot === "top" ? "Top" : "Bottom"} team${side.seed ? `, seed ${side.seed}` : ""}`}
        aria-invalid={save.isError || undefined}
        aria-describedby={save.isError ? errorId : undefined}
        onChange={e => save.mutate(e.target.value === "" ? null : Number(e.target.value))}
        className="h-7 truncate rounded bg-bg-input py-1 pl-1.5 pr-7 font-heading text-[12px]"
      >
        <NativeSelectOption value="">— TBD —</NativeSelectOption>
        {teams
          .filter(t => t.id !== opposite)
          .map(t => (
            <NativeSelectOption key={t.id} value={t.id}>
              {t.code} — {t.name}
            </NativeSelectOption>
          ))}
      </NativeSelect>
      {save.isError && (
        <p id={errorId} className="mt-0.5 text-[10px] text-ccs-red">{errorMessage(save.error)}</p>
      )}
    </div>
  );
}
