/**
 * The tournament codes one match is played on.
 *
 * Two ways a code gets here, and they coexist on purpose:
 *
 *  - **Minted from the schedule** — `POST /tournaments/:conf/schedule/:day/codes`, one Riot call per
 *    match, done a whole day at a time from `ScheduleSection`.
 *  - **Registered after the fact** — `POST /tournaments/schedule/:id/codes`, for a code that came from
 *    the `/code` Discord command. Registering one also asks Riot what was played on it and ingests
 *    whatever we did not already have, which is how a past day gets recovered: open its schedule and
 *    paste in the codes that were posted at the time.
 *
 * Codes are shown in full because that is the point of them — anyone holding one can join the lobby, so
 * this is a league-admin surface and nothing here is safe to render publicly. Delivering codes to
 * *players* is a separate piece of work that does not exist yet; until it does, `/code` posting them
 * into Discord is still the only thing that reaches a team on match night.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Plus } from "lucide-react";
import { CONTROL_CLASS, LABEL_CLASS } from "../../stats/FilterBar";
import { ACTION_SM, ACTION_SM_PRIMARY, ErrorLine } from "../../admin/adminUi";
import { queries, queryRoots } from "../../../lib/queries";
import { errorMessage, registerCode } from "../../../lib/api";

/** Riot tournament codes are always exactly this long, with no whitespace. */
const CODE_LENGTH = 44;

export function MatchCodes({
  matchId,
  onSaved,
}: {
  matchId: number;
  onSaved: (message: string) => void;
}) {
  const qc = useQueryClient();
  const codes = useQuery(queries.matchCodes(matchId));
  const [adding, setAdding] = useState(false);
  const [code, setCode] = useState("");
  const [game, setGame] = useState(1);

  const register = useMutation({
    mutationFn: () => registerCode(matchId, code.trim(), game),
    onSuccess: async result => {
      const ingested = result.ingested.filter(g => g.status === "ingested").length;
      const known = result.ingested.filter(g => g.status === "duplicate").length;
      const failed = result.ingested.filter(g => g.status === "failed").length;

      setCode("");
      setAdding(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryRoots.schedule }),
        // An ingested game is a new result, so the standings and every stats board move with it.
        qc.invalidateQueries({ queryKey: queryRoots.standings }),
        qc.invalidateQueries({ queryKey: queryRoots.stats }),
      ]);

      onSaved(
        result.ingested.length === 0
          ? "Code registered. Riot has no games on it yet."
          : `Code registered. ${describe(ingested, known, failed)}`,
      );
    },
  });

  const trimmed = code.trim();
  const valid = trimmed.length === CODE_LENGTH;

  return (
    <div className="border-t border-border pt-2.5 mt-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className={LABEL_CLASS}>Tournament codes</span>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className={ACTION_SM}>
            <Plus size={13} aria-hidden="true" />
            Register a code
          </button>
        )}
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
        <ul className="flex flex-col gap-1.5 mt-1">
          {codes.data.map(entry => (
            <li key={entry.code} className="flex items-center gap-2">
              <span className="font-heading text-[10px] tracking-wider uppercase text-text-dim w-12 shrink-0">
                Game {entry.game}
              </span>
              <code className="font-mono text-xs text-text break-all">{entry.code}</code>
              <button
                type="button"
                onClick={() => void navigator.clipboard?.writeText(entry.code)}
                aria-label={`Copy the code for game ${entry.game}`}
                className="text-text-dim hover:text-text-bright cursor-pointer shrink-0"
              >
                <Copy size={13} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding && (
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
          <div className="w-20">
            <label className={LABEL_CLASS} htmlFor={`code-game-${matchId}`}>
              Game
            </label>
            <input
              id={`code-game-${matchId}`}
              type="number"
              min={1}
              max={5}
              value={game}
              onChange={e => setGame(Math.max(1, Number(e.target.value) || 1))}
              className={CONTROL_CLASS}
            />
          </div>
          <button
            type="button"
            onClick={() => register.mutate()}
            disabled={!valid || register.isPending}
            className={ACTION_SM_PRIMARY}
          >
            {register.isPending ? "Registering…" : "Register"}
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
            Registering asks Riot what was played on this code and records anything we are missing.
          </p>
        </div>
      )}

      <ErrorLine message={register.isError ? errorMessage(register.error) : null} />
    </div>
  );
}

function describe(ingested: number, known: number, failed: number): string {
  const parts = [];
  if (ingested > 0) parts.push(`${ingested} new ${ingested === 1 ? "game" : "games"} recorded`);
  if (known > 0) parts.push(`${known} already known and now linked`);
  if (failed > 0) parts.push(`${failed} couldn't be recorded`);
  return parts.length === 0 ? "Nothing to record." : `${parts.join(", ")}.`;
}
