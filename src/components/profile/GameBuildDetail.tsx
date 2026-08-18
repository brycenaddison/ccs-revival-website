/**
 * Summoner spells and the final item build for one game.
 *
 * **This is the only place on the site either exists.** The `performance` table has no spell or
 * item columns, so no aggregate carries them and no amount of reshaping the profile payload would
 * produce them. They live only in the raw Riot payload behind `GET /m/:matchId`, which is a whole
 * match — far too much to fetch for every row of a hundred-game history.
 *
 * So it is fetched per row, on expand, and never before: `queries.matchData` is already keyed with
 * `staleTime: Infinity` because a finished game's payload is immutable, which means closing and
 * reopening a row costs nothing at all.
 *
 * Finding the player in the payload is by **puuid**, matched against the profile's own accounts.
 * That is exact and survives an account swap, which champion-matching would not — a mirror matchup
 * has the same champion on both sides. The champion fallback exists only for a profile whose
 * accounts Riot refuses to resolve, where an approximate answer beats an empty panel.
 */

import { useQuery } from "@tanstack/react-query";
import { errorMessage, type RiotParticipant } from "../../lib/api";
import { queries } from "../../lib/queries";
import { useGameAssets } from "../../hooks/useGameAssets";
import { EMPTY_SLOT, type GameAssetLookup } from "../../lib/gameAssets";

/** `item6` is the trinket. Riot numbers it in the same run as the six real slots. */
const ITEM_SLOTS = ["item0", "item1", "item2", "item3", "item4", "item5"] as const;

interface Props {
  matchId: string;
  puuids: ReadonlySet<string>;
  champId: number | null;
  win: boolean;
}

export function GameBuildDetail({ matchId, puuids, champId, win }: Props) {
  const query = useQuery(queries.matchData(matchId));
  const { items, spells } = useGameAssets();

  if (query.isPending) {
    return <Line>Loading build…</Line>;
  }
  if (query.error) {
    return <Line>{errorMessage(query.error)}</Line>;
  }

  const participants = query.data?.info?.participants ?? [];
  const player = findParticipant(participants, puuids, champId, win);
  if (!player) {
    return <Line>Build unavailable for this game.</Line>;
  }

  const trinket = player.item6;

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
      <Group label="Spells">
        <AssetIcon id={player.summoner1Id} lookup={spells} />
        <AssetIcon id={player.summoner2Id} lookup={spells} />
      </Group>

      <Group label="Build">
        {ITEM_SLOTS.map(slot => (
          <AssetIcon key={slot} id={player[slot]} lookup={items} />
        ))}
      </Group>

      <Group label="Trinket">
        <AssetIcon id={trinket} lookup={items} />
      </Group>

      {player.champLevel !== undefined && (
        <span className="font-mono text-[11px] text-text-secondary">Level {player.champLevel}</span>
      )}
    </div>
  );
}

/**
 * Riot serves every participant of the match; only one of them is this player.
 *
 * The champion fallback also tests `win`, because a mirror matchup puts the same champion on both
 * teams and the side is the only thing left to separate them.
 */
function findParticipant(
  participants: readonly RiotParticipant[],
  puuids: ReadonlySet<string>,
  champId: number | null,
  win: boolean,
): RiotParticipant | null {
  const byPuuid = participants.find(p => p.puuid && puuids.has(p.puuid));
  if (byPuuid) return byPuuid;
  if (champId === null) return null;
  return participants.find(p => p.championId === champId && p.win === win) ?? null;
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-heading text-[9px] uppercase tracking-wider text-text-dim">{label}</span>
      <span className="flex items-center gap-1">{children}</span>
    </div>
  );
}

/**
 * One item or spell square.
 *
 * An id of `0` is Riot saying the slot is genuinely empty, not that the lookup failed, so it draws
 * an empty frame. A lookup that hasn't loaded — or a Community Dragon outage — draws the same
 * frame rather than a broken image: artwork is decoration here, and the row above still carries
 * every number.
 */
function AssetIcon({ id, lookup }: { id: number | undefined; lookup: GameAssetLookup | null }) {
  const asset = id === undefined || id === EMPTY_SLOT ? undefined : lookup?.get(id);

  if (!asset) {
    return <span className="h-7 w-7 shrink-0 rounded border border-border bg-bg" aria-hidden="true" />;
  }

  return (
    <img
      src={asset.icon}
      alt=""
      title={asset.name}
      width={28}
      height={28}
      loading="lazy"
      decoding="async"
      className="h-7 w-7 shrink-0 rounded border border-border"
    />
  );
}

function Line({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-text-dim">{children}</p>;
}
