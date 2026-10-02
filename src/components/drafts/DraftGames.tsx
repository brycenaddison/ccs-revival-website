/**
 * Imported Drafter games for staff, in served game order. Sides are the provider's physical blue
 * and red for that game, not the fixture's team A and B, and picks keep their side's pick order.
 */
import { ExternalLink } from "lucide-react";
import { ChampionIcon } from "../ChampionIcon";
import { useChampions } from "../../hooks/useChampions";
import { NO_BAN_CHAMPION, type ChampionLookup } from "../../lib/championData";
import { DRAFT_ROLES, type DraftGame, type DraftSide, type DraftTeamSide } from "../../lib/api";
import { DRAFT_ROLE_LABEL, DRAFT_ROLE_STATUS_LABEL } from "./draftLabels";
import { Badge } from "@/components/ui/badge";

export function DraftGames({ games }: { games: readonly DraftGame[] }) {
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
            {game.url && (
              <a href={game.url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs text-brand hover:underline">
                View draft
                <ExternalLink size={12} aria-hidden="true" />
              </a>
            )}
          </div>
          <SideRow side="blue" team={game.blue} firstPick={game.firstPick === "blue"} champions={champions} />
          <SideRow side="red" team={game.red} firstPick={game.firstPick === "red"} champions={champions} />
        </li>
      ))}
    </ul>
  );
}

function SideRow({ side, team, firstPick, champions }: {
  side: DraftSide;
  team: DraftTeamSide;
  firstPick: boolean;
  champions: ChampionLookup | null;
}) {
  const hasRoles = DRAFT_ROLES.some(role => team.roles[role] !== null);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-1">
      <span className={`min-w-0 basis-full truncate font-heading text-xs sm:basis-40 ${side === "blue" ? "text-side-blue" : "text-side-red"}`}>
        {team.name || (side === "blue" ? "Blue side" : "Red side")}
        {firstPick && <span className="ml-1.5 text-text-dim">· First pick</span>}
      </span>
      <span className="flex items-center gap-1" aria-label={`${side === "blue" ? "Blue" : "Red"} bans`}>
        {team.bans.map((ban, i) => (
          <ChampionIcon
            key={i}
            // A skipped ban keeps its slot; draw it with Riot's no-ban artwork.
            champion={ban ?? NO_BAN_CHAMPION.key}
            lookup={champions}
            size={18}
            className="opacity-60"
          />
        ))}
      </span>
      <span className="flex items-center gap-1" aria-label={`${side === "blue" ? "Blue" : "Red"} picks`}>
        {team.picks.map((pick, i) => (
          <ChampionIcon key={i} champion={pick} lookup={champions} size={24} />
        ))}
      </span>
      {hasRoles && (
        <dl className="flex flex-wrap items-center gap-2">
          {DRAFT_ROLES.map(role => (
            <div key={role} className="flex items-center gap-1">
              <dt className="text-[10px] text-text-dim">{DRAFT_ROLE_LABEL[role]}</dt>
              <dd><ChampionIcon champion={team.roles[role]} lookup={champions} size={18} /></dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
