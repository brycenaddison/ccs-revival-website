/**
 * Schedule — the League Admin section for running a season that already exists.
 *
 * Needs only the `schedule` scope on this conference (an `admin` grant satisfies it, and site admins pass
 * unconditionally). That is the whole reason this is a separate screen from Site Admin → Season Structure
 * rather than the same one with fields hidden: **structure is site-admin only**, so a league admin can
 * change when a match happens, who plays it, how long it is and where it streams — and cannot add or
 * delete a match, move it to another day, or rewire a bracket.
 *
 * `propagate` sits on this side of that line too, despite its phase-scoped URL: it writes only team
 * columns, only into slots propagation already owns, and only what the recorded results imply — so it is
 * strictly weaker than the per-match `PATCH` this screen already has.
 *
 * The conf comes from the path (`/league/:conf/admin/schedule`), not the `?conf=` param the public views
 * use for the season being *viewed*. Those are different selections on purpose.
 *
 * One consequence of the read worth knowing: `GET /tournaments/:conf/schedule` hides unpublished phases
 * from anyone who cannot edit the conference, and upstream decides that with the `admin` scope — so a
 * grant that is `schedule`-only sees published phases only. An unpublished phase is one still being
 * built, which is a reasonable thing for this screen not to show; but if a day is missing here and
 * present in Site Admin, that is why.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { CalendarDays, Flag, KeyRound, Link2, Pencil, RefreshCw, Swords } from "lucide-react";
import { toast } from "sonner";
import { PillTabs, type PillTab } from "../../PillTabs";
import { ErrorLine } from "../../admin/adminUi";
import { MatchEditor } from "./MatchEditor";
import { MatchCodes } from "./MatchCodes";
import { CodeDeliveryControl } from "./CodeDeliveryControl";
import { DayDraftsControl } from "./DayDraftsControl";
import { DraftPanel } from "./DraftPanel";
import { ForfeitPanel } from "./ForfeitPanel";
import { LinkingPanel } from "./LinkingPanel";
import { describeSweep } from "./codeReports";
import { queries, queryRoots } from "../../../lib/queries";
import { fmtKickoff } from "../../../lib/utils";
import {
  errorMessage,
  mintCodes,
  propagatePhase,
  recheckDayCodes,
  type ScheduleDay,
  type ScheduleMatch,
  type TeamRecord,
} from "../../../lib/api";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { TooltipHint } from "../../TooltipHint";

type Tab = "days" | "linking";

export function ScheduleSection() {
  const { conf = "" } = useParams();
  const [tab, setTab] = useState<Tab>("days");

  const schedule = useQuery(queries.schedule(conf));
  const teams = useQuery(queries.teamsForConf(conf));

  const days = schedule.data ?? [];

  return (
    <div className="flex flex-col gap-5">
      <PillTabs label="Schedule view" tabs={TABS} selected={tab} onSelect={setTab} />

      {schedule.isError && (
        <ErrorLine message={`Couldn't load the schedule: ${errorMessage(schedule.error)}`} />
      )}
      {teams.isError && (
        <ErrorLine message={`Couldn't load the team list, so the pickers are empty: ${errorMessage(teams.error)}`} />
      )}

      {tab === "linking" ? (
        <LinkingPanel conf={conf} days={days} onSaved={toast.success} />
      ) : schedule.isPending ? (
        <p className="text-text-dim">Loading the schedule…</p>
      ) : days.length === 0 ? (
        <p className="text-text-dim py-6 text-center">
          Nothing scheduled yet. Contact a server admin to configure the league&apos;s format.
        </p>
      ) : (
        <DayList conf={conf} days={days} teams={teams.data ?? []} onSaved={toast.success} />
      )}
    </div>
  );
}

const TABS: readonly PillTab<Tab>[] = [
  { key: "days", label: "Match days", icon: CalendarDays },
  { key: "linking", label: "Link past games", icon: Link2 },
];

function DayList({
  conf,
  days,
  teams,
  onSaved,
}: {
  conf: string;
  days: readonly ScheduleDay[];
  teams: readonly TeamRecord[];
  onSaved: (message: string) => void;
}) {
  // Defaults to the day nearest to now rather than the first, because a season being run is usually being
  // run in the middle.
  const initial = useMemo(() => nearestDay(days), [days]);
  const [open, setOpen] = useState<number>(initial);

  const day = days.find(d => d.seasonDay === open) ?? days[0];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Label className="mb-1" htmlFor="schedule-day">
          Season day
        </Label>
        <NativeSelect
          id="schedule-day"
          value={day.seasonDay}
          onChange={e => setOpen(Number(e.target.value))}
        >
          {days.map(d => (
            <NativeSelectOption key={d.seasonDay} value={d.seasonDay}>
              Day {d.seasonDay} — {d.phase} (day {d.matchDay} of the phase) ·{" "}
              {d.matches.length} {d.matches.length === 1 ? "match" : "matches"}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      <DayPanel key={`${conf}-${day.seasonDay}`} conf={conf} day={day} teams={teams} onSaved={onSaved} />
    </div>
  );
}

/** The season day closest to today, by the earliest kickoff on each day. Falls back to the first. */
function nearestDay(days: readonly ScheduleDay[]): number {
  const now = Date.now();
  let best = days[0]?.seasonDay ?? 1;
  let bestGap = Infinity;

  for (const day of days) {
    const times = day.matches
      .map(m => (m.scheduledAt ? new Date(m.scheduledAt).getTime() : NaN))
      .filter(t => !Number.isNaN(t));
    if (times.length === 0) continue;

    const gap = Math.abs(Math.min(...times) - now);
    if (gap < bestGap) {
      bestGap = gap;
      best = day.seasonDay;
    }
  }

  return best;
}

function DayPanel({
  conf,
  day,
  teams,
  onSaved,
}: {
  conf: string;
  day: ScheduleDay;
  teams: readonly TeamRecord[];
  onSaved: (message: string) => void;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<number | null>(null);
  const [showCodes, setShowCodes] = useState<number | null>(null);
  const [showDraft, setShowDraft] = useState<number | null>(null);
  const [showForfeit, setShowForfeit] = useState<number | null>(null);
  const [resync, setResync] = useState<string | null>(null);

  /**
   * Re-derives every downstream team in this day's phase from the results that exist now.
   *
   * Only meaningful on a bracket day — `propagate` is a no-op for a group phase — and only offered when
   * the schedule actually carried a `phaseId`, since the route is phase-scoped and `GET /:conf/phases`
   * is site-admin.
   *
   * Idempotent, so this is a safe button rather than a dangerous one: it reports only what it rewrote,
   * and it clears as well as sets. A corrected upstream result sends the downstream team back to null to
   * be re-derived, which is why it is worth pressing after fixing a score.
   */
  const propagate = useMutation({
    mutationFn: () => propagatePhase(conf, day.phaseId),
    onSuccess: async updates => {
      // Both roots: the derived teams show on the schedule *and* in the structure editor's bracket.
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryRoots.schedule }),
        qc.invalidateQueries({ queryKey: queryRoots.season }),
      ]);
      setResync(
        updates.length === 0
          ? "Nothing was stale — every derived team already matches the results."
          : `Re-derived ${updates.length} ${updates.length === 1 ? "team" : "teams"}.`,
      );
    },
  });

  const canResync = day.phaseKind === "bracket" && day.phaseId > 0;

  const mint = useMutation({
    mutationFn: () => mintCodes(conf, day.seasonDay),
    onSuccess: async result => {
      await qc.invalidateQueries({ queryKey: queryRoots.schedule });
      onSaved(
        result.minted === 0
          ? `Nothing to mint — all ${result.skipped} matches already have their codes.`
          : `Minted codes for ${result.minted} ${result.minted === 1 ? "match" : "matches"}${
              result.skipped > 0 ? `, skipped ${result.skipped} that already had them` : ""
            }.`,
      );
    },
  });

  /**
   * Asks Riot again about every confirmed code on this day, recording anything now played.
   *
   * This is what recovers a whole night in one call: codes we minted are `confirmed` by definition,
   * so a game whose Riot callback never arrived is still reachable through the code it was played
   * on. Pending codes are skipped upstream — confirming one is a decision this must not make on an
   * admin's behalf.
   *
   * Safe to press twice: a game already recorded comes back as a duplicate and is linked rather than
   * re-inserted.
   */
  const recheck = useMutation({
    mutationFn: () => recheckDayCodes(conf, day.seasonDay),
    onSuccess: async result => {
      // An ingested game is a new result, so the standings and every stats board move with it.
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryRoots.schedule }),
        qc.invalidateQueries({ queryKey: queryRoots.standings }),
        qc.invalidateQueries({ queryKey: queryRoots.stats }),
        qc.invalidateQueries({ queryKey: queryRoots.season }),
      ]);
      onSaved(describeSweep(result));
    },
  });

  return (
    <div className="bg-bg3 border border-border rounded-lg p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-baseline gap-2.5">
          <span className="font-display text-lg text-text-bright ">
            DAY {day.seasonDay}
          </span>
          <Badge variant="muted">{day.phase}</Badge>
          <Badge variant="muted">{day.phaseKind === "group" ? "Group stage" : "Bracket"}</Badge>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {canResync && (
            <TooltipHint content="Fills in every team this bracket's results imply. Safe to press any time — it also clears a team whose result was corrected.">
              <Button
                variant="outline" size="sm"
                type="button"
                onClick={() => propagate.mutate()}
                disabled={propagate.isPending}
              >
                <RefreshCw size={13} aria-hidden="true" />
                {propagate.isPending ? "Resyncing…" : "Resync bracket"}
              </Button>
            </TooltipHint>
          )}
          <TooltipHint content="Matches that already have their codes are skipped, so this is safe to press twice.">
            <Button
              variant="outline" size="sm"
              type="button"
              onClick={() => mint.mutate()}
              disabled={mint.isPending}
            >
              <KeyRound size={13} aria-hidden="true" />
              {mint.isPending ? "Minting…" : "Mint this day's codes"}
            </Button>
          </TooltipHint>
          <TooltipHint content="Asks Riot about every confirmed code on this day and records anything now played. The fix for a night whose results never arrived — safe to press any time.">
            <Button
              variant="outline" size="sm"
              type="button"
              onClick={() => recheck.mutate()}
              disabled={recheck.isPending}
            >
              <RefreshCw size={13} aria-hidden="true" />
              {recheck.isPending ? "Re-checking…" : "Re-check this day's codes"}
            </Button>
          </TooltipHint>
        </div>
      </div>

      {resync && <p className="text-text-secondary text-sm mb-2">{resync}</p>}

      <ErrorLine message={mint.isError ? errorMessage(mint.error) : null} />
      <ErrorLine message={recheck.isError ? errorMessage(recheck.error) : null} />
      <ErrorLine message={propagate.isError ? errorMessage(propagate.error) : null} />

      {/* Before delivery: each code DM links the match's room, so rooms must exist first. */}
      <DayDraftsControl
        conf={conf}
        seasonDay={day.seasonDay}
        matches={day.matches}
        disabled={mint.isPending || recheck.isPending || propagate.isPending}
      />

      <CodeDeliveryControl
        target={{ conf, seasonDay: day.seasonDay }}
        matches={day.matches}
        teams={teams}
        disabled={mint.isPending || recheck.isPending || propagate.isPending}
      />

      {day.matches.length === 0 ? (
        <p className="text-text-dim text-sm">No matches on this day.</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {day.matches.map(match => (
            <li key={match.id} className="bg-bg2 border border-border rounded-md p-3">
              <MatchSummary match={match} />

              <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                <Button
                  variant="outline" size="sm"
                  type="button"
                  onClick={() => setEditing(editing === match.id ? null : match.id)}
                >
                  <Pencil size={13} aria-hidden="true" />
                  {editing === match.id ? "Close" : "Edit"}
                </Button>
                <Button
                  variant="outline" size="sm"
                  type="button"
                  onClick={() => setShowCodes(showCodes === match.id ? null : match.id)}
                >
                  <KeyRound size={13} aria-hidden="true" />
                  Codes
                </Button>
                {match.kind !== "bye" && (
                  <Button
                    variant="outline" size="sm"
                    type="button"
                    onClick={() => setShowDraft(showDraft === match.id ? null : match.id)}
                  >
                    <Swords size={13} aria-hidden="true" />
                    Draft
                  </Button>
                )}
                {/*
                  A forfeit is a *result*, not a schedule change — its own panel rather than a field in
                  the editor, because `PATCH` semantics don't apply to it and it is not something to
                  press on the way past. Offered for a bye too: the panel is where the reason it can't
                  be forfeited is written.
                */}
                <Button
                  variant="outline" size="sm"
                  type="button"
                  onClick={() => setShowForfeit(showForfeit === match.id ? null : match.id)}
                >
                  <Flag size={13} aria-hidden="true" />
                  Forfeit
                </Button>
              </div>

              {editing === match.id && (
                <div className="mt-2.5">
                  <MatchEditor
                    matchId={match.id}
                    teams={teams}
                    onClose={() => setEditing(null)}
                    onSaved={onSaved}
                  />
                </div>
              )}

              {showForfeit === match.id && (
                <ForfeitPanel match={match} teams={teams} onSaved={onSaved} />
              )}

              {showCodes === match.id && <MatchCodes match={match} teams={teams} onSaved={onSaved} />}

              {showDraft === match.id && <DraftPanel match={match} onSaved={onSaved} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MatchSummary({ match }: { match: ScheduleMatch }) {
  const isBye = match.kind === "bye";

  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="text-text-bright text-sm">
        {match.teamA?.code ?? "TBD"}
        {isBye ? (
          <span className="text-text-dim"> — bye</span>
        ) : (
          <>
            <span className="text-text-dim"> vs </span>
            {match.teamB?.code ?? "TBD"}
          </>
        )}
      </span>

      {match.result && (
        <Badge>
          {match.result.winsA}–{match.result.winsB}
          {match.result.hasForfeit ? " · FF" : ""}
        </Badge>
      )}

      {!isBye && <span className="text-text-dim text-xs">Bo{match.bestOf ?? "?"}</span>}

      <span className="text-text-secondary text-xs">{fmtKickoff(match.scheduledAt)}</span>

      {match.streamUrl && (
        <a
          href={match.streamUrl}
          target="_blank"
          rel="noreferrer"
          className="text-brand text-xs hover:underline"
        >
          stream
        </a>
      )}
    </div>
  );
}
