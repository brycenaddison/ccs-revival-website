/**
 * How a stored draft differs from the game Riot recorded, per draft side, shared by the game issues
 * list and the correction editor. A draft side maps to the played team sharing most of its picks,
 * so a side is named by that team and the draft's own blue or red, never by map side.
 */
import { useQuery } from "@tanstack/react-query";
import { ChampionIcon } from "../../ChampionIcon";
import { useChampions } from "../../../hooks/useChampions";
import { queries } from "../../../lib/queries";
import type { ChampionLookup } from "../../../lib/championData";
import type { DraftSide, DraftSideDifference } from "../../../lib/api";

/** A served `teams.id` named from the conference's teams, or null until (or unless) it resolves. */
export function useDraftTeamName(conf: string | null, teamId: number | null): string | null {
  const teams = useQuery({ ...queries.teamsForConf(conf ?? ""), enabled: !!conf && teamId !== null });
  if (teamId === null) return null;
  return teams.data?.find(team => team.id === teamId)?.name ?? null;
}

export function DraftSideLabel({ side, conf, teamId }: { side: DraftSide; conf: string | null; teamId: number | null }) {
  const name = useDraftTeamName(conf, teamId);
  return (
    <span className="min-w-0 truncate font-heading text-xs">
      <span className={side === "blue" ? "text-side-blue" : "text-side-red"}>{side === "blue" ? "Blue draft" : "Red draft"}</span>
      {name && <span className="text-text-bright"> · {name}</span>}
    </span>
  );
}

export function ChampionRow({ ids, champions, label }: { ids: readonly number[]; champions: ChampionLookup | null; label: string }) {
  return (
    <span className="flex flex-wrap items-center gap-1" aria-label={label}>
      {ids.map(id => <ChampionIcon key={id} champion={id} lookup={champions} size={22} tile className="flex" />)}
    </span>
  );
}

export function DraftDifference({ difference, conf }: { difference: readonly DraftSideDifference[]; conf: string | null }) {
  const champions = useChampions();
  const differing = difference.filter(d => d.draftOnly.length > 0 || d.playedOnly.length > 0);
  if (differing.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1.5">
      {differing.map(d => (
        <li key={d.side} className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <DraftSideLabel side={d.side} conf={conf} teamId={d.teamId} />
          {d.draftOnly.length > 0 && (
            <span className="flex items-center gap-1.5 text-[11px] text-text-dim">
              Drafted, not played
              <ChampionRow ids={d.draftOnly} champions={champions} label="Drafted, not played" />
            </span>
          )}
          {d.playedOnly.length > 0 && (
            <span className="flex items-center gap-1.5 text-[11px] text-text-dim">
              Played, not drafted
              <ChampionRow ids={d.playedOnly} champions={champions} label="Played, not drafted" />
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
