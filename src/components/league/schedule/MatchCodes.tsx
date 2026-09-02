/**
 * The tournament codes one match is played on.
 *
 * Two ways a code gets here, and they coexist on purpose:
 *
 *  - **Minted from the schedule** — `POST /tournaments/:conf/schedule/:day/codes`, one Riot call per
 *    match, done a whole day at a time from `ScheduleSection`. Minted codes are `confirmed` by
 *    definition.
 *  - **Registered after the fact** — for a code that came from the `/code` Discord command. This is
 *    how a past day gets recovered: open its schedule and paste in the codes that were posted at the
 *    time.
 *
 * **Registering is two steps.** `check` attaches the code as pending and shows what Riot says was
 * played on it; `confirm` is what ingests. The single call that did both is gone from the API,
 * because it attached and ingested together — so a code pasted against the wrong match was in the
 * standings before anyone could look at it. The preview between the two steps is the whole point of
 * this screen: it is the only chance to notice.
 *
 * **A game with no payload still has a result**, and this screen shows it on both sides of the
 * confirm. Riot's match index drops games it is still reporting on the code, so the check has no match
 * data to preview — but it does report the winner and loser, resolved to team codes by the same roster
 * vote ingest will run, and confirming records exactly that: upstream's `result-only`, which counts for
 * the standings and the series and is repaired by a later re-check. Afterwards the codes list carries
 * the recorded result off the same joined row as `matchId`, which is what lets a game with no payload
 * still say who won when its code is opened.
 *
 * Those codes are also the reason the reported teams are checked against the match's own two teams
 * here: a `/code`-cut code carries no `scheduleMatchId` for `Provenance` to check, and the result does.
 *
 * Discarding a check deletes the pending row rather than leaving it behind. That is a plain
 * `schedule`-scope delete — abandoning your own staged code destroys nothing else. The exception is a
 * code Riot doesn't recognize: upstream never attaches one, so there is nothing to delete and
 * discarding it is purely local.
 *
 * Codes are shown in full because that is the point of them — anyone holding one can join the lobby, so
 * this is a league-admin surface and nothing here is safe to render publicly. Delivering codes to
 * *players* is a separate piece of work that does not exist yet; until it does, `/code` posting them
 * into Discord is still the only thing that reaches a team on match night.
 */

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ClipboardList, Copy, Plus, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import { CONTROL_CLASS, LABEL_CLASS } from "../../stats/FilterBar";
import {
  ACTION_QUIET,
  ACTION_QUIET_BASE,
  ACTION_SM,
  ACTION_SM_DANGER,
  ACTION_SM_PRIMARY,
  ErrorLine,
  Pill,
} from "../../admin/adminUi";
import { GameSummary, LinkedGameSummary, ResultOnlyCard } from "../../match/GameSummary";
import { describeIngest, describeSweep } from "./codeReports";
import { queries, queryRoots } from "../../../lib/queries";
import { useAdminAccess } from "../../../lib/adminAccess";
import {
  checkCode,
  codeConflict,
  confirmCode,
  deleteCode,
  errorMessage,
  recheckMatchCodes,
  type CodeCheck,
  type MatchCode,
  type ReportedTeams,
  type ScheduleMatch,
} from "../../../lib/api";

/** Riot tournament codes are always exactly this long, with no whitespace. */
const CODE_LENGTH = 44;

export function MatchCodes({
  match,
  onSaved,
}: {
  /**
   * The whole match, not just its id — the copy-all sheet is headed with the two team codes, which is
   * what makes a pasted block of codes readable to the people receiving it.
   */
  match: ScheduleMatch;
  onSaved: (message: string) => void;
}) {
  const matchId = match.id;
  const qc = useQueryClient();
  const { isSiteAdmin } = useAdminAccess();
  const codes = useQuery(queries.matchCodes(matchId));
  const [adding, setAdding] = useState(false);
  const [code, setCode] = useState("");
  /** Blank means "next free slot" — which is what omitting `game` gets from upstream. */
  const [game, setGame] = useState("");
  /** The staged code awaiting a decision. Null whenever the form is showing instead. */
  const [checked, setChecked] = useState<CodeCheck | null>(null);
  /** Which already-linked code has its summary open. One at a time. */
  const [openCode, setOpenCode] = useState<string | null>(null);

  /** Just this match's code list — for the steps that move a code without moving a result. */
  const refreshCodes = () => qc.invalidateQueries({ queryKey: queries.matchCodes(matchId).queryKey });

  /**
   * Drops the preview and leaves the form blank behind it, ready for the code that was meant.
   *
   * Shared with the list, because a staged code has a row there too and deleting that row is the
   * same delete `abandon` performs — leaving the panel up afterwards pointed its Confirm and Discard
   * at a code that no longer existed, and both answered 404.
   */
  const clearStaged = () => {
    setChecked(null);
    setCode("");
  };

  /**
   * Everything an ingested game moves: it is a new result, so the standings and every stats board
   * move with it, and a propagated bracket rewires under `season`.
   *
   * Covers `refreshCodes` too — the codes query is keyed under the `schedule` root — so the two are
   * never both needed.
   */
  const refreshResults = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: queryRoots.schedule }),
      qc.invalidateQueries({ queryKey: queryRoots.standings }),
      qc.invalidateQueries({ queryKey: queryRoots.stats }),
      qc.invalidateQueries({ queryKey: queryRoots.season }),
    ]);

  const check = useMutation({
    // `undefined` rather than a number upstream would reject: a blank or unparseable box means
    // "whichever slot is next", which is the endpoint's own default.
    mutationFn: () => checkCode(matchId, code.trim(), slotOf(game)),
    onSuccess: async result => {
      setChecked(result);
      // The pending row exists upstream now, so the list behind the preview should show it.
      await refreshCodes();
    },
  });

  const confirm = useMutation({
    mutationFn: (staged: CodeCheck) => confirmCode(matchId, staged.code),
    onSuccess: async result => {
      setChecked(null);
      setCode("");
      setGame("");
      setAdding(false);
      await refreshResults();
      onSaved(
        result.ingested.length === 0
          ? `Code confirmed for game ${result.game}. Riot has no games on it yet — a re-check will pick one up.`
          : `Code confirmed. ${describeIngest(result.ingested)}`,
      );
    },
  });

  /**
   * Abandoning the check. Deletes the row upstream staged, so nothing is left dangling.
   *
   * Only clears the preview on success — a failure has to stay on screen to be read, and this is the
   * one place it can be. The form reappears blank underneath, ready for the code that was meant.
   */
  const abandon = useMutation({
    mutationFn: (staged: CodeCheck) => deleteCode(matchId, staged.code),
    onSuccess: async () => {
      clearStaged();
      await refreshCodes();
    },
  });

  const recheck = useMutation({
    mutationFn: () => recheckMatchCodes(matchId),
    onSuccess: async result => {
      await refreshResults();
      onSaved(describeSweep(result));
    },
  });

  const trimmed = code.trim();
  const valid = trimmed.length === CODE_LENGTH;
  const busy = check.isPending || confirm.isPending || abandon.isPending;

  return (
    <div className="border-t border-border pt-2.5 mt-2.5">
      {/*
        Re-check sits **last**, to the right of the register button, because the register button is
        the one that comes and goes — and a right-aligned group reflows around whatever is removed
        from its left. With the order the other way round, opening the form moved re-check sideways
        under the cursor.
      */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className={LABEL_CLASS}>Tournament codes</span>
        <div className="flex flex-wrap items-center gap-4">
          {!adding && (
            <button type="button" onClick={() => setAdding(true)} className={ACTION_QUIET}>
              <Plus size={12} aria-hidden="true" />
              Register a code
            </button>
          )}
          <button
            type="button"
            onClick={() => recheck.mutate()}
            disabled={recheck.isPending}
            title="Asks Riot again about this match's confirmed codes and records anything now played. The recovery path for a callback that never arrived — safe to press any time."
            className={ACTION_QUIET}
          >
            <RefreshCw size={12} aria-hidden="true" />
            {recheck.isPending ? "Re-checking…" : "Re-check"}
          </button>
        </div>
      </div>

      {codes.isPending ? (
        <p className="text-text-dim text-xs">Loading…</p>
      ) : codes.isError ? (
        <ErrorLine message={`Couldn't load the codes: ${errorMessage(codes.error)}`} />
      ) : codes.data.length === 0 ? (
        <p className="text-text-dim text-xs">
          None yet. Mint the whole day above, or register one that was posted to Discord.
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-1.5 mt-1">
            {codes.data.map(entry => (
              <li key={entry.code} className="flex flex-col gap-1.5">
                <CodeRow
                  entry={entry}
                  matchId={matchId}
                  isSiteAdmin={isSiteAdmin}
                  open={openCode === entry.code}
                  onToggle={() => setOpenCode(openCode === entry.code ? null : entry.code)}
                  onReport={onSaved}
                  onDeleted={async removed => {
                    setOpenCode(null);
                    // The row just deleted may be the staged one's own row — the preview is showing
                    // the same code the list is, and deleting it there is deleting it here.
                    if (checked?.code === entry.code) clearStaged();
                    await refreshResults();
                    onSaved(
                      removed.ingestRemoved === null
                        ? "Code removed. It held no game, so nothing else changed."
                        : `Code removed, along with the recorded game ${removed.ingestRemoved}.`,
                    );
                  }}
                />
                {/*
                  Full width, not indented under the code. The `Game N` gutter is the only thing to
                  the left of a code, and leaving the summary clear of it left a column of nothing
                  down the side of the card.
                */}
                {openCode === entry.code && entry.matchId !== null && (
                  <LinkedGameSummary matchId={entry.matchId} result={entry.result} />
                )}
              </li>
            ))}
          </ul>

          {/*
            Below the list rather than up in the header: it is an action on the list, it only makes
            sense once the list has something in it, and the header group has to stay two items wide
            so that re-check doesn't move when the register button appears.
          */}
          <div className="mt-2">
            <CopyAction
              text={codeSheet(match, codes.data)}
              label="Copy all codes"
              title="Copies both team codes and every game's code as one block, ready to paste to the teams."
              message={`Copied ${match.teamA?.code ?? "TBD"} vs ${match.teamB?.code ?? "TBD"} and its ${codes.data.length === 1 ? "code" : `${codes.data.length} codes`}.`}
              icon={ClipboardList}
              onReport={onSaved}
            />
          </div>
        </>
      )}

      <ErrorLine message={recheck.isError ? errorMessage(recheck.error) : null} />

      {adding && checked === null && (
        <div className="mt-2.5 flex flex-wrap items-end gap-2">
          <div className="grow min-w-56">
            <label className={LABEL_CLASS} htmlFor={`code-${matchId}`}>
              Code
            </label>
            <input
              id={`code-${matchId}`}
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder="44 characters, straight from Discord"
              className={`${CONTROL_CLASS} font-mono text-xs`}
            />
          </div>
          <div className="w-24">
            <label className={LABEL_CLASS} htmlFor={`code-game-${matchId}`}>
              Game
            </label>
            <input
              id={`code-game-${matchId}`}
              type="number"
              min={1}
              max={5}
              value={game}
              onChange={e => setGame(e.target.value)}
              placeholder="next"
              title="Leave blank to take the next free slot."
              className={CONTROL_CLASS}
            />
          </div>
          <button
            type="button"
            onClick={() => check.mutate()}
            disabled={!valid || check.isPending}
            className={ACTION_SM_PRIMARY}
          >
            {check.isPending ? "Checking…" : "Check"}
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setCode("");
            }}
            className={ACTION_SM}
          >
            Cancel
          </button>

          {trimmed !== "" && !valid && (
            <p className="text-ccs-red text-xs w-full">
              A tournament code is exactly {CODE_LENGTH} characters; this one is {trimmed.length}.
            </p>
          )}
          <p className="text-text-dim text-xs w-full">
            Checking asks Riot what was played on this code and shows it to you. Nothing is recorded
            until you confirm.
          </p>
          <ErrorLine message={check.isError ? checkFailure(check.error) : null} />
        </div>
      )}

      {checked !== null && (
        <StagedCode
          staged={checked}
          match={match}
          busy={busy}
          onConfirm={() => confirm.mutate(checked)}
          // An unknown code was never attached, so there is nothing to delete — dismissing it is
          // local. Calling DELETE for one would 404.
          onDiscard={() => (checked.codeValid ? abandon.mutate(checked) : setChecked(null))}
          error={
            confirm.isError
              ? errorMessage(confirm.error)
              : abandon.isError
                ? `Couldn't discard it: ${errorMessage(abandon.error)}. The code is staged against this match either way — delete it from the list above.`
                : null
          }
        />
      )}
    </div>
  );
}

/**
 * One code, with its state and the actions its state allows.
 *
 * The delete button's condition mirrors the endpoint's own guard, which is **not** `confirmed`
 * alone: the Riot callback links a played game to whatever code it finds without checking
 * `confirmed`, so a merely staged code can have performance rows behind it, and removing one of
 * those is site-admin. Offering the button on `!confirmed` would give a league admin a button that
 * always answers 403.
 */
function CodeRow({
  entry,
  matchId,
  isSiteAdmin,
  open,
  onToggle,
  onReport,
  onDeleted,
}: {
  entry: MatchCode;
  matchId: number;
  isSiteAdmin: boolean;
  open: boolean;
  onToggle: () => void;
  onReport: (message: string) => void;
  onDeleted: (removed: { ingestRemoved: string | null }) => void | Promise<void>;
}) {
  const destroysAGame = entry.confirmed || entry.matchId !== null;
  const canDelete = isSiteAdmin || !destroysAGame;
  const [arming, setArming] = useState(false);

  const remove = useMutation({
    mutationFn: () => deleteCode(matchId, entry.code),
    onSuccess: async removed => {
      setArming(false);
      await onDeleted(removed);
    },
  });

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-heading text-[10px] text-text-dim w-12 shrink-0">
          Game {entry.game}
        </span>
        {/*
          The code *is* the link when there is a game behind it. A separate "see the game" button was
          a fourth control on the row, which wrapped the delete button onto a line of its own — and
          the code is the thing you want to click anyway.
        */}
        {entry.matchId === null ? (
          <code className="font-mono text-xs text-text break-all">{entry.code}</code>
        ) : (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            title="Show a summary of the game recorded on this code"
            className="font-mono text-xs text-brand break-all text-left underline decoration-dotted decoration-from-font underline-offset-2 hover:decoration-solid cursor-pointer bg-transparent border-none p-0"
          >
            {entry.code}
          </button>
        )}
        <CopyAction
          text={entry.code}
          title={`Copy the code for game ${entry.game}`}
          message={`Copied the code for game ${entry.game}.`}
          icon={Copy}
          onReport={onReport}
        />

        {/*
          The result is deliberately *not* on this row. It was, briefly: it reads off the same joined
          row as `matchId`, so it is free to have. But it duplicates the first line of the summary the
          code already opens, and a sixth item wrapped the delete button onto a line of its own —
          which is the same reason the "see the game" button was folded into the code itself.
        */}
        <Pill muted={!entry.confirmed}>{entry.confirmed ? "confirmed" : "pending"}</Pill>

        {canDelete && (
          <button
            type="button"
            onClick={() => (destroysAGame && !arming ? setArming(true) : remove.mutate())}
            disabled={remove.isPending}
            title={
              destroysAGame
                ? "Removes the code and the game recorded on it, including its player stats."
                : "Drops the staged code. Nothing else is touched."
            }
            className={ACTION_SM_DANGER}
          >
            <Trash2 size={13} aria-hidden="true" />
            {remove.isPending
              ? "Deleting…"
              : arming
                ? "Really delete — this removes the game"
                : "Delete"}
          </button>
        )}

        {arming && !remove.isPending && (
          <button type="button" onClick={() => setArming(false)} className={ACTION_SM}>
            Keep it
          </button>
        )}
      </div>
      <ErrorLine message={remove.isError ? errorMessage(remove.error) : null} />
    </>
  );
}

/**
 * The staged code, and the decision it is waiting on.
 *
 * Three outcomes, kept distinct because the API keeps them distinct — and a Riot outage is none of
 * them: it arrives as a `502` on the check and never reaches here, which is exactly the confusion
 * this flow was rewritten to remove.
 *
 * Only the middle two are actually *staged*. An unknown code is deliberately left unattached
 * upstream, so `game` is `null` and there is nothing to confirm or delete.
 *
 * Takes the whole match rather than its id because the check now reports **which teams Riot says
 * played**, and the only way that report is worth anything is next to the two teams this match is
 * between.
 */
function StagedCode({
  staged,
  match,
  busy,
  error,
  onConfirm,
  onDiscard,
}: {
  staged: CodeCheck;
  match: ScheduleMatch;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onDiscard: () => void;
}) {
  /**
   * Whether every game's reported result names this match's two teams.
   *
   * Only worth saying when it holds for all of them — one unknown pair means the set was never
   * checked, and saying "the teams check out" off a partial answer is worse than saying nothing.
   */
  const agreed =
    staged.matchIds.length > 0 &&
    staged.matchIds.every((_, i) => teamsAgree(staged.reportedTeams[i] ?? null, match) === true);

  return (
    <div className="mt-2.5 border border-border rounded-md p-3 bg-bg2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 mb-2">
        <span className={LABEL_CLASS}>
          {staged.game === null ? "Not registered" : `Staged for game ${staged.game}`}
        </span>
        <code className="font-mono text-[11px] text-text-dim break-all">{staged.code}</code>
      </div>

      {!staged.codeValid ? (
        <p className="text-ccs-red text-xs">
          Riot doesn&apos;t know that code, so nothing was attached to this match — check it was
          copied whole and try again.
        </p>
      ) : !staged.exists ? (
        <div className="flex flex-col gap-2">
          <Provenance staged={staged} matchId={match.id} />
          <p className="text-text-secondary text-xs">
            That code is real, but no game has been played on it yet. Confirming now keeps it attached
            to this match, and a re-check records the game once it has been played.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Provenance staged={staged} matchId={match.id} />
          {/*
            Driven off `matchIds`, which is the authoritative list — `matchData` and `reportedTeams`
            are both index-aligned with it. A game with no payload is not a game with no outcome:
            it gets the reported result instead of an empty card, and confirming records it either
            way.
          */}
          {staged.matchIds.map((id, i) => {
            const data = staged.matchData[i] ?? null;
            const reported = staged.reportedTeams[i] ?? null;

            return (
              <div key={id} className="flex flex-col gap-1">
                {data ? (
                  <GameSummary data={data} matchId={id} />
                ) : (
                  <ResultOnlyGame
                    matchId={id}
                    reported={reported}
                    why={staged.previewErrors.find(e => e.matchId === id)?.error}
                  />
                )}
                <WrongTeams reported={reported} match={match} />
              </div>
            );
          })}
          <p className="text-text-secondary text-xs">
            {staged.matchIds.length === 1
              ? `Confirming records this as game ${staged.game ?? "?"} of this match.`
              : `Confirming records these ${staged.matchIds.length} games against this match.`}{" "}
            {agreed
              ? `Riot's report of ${staged.matchIds.length === 1 ? "the result names" : "each result names"} ${match.teamA?.code} and ${match.teamB?.code}, which is this match.`
              : "Check the teams are the ones you expect before you do."}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
        {staged.codeValid && (
          <button type="button" onClick={onConfirm} disabled={busy} className={ACTION_SM_PRIMARY}>
            {busy ? "Working…" : staged.exists ? "Confirm" : "Confirm anyway"}
          </button>
        )}
        <button type="button" onClick={onDiscard} disabled={busy} className={ACTION_SM}>
          {staged.codeValid ? "Discard" : "Close"}
        </button>
      </div>

      <ErrorLine message={error} />
    </div>
  );
}

/**
 * A game Riot reported on the code but won't hand over.
 *
 * Two different things arrive here and only one of them is a loss. `match-v5` denying a match id it
 * was told about is upstream's `result-only`: the winner and loser came back in the same response as
 * the id, so confirming records the result, the standings and the series are right, and it is the
 * *view* of the game that is missing — until Riot's index recovers and a re-check fetches the payload
 * in place. Saying "there is nothing to preview" and stopping read as a failure, and sent an admin
 * looking for a game that was about to land correctly.
 *
 * The other is a game nothing is known about beyond its id: no payload and no reported teams either,
 * where `previewErrors` is all there is to go on.
 *
 * A card rather than a line of prose because it sits in a list of `GameSummary` cards, one per game,
 * and a bare paragraph between two cards doesn't read as one of the games.
 */
function ResultOnlyGame({
  matchId,
  reported,
  why,
}: {
  matchId: string;
  reported: ReportedTeams | null;
  /** From `previewErrors`, when upstream said why the payload couldn't be fetched. */
  why?: string;
}) {
  return (
    <ResultOnlyCard
      matchId={matchId}
      label={reported === null ? "no preview" : "result only"}
      result={reported}
      note={
        reported === null
          ? `Played on this code, but it can't be previewed${why === undefined ? "" : `: ${why}`}. Confirming still records whatever Riot will give up for it.`
          : "Riot has no data for this game, so the result is all confirming can record — it counts for the standings and the series, but there is no game to view until a re-check picks the data up."
      }
    />
  );
}

/**
 * The reported result naming two teams that are not this match's two teams.
 *
 * The mistake the two-step flow exists to catch is a code pasted against the wrong match, and
 * `Provenance` catches it only for a code we minted — a `/code`-cut one carries no `scheduleMatchId`
 * to check against. This catches it from the other end, off the result, which works for any code:
 * upstream resolves the reported puuids through the same roster vote ingest runs, so these are the
 * codes confirming will write to `matchlist`.
 *
 * Renders nothing when the two agree, and nothing when either side is unknown — see `teamsAgree`.
 */
function WrongTeams({ reported, match }: { reported: ReportedTeams | null; match: ScheduleMatch }) {
  if (reported === null || teamsAgree(reported, match) !== false) return null;

  return (
    <div className="flex items-start gap-1.5 text-xs text-ccs-red">
      <TriangleAlert size={13} aria-hidden="true" className="shrink-0 mt-0.5" />
      <p>
        Riot reports {reported.winner} beat {reported.loser}, but this match is{" "}
        {match.teamA?.code ?? "TBD"} vs {match.teamB?.code ?? "TBD"}. Confirming would record that
        result against this match — check the code belongs here before you do.
      </p>
    </div>
  );
}

/**
 * Whether the teams Riot reported are the two this match is between.
 *
 * `null` means "can't say", which is not the same as a mismatch: a bracket slot nobody has reached
 * yet has no teams to compare against, and upstream reports `null` for a pair its rosters didn't
 * cover. Reading either as a disagreement would put a red warning on every code registered before a
 * bracket resolves.
 *
 * Unordered, because which of the two won is the result and not a mismatch.
 */
function teamsAgree(reported: ReportedTeams | null, match: ScheduleMatch): boolean | null {
  const a = match.teamA?.code;
  const b = match.teamB?.code;
  if (reported === null || a === undefined || b === undefined) return null;

  return (
    (reported.winner === a && reported.loser === b) ||
    (reported.winner === b && reported.loser === a)
  );
}

/**
 * What the code says about itself, when it disagrees with where it is being put.
 *
 * Upstream reports `mintedByUs` and `codeMeta` and **enforces neither**, because recovering a legacy
 * day means attaching codes cut by the old `/code` command — a different provider and the older
 * `{ week, conf }` metadata. So a mismatch is a warning, not a refusal, and this is the warning.
 *
 * The match-id line is the one that matters: a code minted for a different scheduled match is the
 * "pasted against the wrong match" mistake this whole two-step flow exists to catch. Renders nothing
 * when the code came from us and names this match, which is the ordinary case.
 */
function Provenance({ staged, matchId }: { staged: CodeCheck; matchId: number }) {
  const meta = staged.codeMeta;
  const wrongMatch = meta?.scheduleMatchId != null && meta.scheduleMatchId !== matchId;
  if (!wrongMatch && staged.mintedByUs) return null;

  return (
    <div className={`flex items-start gap-1.5 text-xs ${wrongMatch ? "text-ccs-red" : "text-text-secondary"}`}>
      <TriangleAlert size={13} aria-hidden="true" className="shrink-0 mt-0.5" />
      <p>
        {wrongMatch
          ? `This code was minted for scheduled match ${meta?.scheduleMatchId}, not this one. Registering it here is allowed, but check it is really the right game.`
          : "This code wasn't minted by us — most likely the old /code command. That is normal when recovering a past day."}
        {meta === null
          ? " Its metadata isn't readable, so there is nothing else to go on."
          : meta.seasonDay !== null
            ? ` It names season day ${meta.seasonDay}.`
            : meta.week !== null
              ? ` It names week ${meta.week}.`
              : ""}
      </p>
    </div>
  );
}

/**
 * A copy button that says it worked, twice.
 *
 * The icon flips to a tick for a moment *and* a toast goes up. Both, because they answer different
 * doubts: the tick confirms the click landed on the control you aimed at, which matters when four
 * rows carry the same icon, and the toast names what was copied, which matters when you are pasting
 * three codes into Discord in a row and cannot tell from the clipboard which one you have.
 *
 * A rejected `writeText` is reported rather than swallowed. It happens — a document without focus, a
 * clipboard permission denied — and a silently unchanged clipboard means pasting whatever was there
 * before, which for this screen is very likely *another team's code*.
 */
function CopyAction({
  text,
  title,
  message,
  icon: Icon,
  label,
  onReport,
}: {
  text: string;
  title: string;
  /** What the toast says on success. Name the thing, not the action. */
  message: string;
  icon: typeof Copy;
  /** Absent for the icon-only variant that sits in a code row. */
  label?: string;
  onReport: (message: string) => void;
}) {
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 1500);
    return () => clearTimeout(t);
  }, [done]);

  const run = () => {
    const clip = navigator.clipboard;
    if (!clip) {
      onReport("This browser won't give up the clipboard here — select the text and copy it by hand.");
      return;
    }
    void clip.writeText(text).then(
      () => {
        setDone(true);
        onReport(message);
      },
      () => onReport("Couldn't reach the clipboard, so nothing was copied. Select the text by hand."),
    );
  };

  const Shown = done ? Check : Icon;
  const color = done ? "text-ccs-green" : "text-text-dim hover:text-text-bright";

  return (
    <button
      type="button"
      onClick={run}
      title={title}
      aria-label={label === undefined ? title : undefined}
      className={
        label === undefined
          ? `inline-flex items-center shrink-0 cursor-pointer transition-colors ${color}`
          : `${ACTION_QUIET_BASE} transition-colors ${color}`
      }
    >
      <Shown size={label === undefined ? 13 : 12} aria-hidden="true" />
      {label}
    </button>
  );
}

/**
 * Every code for one match as one pasteable block:
 *
 * ```
 * ANE vs OE
 * Game 1: <code>
 * Game 2: <code>
 * ```
 *
 * Headed with the team codes because the block is going to a Discord channel where nothing else says
 * which match it is for, and a bare list of 44-character strings is indistinguishable from any other
 * match's. Sorted by game rather than trusted to arrive that way — the order is the one thing a
 * recipient reads it by.
 */
function codeSheet(match: ScheduleMatch, codes: readonly MatchCode[]): string {
  const a = match.teamA?.code ?? "TBD";
  const b = match.teamB?.code ?? "TBD";
  const games = [...codes].sort((x, y) => x.game - y.game);

  return [`${a} vs ${b}`, ...games.map(c => `Game ${c.game}: ${c.code}`)].join("\n");
}

/** The typed game slot, or `undefined` for "the next free one". */
function slotOf(input: string): number | undefined {
  const n = Number(input.trim());
  return input.trim() !== "" && Number.isInteger(n) && n >= 1 ? n : undefined;
}

/** A `409` on the check says which match already holds the code, which is the useful half. */
function checkFailure(e: unknown): string {
  const clash = codeConflict(e);
  const base = errorMessage(e);
  if (!clash) return base;

  if (clash.heldBy !== undefined) {
    return `${base} Game ${clash.game ?? "?"} of this match is already held by a confirmed code (…${clash.heldBy.slice(-8)}).`;
  }

  const where =
    clash.scheduleMatchId === null
      ? "another match"
      : `scheduled match ${clash.scheduleMatchId}, game ${clash.game ?? "?"}`;
  return `${base} It is on ${where}${clash.confirmed === false ? ", still pending" : ""}.`;
}

