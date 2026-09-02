/**
 * One player's line on the scoreboard: a subgrid row of the board's seven tracks.
 *
 * Left to right, the client's order: the champion's splash with the level over it, the name, summoner
 * spells and the two rune marks, the seven item slots, KDA, then the two switchable columns. The name
 * is a `PlayerLink` when the context linked the puuid to a profile and plain text otherwise; the text
 * is the same either way (`participants.ts` decides it), so a linked and an unlinked player read
 * alike. The lane is not drawn: the rows are already in lane order, and the client's splash layout
 * leaves it out too.
 *
 * The left border is the side, not the result. The header above the block already says who won, and
 * coloring a row by side is what lets a reader tell the two blocks apart when the board is scrolled.
 */

import { cn } from "../../../lib/cn";
import type { GameParticipant } from "../../../lib/game/participants";
import { PlayerLink } from "../../profile/PlayerLink";
import { kdaText, kdaTone } from "../../profile/profileUi";
import { useGameView } from "../GameView";
import { ItemIcon, RuneIcon, SpellIcon } from "../RiotIcons";
import { ChampionSplash } from "./ChampionSplash";
import { CSGoldVision } from "./CSGoldVision";
import { DamageMeter } from "./DamageMeter";
import type { Density } from "./density";
import type { DamageStat, FarmStat } from "./StatSwitcher";

export function PlayerRow({
  player,
  density: d,
  damageStat,
  farmStat,
  maxima,
}: {
  player: GameParticipant;
  density: Density;
  damageStat: DamageStat;
  farmStat: FarmStat;
  maxima: Record<DamageStat, number>;
}) {
  const { lookups, durationSeconds } = useGameView();
  const p = player.raw;
  const kda = p.deaths === 0 ? Number.POSITIVE_INFINITY : (p.kills + p.assists) / p.deaths;
  const primary = p.perks?.styles?.[0];
  const secondary = p.perks?.styles?.[1];

  return (
    <div className={cn("col-span-7 grid grid-cols-subgrid items-center", d.row, player.teamId === 100 ? "border-side-blue" : "border-side-red")}>
      <ChampionSplash championId={player.championId} level={p.champLevel} density={d} />

      <PlayerLink
        profileId={player.profileId}
        className={cn(
          "relative z-10 min-w-0 truncate font-heading font-semibold text-text-bright no-underline hover:text-brand hover:underline",
          d.name,
        )}
        title={player.riotName}
      >
        {player.displayName}
      </PlayerLink>

      <span className={cn("flex", d.gap)}>
        <span className={cn("flex flex-col", d.gap)}>
          <SpellIcon spellId={p.summoner1Id} size={d.spell} lookup={lookups.spells} />
          <SpellIcon spellId={p.summoner2Id} size={d.spell} lookup={lookups.spells} />
        </span>
        <span className={cn("flex flex-col items-center", d.gap)}>
          <RuneIcon id={primary?.selections?.[0]?.perk} kind="perk" size={d.rune} lookup={lookups.runes} />
          <RuneIcon id={secondary?.style} kind="style" size={d.rune} lookup={lookups.runes} className="p-0.5" />
        </span>
      </span>

      <span className={cn("flex", d.gap)}>
        {[p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6].map((itemId, i) => (
          <ItemIcon key={i} itemId={itemId} size={d.item} lookup={lookups.items} />
        ))}
      </span>

      <span className={cn("flex w-full min-w-0 flex-col items-center whitespace-nowrap", d.text)}>
        <span className="flex gap-1 font-mono font-semibold text-text-bright">
          <span>{p.kills}</span>
          <span className="font-normal text-text-dim">/</span>
          <span>{p.deaths}</span>
          <span className="font-normal text-text-dim">/</span>
          <span>{p.assists}</span>
        </span>
        <span className="text-[0.85em]">
          <span className={kdaTone(kda)}>{kdaText(kda)}</span>
          <span className="text-text-muted"> KDA</span>
        </span>
      </span>

      <DamageMeter
        stat={damageStat}
        value={damageStat === "damage" ? p.totalDamageDealtToChampions : damageStat === "damageTaken" ? p.totalDamageTaken : p.timeCCingOthers}
        max={maxima[damageStat]}
        density={d}
      />

      <CSGoldVision
        stat={farmStat}
        gold={p.goldEarned}
        cs={p.totalMinionsKilled + p.neutralMinionsKilled}
        seconds={p.timePlayed > 0 ? p.timePlayed : durationSeconds}
        controlWards={p.visionWardsBoughtInGame}
        wardsPlaced={p.wardsPlaced}
        wardsKilled={p.wardsKilled}
        visionScore={p.visionScore}
        density={d}
      />
    </div>
  );
}
