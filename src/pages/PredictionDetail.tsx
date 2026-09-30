/**
 * One prediction: `/predictions/:eventId`. Public, cross-season.
 *
 * The header is the match page's own `MatchupHeader`, with the pool under the teams and a link back
 * to the match. Below it, the predict panel (or the result once closed) and the viewer's position,
 * which `me/positions` serves after settlement too, so a settled page still says what you got back.
 *
 * The public event read and the private reads stay separate: the event is identical for every
 * caller, and nothing viewer-specific rides on it.
 */

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BackLink } from "../components/BackLink";
import { PageShell } from "../components/layout/PageShell";
import { Toast } from "../components/Toast";
import {
  MATCHUP_CAPTION_LINK,
  MatchupCaption,
  MatchupHeader,
  MatchupScore,
  MatchupVs,
} from "../components/match/MatchupHeader";
import { PoolBar } from "../components/predictions/PoolBar";
import { PositionBreakdown } from "../components/predictions/PositionList";
import { PredictPanel } from "../components/predictions/PredictPanel";
import { predictionCaption } from "../components/predictions/PredictionCard";
import { PredictionStatusChip } from "../components/predictions/PredictionStatusChip";
import { usePredictionPositions } from "../components/predictions/usePredictionPositions";
import { usePredictionWallet } from "../components/predictions/usePredictionWallet";
import { usePageMetadata } from "../components/seo/MetadataProvider";
import { ErrorLine } from "../components/admin/adminUi";
import { errorMessage } from "../lib/api";
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
  const [toast, setToast] = useState<string | null>(null);
  const { clearNotice } = wallet;
  const closeToast = useCallback(() => { setToast(null); clearNotice(); }, [clearNotice]);

  const matchup = event ? `${event.outcomes[0].team?.name ?? "TBD"} vs ${event.outcomes[1].team?.name ?? "TBD"}` : null;
  usePageMetadata({
    title: matchup ? `${matchup} prediction | CCS` : "Prediction | CCS",
    description: matchup ? `Pick the winner of ${matchup} with CCS prediction points.` : "Pick CCS series winners with prediction points.",
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

  const [a, b] = event.outcomes;
  const score = event.result?.score ?? null;
  const winnerId = event.state === "settled" ? event.result?.winnerTeamId ?? null : null;
  const league = groupLabels(tournaments, [event.conf]).get(event.conf);
  const position = byEvent.get(event.id);

  return (
    <PageShell maxWidth={900}>
      <BackLink fallback="/predictions" />
      <MatchupHeader
        conf={event.conf}
        teamA={a.team}
        teamB={b.team}
        wonA={winnerId !== null && a.teamId === winnerId}
        wonB={winnerId !== null && b.teamId === winnerId}
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

      <div className="space-y-5">
        <div>
          <PredictPanel event={event} wallet={wallet} onPlaced={setToast} />
          {!!(wallet.summary.error ?? wallet.enrollError) && (
            <ErrorLine message={errorMessage(wallet.summary.error ?? wallet.enrollError)} />
          )}
        </div>
        {position && <PositionBreakdown event={event} position={position} />}
      </div>
      <Toast message={toast ?? wallet.notice} onClose={closeToast} />
    </PageShell>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return <div className="py-16 text-center font-heading text-sm text-text-muted">{children}</div>;
}
