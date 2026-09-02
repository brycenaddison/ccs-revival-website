/**
 * The match viewer: one game in full, at `/game/:matchId` and `/game/:matchId/:tab`.
 *
 * **The page owns every fetch and every lookup.** Three reads (`matchData`, `matchTimeline`,
 * `gameContext`) and four Community Dragon manifests are loaded here, once, and handed to the tabs
 * through `GameViewProvider`. The tabs are pure over that context, which is what lets three of them be
 * lazy chunks (chart.js lives in two of them) without any of them fetching on mount.
 *
 * **Absence, in the order it is checked.** A `null` payload is upstream's `result-only`: a game Riot
 * reports on the tournament code but denies the match id of, which counts for the standings and has
 * nothing to draw. A payload that fails the envelope check is stored but unreadable (a truncated or
 * malformed write; every stored row is match-v5). A `null` timeline is *normal* and costs two tabs
 * their minute-by-minute data, never the page. A `null` context, which is every game until
 * `GET /m/:matchId/context` exists upstream, costs the team headers and the profile links and nothing
 * else. Only the first two stop the tabs from rendering.
 *
 * The scoreboard is not held for the timeline or the context: both arrive from the same API and a name
 * changing from a Riot ID to a nickname a moment after paint is cheaper than a blank page waiting on a
 * route that may answer `404`.
 */

import { lazy, Suspense, useMemo, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { errorMessage } from "../lib/api";
import { queries } from "../lib/queries";
import { useBackNavigation } from "../hooks/useGoBack";
import { useChampions } from "../hooks/useChampions";
import { useGameAssets } from "../hooks/useGameAssets";
import { useRunes } from "../hooks/useRunes";
import { useWindowSize } from "../hooks/useWindowSize";
import { buildParticipants } from "../lib/game/participants";
import { gameTabOf, type GameTab } from "../lib/game/tabs";
import {
  gameDurationSeconds,
  isRenderableMatch,
  isRenderableTimeline,
} from "../lib/riot/matchV5";
import { PageShell } from "../components/layout/PageShell";
import { ResultOnlyCard } from "../components/match/GameSummary";
import { GameHeader } from "../components/game/GameHeader";
import { GameTabs } from "../components/game/GameTabs";
import { GameViewProvider, type GameView, type ScoreboardSize } from "../components/game/GameView";
import { ScoreboardTab } from "../components/game/scoreboard/ScoreboardTab";
import { TooltipProvider } from "../components/ui/tooltip";

// The three tabs that carry their own weight: chart.js in two of them, the event templates in the
// third. The scoreboard is the landing tab and stays in the page's own chunk.
const GraphsTab = lazy(() => import("../components/game/graphs/GraphsTab"));
const BuildsTab = lazy(() => import("../components/game/builds/BuildsTab"));
const TimelineTab = lazy(() => import("../components/game/timeline/TimelineTab"));

/** Wide enough for the scoreboard's `lg` density. */
const COLUMN_WIDTH = 1240;

export default function GameDetail() {
  const { matchId = "", tab: tabParam } = useParams<{ matchId: string; tab?: string }>();
  const tab = gameTabOf(tabParam);
  const { goBack, isFallback } = useBackNavigation("/");
  const backLabel = isFallback ? "Home" : "Back";

  const enabled = matchId !== "";
  const match = useQuery({ ...queries.matchData(matchId), enabled });
  const timeline = useQuery({ ...queries.matchTimeline(matchId), enabled });
  const context = useQuery({ ...queries.gameContext(matchId), enabled });

  const champions = useChampions();
  const { items, spells } = useGameAssets();
  const runes = useRunes();

  const width = useWindowSize();
  const size: ScoreboardSize = width < 768 ? "sm" : width < 1280 ? "md" : "lg";

  const renderable = isRenderableMatch(match.data) ? match.data : null;
  const participants = useMemo(
    () => (renderable ? buildParticipants(renderable, context.data ?? null) : null),
    [renderable, context.data],
  );

  if (!enabled) {
    return <Frame onBack={goBack} backLabel={backLabel}><Notice>No game specified.</Notice></Frame>;
  }
  if (match.isPending) {
    return <Frame onBack={goBack} backLabel={backLabel}><Notice>Loading match…</Notice></Frame>;
  }
  if (match.error) {
    return (
      <Frame onBack={goBack} backLabel={backLabel}>
        <Notice tone="error">{errorMessage(match.error)}</Notice>
      </Frame>
    );
  }
  if (!match.data) {
    return (
      <Frame onBack={goBack} backLabel={backLabel}>
        <ResultOnlyCard
          matchId={matchId}
          label="no data"
          result={null}
          note="Nothing is stored for this game. Either it was never recorded, or it is recorded as a result only: Riot sometimes denies a game it has already reported on the tournament code, and there is no payload to show for one of those. A result-only game still counts for the standings, and a re-check picks the game up if Riot's index recovers."
        />
      </Frame>
    );
  }
  if (!renderable || !participants) {
    return (
      <Frame onBack={goBack} backLabel={backLabel}>
        <ResultOnlyCard
          matchId={matchId}
          label="unreadable"
          result={null}
          note="This game's data is stored but could not be read, so there is nothing to show."
        />
      </Frame>
    );
  }

  const view: GameView = {
    matchId,
    match: renderable,
    // `undefined` while loading, `null` when the read answered and there is none.
    timeline: timeline.isPending
      ? undefined
      : isRenderableTimeline(timeline.data)
        ? timeline.data
        : null,
    context: context.data ?? null,
    participants,
    lookups: { champions, items, spells, runes },
    size,
    durationSeconds: gameDurationSeconds(renderable.info),
  };

  return (
    <Frame onBack={goBack} backLabel={backLabel}>
      <TooltipProvider delayDuration={200}>
        <GameViewProvider value={view}>
          <GameHeader />
          <GameTabs matchId={matchId} tab={tab} />
          <Suspense fallback={<Notice>Loading…</Notice>}>
            <TabBody tab={tab} />
          </Suspense>
        </GameViewProvider>
      </TooltipProvider>
    </Frame>
  );
}

function TabBody({ tab }: { tab: GameTab }) {
  switch (tab) {
    case "graphs":
      return <GraphsTab />;
    case "builds":
      return <BuildsTab />;
    case "timeline":
      return <TimelineTab />;
    default:
      return <ScoreboardTab />;
  }
}

/**
 * The column every state of this page renders in, with the history-aware back link above whatever
 * there is to show. The page sits under `SiteLayout` and wears the nav; the back link is still here
 * because a reader who opened the viewer from a series page or a profile row expects one press to
 * return them there, and the tab links use `replace` so that press never lands on another tab.
 */
function Frame({
  onBack,
  backLabel,
  children,
}: {
  onBack: () => void;
  backLabel: "Back" | "Home";
  children: ReactNode;
}) {
  return (
    <PageShell maxWidth={COLUMN_WIDTH}>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 cursor-pointer border-none bg-transparent p-0 font-heading text-xs text-text-secondary hover:text-brand hover:underline"
      >
        &larr; {backLabel}
      </button>
      {children}
    </PageShell>
  );
}

function Notice({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "error" }) {
  return (
    <div
      className={`py-10 text-center font-heading text-sm ${
        tone === "error" ? "text-ccs-red" : "text-text-muted"
      }`}
    >
      {children}
    </div>
  );
}
