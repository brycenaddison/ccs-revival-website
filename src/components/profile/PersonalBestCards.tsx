/**
 * A player's five best games, each one named.
 *
 * A best is a value plus a game *reference*, which made the original cards a number over a date.
 * Both halves of the matchup are now recoverable for free. The **opponent** is on the reference
 * itself (`opponent` metadata, `opponentCode` as the fallback label). The player's **own** team is
 * not, but the best's `matchId` is in the same response's `games[]`, so one map lookup supplies it
 * along with the role. Neither costs a request.
 *
 * The card links to the *series* when one exists, because that is the page a reader wants — the
 * game itself is one click further in. A legacy row with no `scheduleMatchId` links to the game.
 */

import { Link } from "react-router-dom";
import { roleLabel, type ProfileGame, type ProfilePersonalBest } from "../../lib/api";
import { dec, int, signed } from "../../lib/statFormat";
import { fmtDay } from "../../lib/utils";
import { ChampionIcon } from "../ChampionIcon";
import { kdaText, TeamLogo, useConfLabel, type TeamIndex } from "./profileUi";

interface Best {
  key: string;
  label: string;
  color: string;
  /** The headline number. Takes the joined game line, because one of these isn't a ratio at all. */
  text: (value: number, line: ProfileGame | null) => string;
}

/**
 * The five upstream serves, in the order they are worth reading.
 *
 * **Best KDA shows the K/D/A line, not the ratio.** A player's best-KDA game is very often a
 * deathless one, so the ratio is `Infinity` — and a card whose entire headline is "Perfect" says
 * less than `12/0/9` does. The ratio is the sort key upstream used to pick the game; it is not the
 * interesting part of the answer. It only falls back to the ratio when the game isn't in `games[]`
 * to read the line from, which shouldn't happen.
 */
const BESTS: readonly Best[] = [
  {
    key: "kda",
    label: "Best KDA",
    color: "var(--gold)",
    text: (value, line) => (line ? `${line.kills}/${line.deaths}/${line.assists}` : kdaText(value)),
  },
  { key: "damageMin", label: "Damage / min", color: "var(--orange)", text: value => int(value) },
  { key: "csDiffAt14", label: "CS diff @14", color: "var(--blue)", text: value => signed(value) },
  { key: "csMin", label: "CS / min", color: "var(--green)", text: value => dec(2)(value) },
  { key: "visionScoreMin", label: "Vision / min", color: "var(--purple)", text: value => dec(2)(value) },
];

interface Props {
  personalBests: Record<string, ProfilePersonalBest | null>;
  gamesById: ReadonlyMap<string, ProfileGame>;
  teamIndex: TeamIndex;
}

export function PersonalBestCards({ personalBests, gamesById, teamIndex }: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {BESTS.map(spec => (
        <BestCard
          key={spec.key}
          spec={spec}
          best={personalBests[spec.key] ?? null}
          gamesById={gamesById}
          teamIndex={teamIndex}
        />
      ))}
    </div>
  );
}

function BestCard({
  spec,
  best,
  gamesById,
  teamIndex,
}: {
  spec: Best;
  best: ProfilePersonalBest | null;
  gamesById: ReadonlyMap<string, ProfileGame>;
  teamIndex: TeamIndex;
}) {
  const confLabel = useConfLabel();
  const { label, color } = spec;

  if (!best) {
    return (
      <div className="rounded-lg border border-border bg-bg2 p-3.5">
        <div className="font-heading text-[9px] uppercase tracking-wider text-text-dim">{label}</div>
        <div className="mt-1 font-display text-[26px] leading-none text-text-dim">—</div>
        <p className="mt-2 text-[11px] text-text-dim">No qualifying game.</p>
      </div>
    );
  }

  const { game } = best;
  const line = gamesById.get(game.matchId) ?? null;
  const href = game.scheduleMatchId !== null
    ? `/match/${game.scheduleMatchId}`
    : `/game/${encodeURIComponent(game.matchId)}`;

  return (
    <Link
      to={href}
      className="block rounded-lg border border-border bg-bg2 p-3.5 no-underline hover:border-accent"
    >
      <div className="font-heading text-[9px] uppercase tracking-wider text-text-dim">{label}</div>
      <div className="mt-1 font-display text-[26px] leading-none" style={{ color }}>
        {spec.text(best.value, line)}
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <ChampionIcon champion={game.champId} name={game.champ} size={22} decorative />
        <span className="min-w-0 truncate font-heading text-[11px] text-text-bright">
          {game.champ ?? "Unknown"}
          {line?.role && <span className="text-text-secondary"> · {roleLabel(line.role)}</span>}
        </span>
      </div>

      {(line || game.opponentCode) && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-text-secondary">
          {line && (
            <>
              <TeamLogo team={teamIndex(line.conf, line.team)} code={line.team} size={16} />
              <span className="truncate">{line.team}</span>
            </>
          )}
          <span className="text-text-dim">vs</span>
          <TeamLogo team={game.opponent} code={game.opponentCode ?? "?"} size={16} />
          <span className="truncate">{game.opponent?.code ?? game.opponentCode ?? "Unknown"}</span>
        </div>
      )}

      <div className="mt-1.5 truncate text-[10px] text-text-dim">
        {[confLabel(game.conf).short, fmtDay(game.startTime)].filter(Boolean).join(" · ")}
      </div>
    </Link>
  );
}
