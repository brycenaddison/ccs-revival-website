/**
 * Everything the match viewer's tabs read, provided once by `pages/GameDetail.tsx`.
 *
 * The page owns every fetch (payload, timeline, context) and every CDN lookup (champions, items,
 * spells, runes), builds the participant index, and hands the lot down through this context. A tab
 * body, a scoreboard row, an event chip: all of them call `useGameView()` and none of them fetch. That
 * is what keeps the four tabs interchangeable and the lookups from being threaded through a dozen
 * component signatures.
 *
 * `timeline` has three states and they mean different things: `undefined` is still loading, `null` is
 * "Riot no longer had it when the game was recorded", and a value is a timeline that passed its
 * envelope check. Builds and Timeline branch on all three.
 */

import { createContext, useContext } from "react";
import type { GameContext } from "../../lib/api";
import type { ChampionLookup } from "../../lib/championData";
import type { GameAssetLookup } from "../../lib/gameAssets";
import type { RuneLookup } from "../../lib/runeData";
import type { Participants } from "../../lib/game/participants";
import type { RenderableMatch, RenderableTimeline } from "../../lib/riot/matchV5";

/** One of three densities, chosen from the window width by the page. */
export type ScoreboardSize = "sm" | "md" | "lg";

export interface GameLookups {
  champions: ChampionLookup | null;
  items: GameAssetLookup | null;
  spells: GameAssetLookup | null;
  runes: RuneLookup | null;
}

export interface GameView {
  matchId: string;
  match: RenderableMatch;
  timeline: RenderableTimeline | null | undefined;
  context: GameContext | null;
  participants: Participants;
  lookups: GameLookups;
  size: ScoreboardSize;
  /** Seconds, whichever unit the payload used. Null only on a payload with no duration at all. */
  durationSeconds: number | null;
}

const GameViewContext = createContext<GameView | null>(null);

export const GameViewProvider = GameViewContext.Provider;

export function useGameView(): GameView {
  const view = useContext(GameViewContext);
  if (view === null) throw new Error("useGameView() called outside GameViewProvider");
  return view;
}
