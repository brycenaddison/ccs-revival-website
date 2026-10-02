/**
 * One prediction: `/predictions/:eventId`. Public, cross-season.
 *
 * A match market's header is the match page's own `MatchupHeader`, with the pool under the teams
 * and a link back to the match. A custom market's header card has its league, title, plain-text
 * details (served as text, not Markdown), deadline and outcome shares. Below either, the predict
 * panel (or the result once closed) and the viewer's position, which `me/positions` serves after
 * settlement too, so a settled page still says what you got back.
 *
 * The public event read and the private reads stay separate: the event is identical for every
 * caller, and nothing viewer-specific rides on it.
 */

import { useMemo, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BackLink } from "../components/BackLink";
import { PageShell } from "../components/layout/PageShell";
import { toast } from "sonner";
import {
  MATCHUP_CAPTION_LINK,
  MatchupCaption,
  MatchupHeader,
  MatchupScore,
  MatchupVs,
} from "../components/match/MatchupHeader";
import { OutcomeShares, PoolBar } from "../components/predictions/PoolBar";
import { eventName } from "../components/predictions/outcomeLabels";
import { PositionBreakdown } from "../components/predictions/PositionList";
import { PredictPanel } from "../components/predictions/PredictPanel";
import { predictionCaption } from "../components/predictions/PredictionCard";
import { PredictionStatusChip } from "../components/predictions/PredictionStatusChip";
import { usePredictionPositions } from "../components/predictions/usePredictionPositions";
import { usePredictionWallet } from "../components/predictions/usePredictionWallet";
import { usePageMetadata } from "../components/seo/MetadataProvider";
import { PredictionsUnavailable } from "../components/predictions/PredictionsUnavailable";
import { predictionErrorText } from "../components/predictions/predictionLabels";
import { ErrorLine } from "../components/admin/adminUi";
import { errorMessage, isPredictionsUnavailable, type PredictionEvent } from "../lib/api";
import { groupLabels } from "../lib/leagueAdapters";
import { useLeague } from "../lib/leagueContext";
import { pointsText } from "../lib/predictionPoints";
import { queries } from "../lib/queries";
import { fmtKickoff } from "../lib/utils";

export default function PredictionDetail() {
  const { eventId: param } = useParams<{ eventId: string }>();
  const eventId = useMemo(() => {
    const n = Number(param);
    return Number.isSafeInteger(n) && n > 0 ? n : null;
  }, [param]);
  const { data: event, error, isPending } = useQuery(queries.prediction(eventId));
  const wallet = usePredictionWallet();
  const { byEvent } = usePredictionPositions(event ? [[event.id]] : []);
  const { tournaments } = useLeague();

  const name = event ? eventName(event) : null;
  usePageMetadata({
    title: name ? `${name} prediction | CCS` : "Prediction | CCS",
    description: !event || !name ? "Predict CCS match winners and league questions with prediction points."
      : event.kind === "custom" ? `Predict "${name}" with CCS prediction points.`
      : `Pick the winner of ${name} with CCS prediction points.`,
    noindex: eventId === null || !!error || (!isPending && !event),
  });

  const body = eventId === null ? <Notice>That prediction link isn&apos;t valid.</Notice>
    : isPending ? <Notice>Loading prediction…</Notice>
    : error ? <Notice>{errorMessage(error)}</Notice>
    : !event ? <Notice>That prediction doesn&apos;t exist.</Notice>
    : null;

  if (body || !event) {
    return <PageShell maxWidth={900}><BackLink fallback="/predictions" />{body}</PageShell>;
  }

  const league = groupLabels(tournaments, [event.conf]).get(event.conf);
  const position = byEvent.get(event.id);

  return (
    <PageShell maxWidth={900}>
      <BackLink fallback="/predictions" />
      {event.kind === "custom" ? <CustomHeader event={event} league={league} /> : <MatchHeader event={event} league={league} />}

      <div className="space-y-5">
        {/* The event is a public read and still loads; only participation is unavailable. */}
        {isPredictionsUnavailable(wallet.summary.error) ? <PredictionsUnavailable /> : (
          <div>
            <PredictPanel event={event} wallet={wallet} onPlaced={message => toast.success(message)} />
            {!!(wallet.summary.error ?? wallet.enrollError) && (
              <ErrorLine message={predictionErrorText(wallet.summary.error ?? wallet.enrollError)} />
            )}
          </div>
        )}
        {position && <PositionBreakdown event={event} position={position} />}
      </div>
    </PageShell>
  );
}

function MatchHeader({ event, league }: { event: PredictionEvent; league: string | undefined }) {
  const [a, b] = event.outcomes;
  const score = event.result?.score ?? null;
  const winnerId = event.state === "settled" ? event.result?.winnerOutcomeId ?? null : null;
  return (
    <MatchupHeader
      conf={event.conf}
      teamA={a.team}
      teamB={b.team}
      wonA={winnerId !== null && a.id === winnerId}
      wonB={winnerId !== null && b.id === winnerId}
      center={
        <>
          {score ? <MatchupScore a={score.teamA} b={score.teamB} /> : <MatchupVs />}
          <PredictionStatusChip state={event.state} />
        </>
      }
      caption={
        <>
          {league && <MatchupCaption>{league}</MatchupCaption>}
          {predictionCaption(event) && <MatchupCaption>{predictionCaption(event)}</MatchupCaption>}
          {event.closesAt && <MatchupCaption><span className="normal-case">{fmtKickoff(event.closesAt)}</span></MatchupCaption>}
          {event.scheduleMatchId !== null && (
            <MatchupCaption>
              <Link to={`/match/${event.scheduleMatchId}`} className={MATCHUP_CAPTION_LINK}>Match details</Link>
            </MatchupCaption>
          )}
        </>
      }
    >
      <div className="mx-auto mt-5 max-w-xl">
        <PoolBar event={event} labels />
        <p className="mt-2 text-center font-heading text-xs text-text-secondary">{pointsText(event.totalPool)} points in the pool</p>
      </div>
    </MatchupHeader>
  );
}

function CustomHeader({ event, league }: { event: PredictionEvent; league: string | undefined }) {
  return (
    <section className="mb-6 rounded-lg border border-border bg-bg2 p-6">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="font-heading text-[11px] text-text-muted">{league ?? event.conf}</span>
        <PredictionStatusChip state={event.state} />
      </div>
      <h1 className="font-display text-[22px] text-text-bright">{eventName(event)}</h1>
      {event.details && <p className="mt-2 whitespace-pre-line text-sm text-text-secondary">{event.details}</p>}
      <p className="mt-3 font-heading text-xs text-text-secondary">
        {[event.closesAt && `Closes ${fmtKickoff(event.closesAt)}`, `${pointsText(event.totalPool)} points in the pool`].filter(Boolean).join(" · ")}
      </p>
      <OutcomeShares event={event} className="mt-4" />
    </section>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return <div className="py-16 text-center font-heading text-sm text-text-muted">{children}</div>;
}
