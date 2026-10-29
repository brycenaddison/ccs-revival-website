/**
 * Site Admin > Drafts > a fixture's games: every game from 1 to the series' game amount, whether or
 * not it was played or delivered. It is the way into a game no worklist reaches, such as one whose
 * room was never used. Each game opens in the correction editor with the fixture kept in the query,
 * so Back returns here.
 *
 * Only a `ready` series can take a new game; a stored one can be corrected whatever the status. A
 * series with no Drafter ID yet (still creating, failed or uncertain) has nothing to open.
 */
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { BackButton, ErrorLine } from "../adminUi";
import { DRAFT_FIXTURE_GAME_LABEL, DRAFT_MODE_LABEL, DRAFT_ROLE_STATUS_LABEL, DRAFT_STATUS_LABEL, draftErrorText } from "../../drafts/draftLabels";
import type { DraftGameRef } from "./draftCorrectionLink";
import { queries } from "../../../lib/queries";
import type { DraftFixtureGame, DraftFixtureSeries } from "../../../lib/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

export function DraftFixturePanel({ viewerId, scheduleMatchId, onOpen, onBack }: {
  viewerId: number | null;
  scheduleMatchId: number;
  onOpen: (ref: DraftGameRef) => void;
  onBack: () => void;
}) {
  const fixture = useQuery(queries.draftFixture(viewerId, scheduleMatchId));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <BackButton onClick={onBack}>Back to issues</BackButton>
      </div>
      {fixture.isPending ? (
        <p role="status" className="text-sm text-text-dim">Loading the match&apos;s games…</p>
      ) : fixture.isError ? (
        <ErrorLine message={draftErrorText(fixture.error)} />
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h3 className="font-display text-[22px] text-text-bright">Draft games</h3>
              {fixture.data.series?.draftMode && <Badge variant="muted">{DRAFT_MODE_LABEL[fixture.data.series.draftMode].label}</Badge>}
              {fixture.data.series && (
                <Badge variant={fixture.data.series.status === "ready" ? "default" : "muted"}>
                  {fixture.data.series.status ? DRAFT_STATUS_LABEL[fixture.data.series.status] : "Unknown status"}
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <Link to={`/match/${fixture.data.scheduleMatchId}`} className="text-brand hover:underline">Match</Link>
              {fixture.data.series?.url && (
                <a href={fixture.data.series.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline">
                  Draft room
                  <ExternalLink size={12} aria-hidden="true" />
                </a>
              )}
              {fixture.data.conf && <span className="text-text-dim">{fixture.data.conf}</span>}
            </div>
          </div>
          {fixture.data.series === null ? (
            <Empty className="p-6 md:p-6">
              <EmptyHeader>
                <EmptyTitle>No draft room</EmptyTitle>
                <EmptyDescription>This fixture has no draft room, so no draft can be entered.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <SeriesGames series={fixture.data.series} onOpen={onOpen} />
          )}
        </>
      )}
    </div>
  );
}

function SeriesGames({ series, onOpen }: { series: DraftFixtureSeries; onOpen: (ref: DraftGameRef) => void }) {
  const drafterSeriesId = series.drafterSeriesId;
  return (
    <div className="flex flex-col gap-3">
      {drafterSeriesId === null && (
        <Alert>
          <AlertDescription>
            {series.status === "creating"
              ? "The room is still being created, so its games cannot be opened yet. Reload in a moment."
              : "Drafter never confirmed this room, so its games cannot be opened. See Room creations in the issues."}
          </AlertDescription>
        </Alert>
      )}
      {series.reviewFetchReceipts > 0 && (
        <Alert variant="warning">
          <AlertDescription>
            {series.reviewFetchReceipts === 1 ? "A fetch for this room is" : `${series.reviewFetchReceipts} fetches for this room are`}{" "}
            in review. A fetch is resolved once every game it carries is stored.
          </AlertDescription>
        </Alert>
      )}
      {series.games.length === 0 ? (
        <p className="text-sm text-text-dim">The room lists no games.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {series.games.map(game => (
            <GameRow
              key={game.game}
              game={game}
              canCreate={series.status === "ready"}
              seriesUrl={series.url}
              onOpen={drafterSeriesId === null ? null : () => onOpen({ drafterSeriesId, game: game.game })}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function GameRow({ game, canCreate, seriesUrl, onOpen }: {
  game: DraftFixtureGame;
  canCreate: boolean;
  /** The registered room, which a players' room import replaces on this game alone. */
  seriesUrl: string | null;
  /** Null when the series has no Drafter ID to open a game with. */
  onOpen: (() => void) | null;
}) {
  const stored = game.draft !== "missing";
  const blocked = !stored && !canCreate;
  const playersRoom = game.url !== null && game.url !== seriesUrl;
  return (
    <li className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-heading text-sm text-text-bright">Game {game.game}</span>
          <Badge variant={game.draft === "missing" ? "muted" : "default"}>
            {game.draft ? DRAFT_FIXTURE_GAME_LABEL[game.draft] : "Unknown"}
          </Badge>
          {game.roleStatus && <Badge variant="muted">{DRAFT_ROLE_STATUS_LABEL[game.roleStatus]}</Badge>}
          {playersRoom && <Badge variant="muted">Players&apos; room</Badge>}
          {game.reviewReceipts > 0 && (
            <span className="text-xs text-ccs-orange">
              {game.reviewReceipts === 1 ? "1 delivery" : `${game.reviewReceipts} deliveries`} in review
            </span>
          )}
          {game.playedMatchId ? (
            <Link to={`/game/${encodeURIComponent(game.playedMatchId)}`} className="text-xs text-brand hover:underline">
              Played game
            </Link>
          ) : (
            <span className="text-xs text-text-dim">Not played</span>
          )}
          {playersRoom && game.url && (
            <a href={game.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-brand hover:underline">
              Game room
              <ExternalLink size={12} aria-hidden="true" />
            </a>
          )}
        </div>
        {!stored && !game.playedMatchId && (
          <p className="text-xs text-text-dim">
            A draft entered for a game played without this match&apos;s tournament code counts toward no statistic
            until that code is registered.
          </p>
        )}
        {blocked && onOpen && <p className="text-xs text-text-dim">Only a ready room can take a new game.</p>}
      </div>
      {onOpen && (
        <Button type="button" variant="outline" size="sm" className="shrink-0" disabled={blocked} onClick={onOpen}>
          {stored ? "Correct draft" : "Enter draft"}
        </Button>
      )}
    </li>
  );
}
