/**
 * Imported Drafter games for staff, in served game order. Sides are the provider's physical blue
 * and red for that game, not the fixture's team A and B, and picks keep their side's pick order.
 *
 * Each game is two columns, one per side: the side's bans as a row of icons, then its five picks,
 * each labeled with the position it was locked into. Site admins get a link to correct each game,
 * because the game issues list catches only champion mismatches and missing drafts.
 */
import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { ChampionIcon } from "../ChampionIcon";
import { useChampions } from "../../hooks/useChampions";
import { NO_BAN_CHAMPION, type ChampionLookup } from "../../lib/championData";
import { cn } from "../../lib/cn";
import { DRAFT_ROLES, DRAFT_SIDES, type DraftGame, type DraftRole, type DraftSide, type DraftTeamSide } from "../../lib/api";
import { draftCorrectionPath } from "../admin/drafts/draftCorrectionLink";
import { FirstPickTag } from "./DraftMarks";
import { DRAFT_ROLE_LABEL, DRAFT_ROLE_STATUS_LABEL } from "./draftLabels";
import { Badge } from "@/components/ui/badge";

export function DraftGames({ games, correctionSeriesId }: {
  games: readonly DraftGame[];
  /** The series to open in the correction editor; null hides the link (site admins only). */
  correctionSeriesId: string | null;
}) {
  const champions = useChampions();
  if (games.length === 0) return <p className="text-xs text-text-dim">No draft results imported yet.</p>;

  return (
    <ul className="flex flex-col gap-2">
      {games.map(game => (
        <li key={game.gameNumber} className="rounded-md border border-border bg-bg3 p-2.5">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="font-heading text-sm text-text-bright">Game {game.gameNumber}</span>
            {game.patch && <span className="text-xs text-text-dim">Patch {game.patch}</span>}
            {game.roleStatus && <Badge variant="muted">{DRAFT_ROLE_STATUS_LABEL[game.roleStatus]}</Badge>}
            <span className="ml-auto flex items-center gap-3 text-xs">
              {correctionSeriesId && (
                <Link
                  to={draftCorrectionPath({ drafterSeriesId: correctionSeriesId, game: game.gameNumber })}
                  className="text-brand hover:underline"
                >
                  Correct draft
                </Link>
              )}
              {game.url && (
                <a href={game.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline">
                  View draft
                  <ExternalLink size={12} aria-hidden="true" />
                </a>
              )}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {DRAFT_SIDES.map(side => (
              <SideColumn
                key={side}
                side={side}
                team={game[side]}
                // Without first selection blue always picks first, so the chip would only restate the side.
                firstPick={game.firstSelection === true && game.firstPick === side}
                champions={champions}
              />
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The position each pick was locked into, by champion. Empty until roles are confirmed. */
function positionsOf(team: DraftTeamSide): Map<number, DraftRole> {
  const out = new Map<number, DraftRole>();
  for (const role of DRAFT_ROLES) {
    const id = team.roles[role];
    if (id !== null) out.set(id, role);
  }
  return out;
}

function SideColumn({ side, team, firstPick, champions }: {
  side: DraftSide;
  team: DraftTeamSide;
  firstPick: boolean;
  champions: ChampionLookup | null;
}) {
  const label = side === "blue" ? "Blue" : "Red";
  const positions = positionsOf(team);
  return (
    <section
      aria-label={`${label} side`}
      className={cn("min-w-0 rounded-md border border-border border-t-2 bg-bg2 p-2", side === "blue" ? "border-t-side-blue" : "border-t-side-red")}
    >
      <div className="mb-2 flex min-w-0 items-center gap-2">
        <span className={cn("min-w-0 truncate font-heading text-xs", side === "blue" ? "text-side-blue" : "text-side-red")}>
          {team.name || `${label} side`}
        </span>
        <FirstPickTag shown={firstPick} />
      </div>
      <div className="mb-2 flex items-center gap-1" aria-label={`${label} bans`}>
        {team.bans.map((ban, i) => (
          <ChampionIcon
            key={i}
            // A skipped ban keeps its slot; draw it with Riot's no-ban artwork.
            champion={ban ?? NO_BAN_CHAMPION.key}
            lookup={champions}
            size={20}
            tile
            className="flex opacity-60"
          />
        ))}
      </div>
      <ol className="flex flex-col gap-1" aria-label={`${label} picks`}>
        {team.picks.map((pick, i) => {
          const position = pick === null ? undefined : positions.get(pick);
          return (
            <li key={i} className="flex min-w-0 items-center gap-2">
              <ChampionIcon champion={pick} lookup={champions} size={22} tile showName className="flex min-w-0 flex-1 items-center gap-1.5" />
              {/* Unconfirmed roles leave this empty; the game's role status badge says why. */}
              {position && <span className="shrink-0 text-[10px] text-text-dim">{DRAFT_ROLE_LABEL[position]}</span>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
