/**
 * Awarding a match by walkover, and taking it back.
 *
 * **One call clinches the series.** The body names the team that forfeited and nothing else — the
 * server reads what has already been played and writes only the games the other side still needs to
 * reach `ceil(bestOf / 2)`. So a team that showed up for game one and not the rest loses 2-1, a team
 * that never showed up at all loses 2-0, and this screen never sends a scoreline.
 *
 * It does *predict* one, which is the exception rather than the rule for this app: the panel shows the
 * outcome of an action it has not taken yet, so the arithmetic has to happen here — the same reason
 * the phase editor resolves its own inherited dates. What comes back is reported from the response
 * instead, because `gamesRecorded` is the part a prediction cannot be trusted for.
 *
 * A forfeit is a **result**, not a schedule change, and it is deliberately on this screen anyway:
 * upstream gates it on the same `schedule` scope, because confirming a tournament code two panels down
 * already writes a real result under that grant.
 *
 * Two consequences upstream, and **neither is warned about here**, which is deliberate:
 *
 *  - Recording one **freezes the phase's season-day range**: a phase with a result in it cannot be
 *    moved or resized. That refusal comes from the structure editor, which is site-admin — so it can
 *    never reach the person using this panel, and by the time results are being recorded the shape of
 *    the season is settled anyway.
 *  - A game played on a forfeited match **will not ingest** afterwards. The walkover does not
 *    invalidate the tournament code, and `series` counts rows, so a real game landing on a series
 *    forfeited 2-0 would read 2-2 and retract whoever it advanced. Ingest refuses instead and says so
 *    at the moment it happens — `describeIngest` names the forfeit and the fix — which is a better
 *    place for it than a caution attached to every forfeit that never causes it.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Flag } from "lucide-react";
import { CONTROL_CLASS, LABEL_CLASS } from "../../stats/FilterBar";
import { ACTION_SM, ACTION_SM_DANGER, ACTION_SM_PRIMARY, ErrorLine } from "../../admin/adminUi";
import { queryRoots } from "../../../lib/queries";
import {
  clearForfeit,
  errorMessage,
  forfeitMatch,
  issuesOf,
  type ForfeitCleared,
  type ForfeitRecorded,
  type ScheduleMatch,
  type SeriesSnapshot,
  type TeamRecord,
} from "../../../lib/api";

export function ForfeitPanel({
  match,
  teams,
  onSaved,
}: {
  match: ScheduleMatch;
  /**
   * The conference's teams, for the one thing the schedule read cannot give: **`loserTeamId` is an
   * id**, and a match names its teams by code. Already loaded for this screen's pickers, so resolving
   * it here costs nothing — and an unresolvable code disables the button rather than posting a guess.
   */
  teams: readonly TeamRecord[];
  onSaved: (message: string) => void;
}) {
  const qc = useQueryClient();
  const [loserCode, setLoserCode] = useState("");
  const [arming, setArming] = useState(false);

  /**
   * Everything a result moves — minus the stat boards, which a forfeit genuinely does not touch.
   *
   * Forfeits live only in the `forfeits` table and never reach `matchlist`, so `playerstats` and
   * `championstats` cannot change. `standings` and the `teams` record both include them, and `season`
   * carries the group tables and the bracket a clinch just advanced.
   */
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: queryRoots.schedule }),
      qc.invalidateQueries({ queryKey: queryRoots.standings }),
      qc.invalidateQueries({ queryKey: queryRoots.season }),
      qc.invalidateQueries({ queryKey: queryRoots.teams }),
    ]);

  const record = useMutation({
    mutationFn: (loserTeamId: number) => forfeitMatch(match.id, loserTeamId),
    onSuccess: async result => {
      setLoserCode("");
      await refresh();
      onSaved(describeForfeit(result));
    },
  });

  const clear = useMutation({
    mutationFn: () => clearForfeit(match.id),
    onSuccess: async result => {
      setArming(false);
      await refresh();
      onSaved(describeCleared(result));
    },
  });

  const result = match.result;
  const hasForfeit = result?.hasForfeit === true;

  /**
   * Both sides, or nothing to do.
   *
   * Upstream's own `422`s, said before the button rather than after it: a bye has one team by
   * construction, and a forfeit row needs two codes, so neither is a mistake worth making an admin
   * discover by pressing.
   */
  const sides =
    match.kind === "bye" || !match.teamA || !match.teamB
      ? null
      : { a: match.teamA, b: match.teamB };

  /**
   * Whether the series is already over, **independent of who is selected**.
   *
   * Upstream refuses on `max(winsA, winsB) >= ceil(bestOf / 2)` without caring which side that is, so
   * asking the same question about the chosen loser would offer a button for the case where the team
   * you are trying to forfeit is the one that has already clinched.
   */
  const needed = match.bestOf === null ? null : Math.ceil(match.bestOf / 2);
  const decided =
    needed !== null && result !== null && Math.max(result.winsA, result.winsB) >= needed;

  /**
   * Recording a walkover always writes enough games to clinch, so a match that has one is finished by
   * definition — which is why `hasForfeit` counts here as well as `decided`. Without it, a match whose
   * `bestOf` never arrived (`needed === null`, so `decided` is false) would keep offering a button that
   * upstream answers `409`.
   */
  const settled = decided || hasForfeit;

  const loser =
    sides === null ? null : loserCode === sides.a.code ? sides.a : loserCode === sides.b.code ? sides.b : null;
  const winner = loser === null || sides === null ? null : loser === sides.a ? sides.b : sides.a;
  const loserId = loser === null ? null : idOf(teams, loser.code);
  const clinch = loser === null || needed === null ? null : clinchOf(match, loser.code, needed);

  /**
   * The walkover that already exists — a statement of what happened, not a prediction of what would.
   *
   * `winsA` is oriented to the match's own `teamA` by the schedule read, so the higher count names its
   * side directly. A recorded forfeit always clinches, so the two are never level.
   */
  const walkover =
    sides === null || result === null || !hasForfeit
      ? null
      : {
          winner: result.winsA > result.winsB ? sides.a.code : sides.b.code,
          high: Math.max(result.winsA, result.winsB),
          low: Math.min(result.winsA, result.winsB),
        };

  return (
    <div className="border-t border-border pt-2.5 mt-2.5">
      <span className={LABEL_CLASS}>Forfeit</span>

      {sides === null ? (
        <p className="text-text-dim text-xs mt-1">
          {match.kind === "bye"
            ? "A bye has one team, so there is nothing to forfeit."
            : "Both sides need a team before a walkover can be recorded."}
        </p>
      ) : settled ? (
        /*
          What the state *is*, not what is refused. This branch used to explain upstream's `409` in
          both cases, which meant a forfeit just recorded on purpose was answered with "a walkover
          cannot be recorded over a finished series" — a success reading as an error. A forfeited
          series being finished is the whole point of forfeiting it.
        */
        <p className="text-text-dim text-xs mt-1">
          {walkover !== null
            ? `Forfeited — ${walkover.winner} takes it ${walkover.high}–${walkover.low}.`
            : `This series is already decided ${result?.winsA}–${result?.winsB} by games played, so there is nothing to forfeit.`}
        </p>
      ) : (
        <>
          <div className="mt-1 flex flex-wrap items-end gap-2">
            <div className="min-w-40">
              <label className={LABEL_CLASS} htmlFor={`forfeit-${match.id}`}>
                Which team forfeited
              </label>
              <select
                id={`forfeit-${match.id}`}
                value={loserCode}
                onChange={e => setLoserCode(e.target.value)}
                className={CONTROL_CLASS}
              >
                <option value="">Choose a team…</option>
                {/*
                  Both sides offered rather than only the one behind: a no-show is not always the team
                  that is losing, and upstream validates the pair either way.
                */}
                <option value={sides.a.code}>{sides.a.code} forfeits</option>
                <option value={sides.b.code}>{sides.b.code} forfeits</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() => loserId !== null && record.mutate(loserId)}
              disabled={loserId === null || record.isPending}
              title="Awards the series to the other side, writing only the games it still needs to clinch."
              className={ACTION_SM_PRIMARY}
            >
              <Flag size={13} aria-hidden="true" />
              {record.isPending ? "Recording…" : "Record forfeit"}
            </button>
          </div>

          {/* The prediction: what one press does to the score, and to the games already played. */}
          {loser !== null && winner !== null && clinch !== null && (
            <p className="text-text-secondary text-xs mt-1.5">
              {winner.code} takes it {clinch.winnerWins}–{clinch.loserWins} —{" "}
              {clinchNote(loser.code, clinch.played, clinch.rows)}.
            </p>
          )}

          {loser !== null && loserId === null && (
            <p className="text-ccs-red text-xs mt-1.5">
              {loser.code} isn&apos;t in the loaded team list, so its id is unknown — reload the page
              and try again.
            </p>
          )}

          {loser !== null && needed === null && (
            <p className="text-text-dim text-xs mt-1.5">
              This match carries no best-of, so how many games it takes to clinch will be settled by
              the server.
            </p>
          )}
        </>
      )}

      {hasForfeit && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          <button
            type="button"
            onClick={() => (arming ? clear.mutate() : setArming(true))}
            disabled={clear.isPending}
            title="Removes every forfeited game on this match and re-derives the bracket. Games actually played are untouched."
            className={ACTION_SM_DANGER}
          >
            {clear.isPending
              ? "Clearing…"
              : arming
                ? "Really clear — this can empty a later bracket slot"
                : "Clear the forfeit"}
          </button>
          {arming && !clear.isPending && (
            <button type="button" onClick={() => setArming(false)} className={ACTION_SM}>
              Keep it
            </button>
          )}
        </div>
      )}

      <ErrorLine message={record.isError ? forfeitFailure(record.error) : null} />
      <ErrorLine message={clear.isError ? errorMessage(clear.error) : null} />
    </div>
  );
}

/**
 * What one press would do to the score.
 *
 * `rows` mirrors upstream exactly — `ceil(bestOf / 2)` less what the *winner* has already won — which
 * is what makes a team that played game one and no-showed the rest lose 2-1 rather than 2-0. Only
 * called for an undecided series, so `rows` is always at least one.
 *
 * `played` is the pair's game count, and it is the number the sentence has to branch on: a series has
 * no draws, so the two counts sum to the games played. The loser's own count is not the same question
 * — a best-of-3 at 1-0 to the eventual winner has a played game *and* a loser on zero.
 */
function clinchOf(
  match: ScheduleMatch,
  loserCode: string,
  needed: number,
): { winnerWins: number; loserWins: number; rows: number; played: number } {
  // `winsA` is oriented to the *match's* `teamA` by the schedule read, not to the sorted pair the
  // `series` view keys on — so nothing here needs flipping.
  const winsA = match.result?.winsA ?? 0;
  const winsB = match.result?.winsB ?? 0;
  const isA = loserCode === match.teamA?.code;

  const loserWins = isA ? winsA : winsB;
  const winnerWins = isA ? winsB : winsA;

  return { winnerWins: needed, loserWins, rows: needed - winnerWins, played: winsA + winsB };
}

/**
 * The half of the prediction that says what happens to the games themselves.
 *
 * Split on **whether anything has been played**, which is the distinction the rule actually turns on:
 * a walkover over a whole series forfeits every game, and a walkover part-way through leaves what was
 * played alone and awards the rest. Branching on the loser's own win count instead produced
 * "loses all 1 game" for a best-of-1 and for a best-of-3 already 1-0.
 */
function clinchNote(loser: string, played: number, rows: number): string {
  if (played === 0) {
    const games = rows === 1 ? "the game" : rows === 2 ? "both games" : `all ${rows} games`;
    return `${loser} forfeits ${games}`;
  }

  const stands =
    played === 1 ? "the game already played stands" : `the ${played} games already played stand`;
  const awarded = rows === 1 ? "one more game is" : `${rows} more games are`;

  return `${stands}, and ${awarded} awarded against ${loser}`;
}

/** The team id behind a code, or `null` when the list doesn't cover it. */
function idOf(teams: readonly TeamRecord[], code: string): number | null {
  return teams.find(t => t.code === code)?.id ?? null;
}

/**
 * What was recorded, in the terms the response reports it.
 *
 * `gamesRecorded` is named rather than counted: it is the difference between a 2-0 and a 2-1, and the
 * only place the game numbers appear at all.
 */
function describeForfeit(result: ForfeitRecorded): string {
  const games = result.gamesRecorded;
  const which =
    games.length === 0
      ? "no games"
      : games.length === 1
        ? `game ${games[0]}`
        : `games ${games.join(", ")}`;

  return [
    // The winner is named once. `score` renders the snapshot's own sorted pair, so "ANE takes the
    // series ANE 2–1 OE" was the shape this used to produce.
    `${result.loser} forfeited. The series is ${score(result.result)} — ${which} awarded.`,
    moved(result.phaseKind, result.propagated.length, true),
  ]
    .filter(part => part !== "")
    .join(" ");
}

function describeCleared(result: ForfeitCleared): string {
  return [
    `Forfeit cleared — ${result.deleted} forfeited ${result.deleted === 1 ? "game" : "games"} removed.`,
    result.result.games === 0
      ? "Nothing is recorded on this match now."
      : `What was played stands: ${score(result.result)}.`,
    moved(result.phaseKind, result.propagated.length, false),
  ]
    .filter(part => part !== "")
    .join(" ");
}

/** The snapshot's own orientation — its pair is sorted by code, so don't re-order it. */
function score(s: SeriesSnapshot): string {
  return `${s.teamA} ${s.winsA}–${s.winsB} ${s.teamB}`;
}

/**
 * What propagation did, and **why saying nothing is not enough**.
 *
 * `phaseKind` is on the response exactly so an empty `propagated` is not ambiguous between "group
 * phase, nothing to propagate" and "bracket, and nothing moved". The second is worth reporting: a
 * bracket clinch that advanced nobody means the node isn't wired to anything downstream, which is a
 * problem an admin would otherwise find out about a round later.
 */
function moved(phaseKind: string, count: number, clinching: boolean): string {
  if (phaseKind !== "bracket") return "";
  if (count === 0) {
    return clinching
      ? "No bracket slot moved — check the bracket is wired through this match."
      : "No bracket slot changed.";
  }

  const slots = `${count} bracket ${count === 1 ? "slot" : "slots"}`;
  return clinching ? `Advanced into ${slots}.` : `Re-derived ${slots}, which may now be empty.`;
}

/** A `422` here names the team or the side at fault, which is more use than "save refused". */
function forfeitFailure(e: unknown): string {
  const issues = issuesOf(e);
  if (issues === null) return errorMessage(e);

  return issues.length === 0
    ? "The forfeit was refused, with no reason given."
    : issues.map(i => i.message).join("; ");
}
