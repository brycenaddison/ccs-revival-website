import type { ChampionLookup } from "../../lib/championData";
import { ChampionIcon } from "../ChampionIcon";

interface Ban {
  championId?: number | null;
  pickTurn?: number | null;
  /** Resolved display name carried by the season feed; raw Riot bans omit it. */
  champion?: string | null;
  /** Resolved display name carried by the team matchlist. */
  name?: string | null;
}

interface Props {
  bans: readonly Ban[];
  champions: ChampionLookup | null;
  size: number;
  className?: string;
  /** Draw each ban as a clipped, lifted tile. See `ChampionIcon`. */
  tile?: boolean;
}

/**
 * Every ban slot the caller received, including Riot's -1 "no ban" sentinel.
 *
 * Keeping the map here prevents compact summaries and full box scores from quietly disagreeing
 * about whether a declined ban is part of the draft. `ChampionIcon` owns the sentinel artwork.
 */
export function BanIcons({ bans, champions, size, className, tile }: Props) {
  return (
    <>
      {bans.map((ban, i) => (
        <ChampionIcon
          key={`${ban.pickTurn ?? i}-${ban.championId ?? "unknown"}`}
          champion={ban.championId}
          lookup={champions}
          fallbackLabel={ban.champion ?? ban.name ?? undefined}
          size={size}
          tile={tile}
          className={className}
        />
      ))}
    </>
  );
}
