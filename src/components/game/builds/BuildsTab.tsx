/**
 * The Builds tab: one player at a time, their shop visits, their runes and their skill order.
 *
 * The final inventory and the runes come off the match payload and are always here. The build path
 * and the skill order are timeline reductions (`lib/game/timelineStats.ts`) and are replaced by a note
 * when the game has no timeline, which is normal for a game ingested after Riot's retention window.
 * The champion's ability icons are the one per-champion fetch on the page and load only for the
 * selected player.
 */

import { useMemo, useState, type ReactNode } from "react";
import { useChampionAbilities } from "../../../hooks/useChampionAbilities";
import { cn } from "../../../lib/cn";
import type { GameParticipant } from "../../../lib/game/participants";
import { getItemBuilds, getSkillOrders } from "../../../lib/game/timelineStats";
import { useWindowSize } from "../../../hooks/useWindowSize";
import { ChampionIcon } from "../../ChampionIcon";
import { ChampionSplashArt } from "../ChampionSplashArt";
import { useGameView } from "../GameView";
import { ItemIcon } from "../RiotIcons";
import { TimelineNote } from "../TimelineNote";
import { BuildPath } from "./BuildPath";
import { Runes } from "./Runes";
import { SkillOrder } from "./SkillOrder";

export default function BuildsTab() {
  const { participants, timeline, lookups } = useGameView();
  const isMobile = useWindowSize() < 768;
  const players = useMemo(() => Object.values(participants), [participants]);
  const [selectedId, setSelectedId] = useState<number>(players[0]?.participantId ?? 1);
  const player = participants[selectedId] ?? players[0];

  const builds = useMemo(() => (timeline ? getItemBuilds(timeline) : null), [timeline]);
  const orders = useMemo(() => (timeline ? getSkillOrders(timeline) : null), [timeline]);
  const abilities = useChampionAbilities(player?.championId ?? null);

  if (!player) return null;
  const p = player.raw;

  return (
    <div className="flex flex-col gap-6">
      {/* Two selectors for two widths. With room, the ten players are splash cards five to a row, blue
          above red, the art doing the identifying. On a phone the cards had no room to be cards, so the
          same ten become two columns of plain buttons, champion tile then name, laid out so each row is
          a lane matchup: top beside top, jungle beside jungle. */}
      {isMobile ? (
        <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Players">
          {interleave(players).map(candidate => {
            const active = candidate.participantId === player.participantId;
            return (
              <button
                key={candidate.participantId}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSelectedId(candidate.participantId)}
                title={candidate.riotName}
                className={cn(
                  "flex min-w-0 cursor-pointer items-center gap-2.5 rounded-md border px-2.5 py-2 text-left outline-none transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-ring/60",
                  active ? "border-brand bg-bg-input" : "border-border bg-bg2 hover:border-border2 hover:bg-bg3",
                  candidate.teamId === 100 ? "border-l-[3px] border-l-side-blue" : "border-l-[3px] border-l-side-red",
                )}
              >
                <ChampionIcon
                  champion={candidate.championId}
                  lookup={lookups.champions}
                  fallbackLabel={candidate.raw.championName}
                  size={32}
                  tile
                  decorative
                  className="flex shrink-0"
                />
                <span className="min-w-0 truncate font-heading text-sm font-medium text-text-bright">{candidate.displayName}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-5 gap-2" role="tablist" aria-label="Players">
          {players.map(candidate => {
            const active = candidate.participantId === player.participantId;
            return (
              <button
                key={candidate.participantId}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSelectedId(candidate.participantId)}
                title={candidate.riotName}
                className={cn(
                  "cursor-pointer overflow-hidden rounded-md bg-bg2 text-left shadow-tile outline-none transition-shadow",
                  "focus-visible:ring-2 focus-visible:ring-ring/60",
                  active ? "ring-2 ring-brand" : "hover:ring-1 hover:ring-border2",
                )}
              >
                <ChampionSplashArt championId={candidate.championId} className="aspect-[16/7] w-full" />
                <span className="block truncate px-2 py-1.5 font-heading text-sm font-medium leading-tight text-text-bright">
                  {candidate.displayName}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <Section title="Final build">
        <div className="flex flex-wrap items-center gap-1.5">
          {[p.item0, p.item1, p.item2, p.item3, p.item4, p.item5].map((id, i) => (
            <ItemIcon key={i} itemId={id} size={40} lookup={lookups.items} />
          ))}
          <span className="mx-1 h-8 w-px bg-border" />
          <ItemIcon itemId={p.item6} size={40} lookup={lookups.items} />
        </div>
      </Section>

      <Section title="Items">
        {timeline === undefined || timeline === null ? (
          <TimelineNote state={timeline} />
        ) : (
          <BuildPath build={builds?.[player.participantId] ?? []} lookup={lookups.items} />
        )}
      </Section>

      <Section title="Runes">
        <Runes perks={p.perks} lookup={lookups.runes} />
      </Section>

      <Section title="Skill order">
        {timeline === undefined || timeline === null ? (
          <TimelineNote state={timeline} />
        ) : (
          <SkillOrder order={orders?.[player.participantId] ?? []} abilities={abilities} />
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-bg2 p-4">
      <h2 className="mb-3 font-display text-[22px] text-text-bright">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Blue and red side by side, one lane per row: `[b1, r1, b2, r2, …]`. The payload orders the ten as
 * blue one to five then red six to ten, so the pairing is positional. A side short of five (never on a
 * tournament game, but the type allows it) simply ends early.
 */
function interleave(players: readonly GameParticipant[]): GameParticipant[] {
  const blue = players.filter(p => p.teamId === 100);
  const red = players.filter(p => p.teamId === 200);
  const out: GameParticipant[] = [];
  for (let i = 0; i < Math.max(blue.length, red.length); i++) {
    if (blue[i]) out.push(blue[i]);
    if (red[i]) out.push(red[i]);
  }
  return out;
}
