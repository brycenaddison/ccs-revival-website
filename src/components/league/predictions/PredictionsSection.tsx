/**
 * League Admin > Predictions: publish a week's matches or a custom league question, and look after
 * the events already published.
 *
 * A thin shell. The site calendar (`GET /settings`) says which Monday is this week in the site
 * timezone; the week's manage read supplies the rule state, processing health, candidates and
 * events. `PublishPanel`, `CustomMarketPanel` and `EventsPanel` own their commands. Panels are keyed
 * by conf (and week, for the weekly ones) so a selection, draft or open dialog never follows the
 * admin to another week or league.
 *
 * League staff are told when predictions are off here; only site admins are pointed to the switch,
 * because it lives in Site Admin, which league staff cannot open.
 *
 * Publication of either kind requires a listed conference upstream, so a hidden league gets a
 * warning and read-only Publish and Custom panels instead of commands that can only fail. Event
 * actions stay available: locking, voiding and resolving do not need a listed conference, and
 * outstanding markets must still be closed out (a season rollover waits for them).
 *
 * The section needs the `schedule` scope, which covers the weekly read and both kinds of
 * publication. Retrying processing and event actions (including resolving a custom market) need
 * `admin` upstream, so schedule-only staff see events, pools and errors without those controls.
 * Hiding them is presentation; the API is the boundary.
 */

import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, ListChecks, MessageCircleQuestion, TriangleAlert } from "lucide-react";
import { PillTabs } from "../../PillTabs";
import { toast } from "sonner";
import { ErrorLine } from "../../admin/adminUi";
import { relativeInstant } from "../../predictions/PredictionUi";
import { Button } from "@/components/ui/button";
import { CustomMarketPanel } from "./CustomMarketPanel";
import { EventsPanel } from "./EventsPanel";
import { PublishPanel } from "./PublishPanel";
import { WeekNavigator } from "./WeekNavigator";
import { useAdminAccess } from "../../../lib/adminAccess";
import { useAuth } from "../../../lib/authContext";
import { errorMessage, hasScope, reconcilePredictions, type PredictionManage } from "../../../lib/api";
import { currentPredictionWeek } from "../../../lib/predictionWeek";
import { queries, queryRoots } from "../../../lib/queries";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

type Tab = "publish" | "custom" | "events";

export function PredictionsSection() {
  const { conf = "" } = useParams();
  const { profile } = useAuth();
  const { leagues, isSiteAdmin, isListed } = useAdminAccess();
  const canManageEvents = isSiteAdmin || hasScope(leagues.find(league => league.conf === conf), "admin");
  const hidden = isListed(conf) === false;
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("publish");
  const [chosenWeek, setChosenWeek] = useState<string | null>(null);

  const calendar = useQuery(queries.predictionSiteCalendar());
  const thisWeek = calendar.data ? currentPredictionWeek(calendar.data.serverNow, calendar.data.siteTimeZone) : "";
  const weekStart = chosenWeek ?? thisWeek;
  const manage = useQuery(queries.predictionManage(conf, weekStart, profile?.id ?? null));

  const reconcile = useMutation({
    mutationFn: () => reconcilePredictions(conf),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryRoots.predictions });
      toast.success("Processing retried.");
    },
  });

  if (calendar.isPending) return <p role="status" className="text-sm text-text-dim">Loading the site calendar…</p>;
  if (calendar.error || !calendar.data) return <ErrorLine message={calendar.error ? errorMessage(calendar.error) : "The site calendar is unavailable."} />;
  const data = manage.data;

  return (
    <div className="flex flex-col gap-5">
      {hidden && (
        <Alert variant="warning">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>This league is hidden</AlertTitle>
          <AlertDescription>
            <p>
              New predictions can only be published for a listed league, so publishing is read-only here.
              Existing predictions can still be locked, voided or resolved under Events.
              {isSiteAdmin && <> <Link to="/admin/leagues" className="text-brand no-underline hover:underline">List the league in Site Admin</Link>.</>}
            </p>
          </AlertDescription>
        </Alert>
      )}
      {data && (
        <StatusStrip
          manage={data}
          siteAdmin={isSiteAdmin}
          retrying={reconcile.isPending}
          onRetry={canManageEvents ? () => reconcile.mutate() : null}
        />
      )}
      <ErrorLine message={reconcile.error ? errorMessage(reconcile.error) : null} />

      <WeekNavigator
        weekStart={weekStart}
        thisWeek={thisWeek}
        siteTimeZone={data?.siteTimeZone ?? calendar.data.siteTimeZone}
        onChange={setChosenWeek}
      />

      <PillTabs
        label="Predictions view"
        tabs={[
          { key: "publish", label: "Publish", icon: CalendarCheck },
          { key: "custom", label: "Custom", icon: MessageCircleQuestion },
          { key: "events", label: data ? `Events (${data.events.length})` : "Events", icon: ListChecks },
        ]}
        selected={tab}
        onSelect={setTab}
      />

      {tab === "custom" ? <CustomMarketPanel key={conf} conf={conf} readOnly={hidden} />
        : manage.isPending ? <p role="status" className="text-sm text-text-dim">Loading the week…</p>
        : manage.error ? <ErrorLine message={errorMessage(manage.error)} />
        : !data ? null
        : tab === "publish"
          ? <PublishPanel key={`${conf}-${data.weekStart}`} conf={conf} manage={data} readOnly={hidden} onPublished={toast.success} />
          : <EventsPanel key={`${conf}-${data.weekStart}`} conf={conf} manage={data} canAct={canManageEvents} onDone={toast.success} />}
    </div>
  );
}

function StatusStrip({ manage, siteAdmin, retrying, onRetry }: {
  manage: PredictionManage;
  siteAdmin: boolean;
  retrying: boolean;
  /** Null when the viewer lacks the `admin` scope reconciliation requires. */
  onRetry: (() => void) | null;
}) {
  const { worker } = manage;
  const on = manage.rulesEnabled === true;
  const healthy = !worker.lastError && !worker.errors && !worker.ledgerDiscrepancies;
  const last = relativeInstant(worker.lastSuccessAt, manage.serverNow);
  const counts: [number | null, string, string][] = [
    [worker.pending, "pending", "pending"],
    [worker.review, "under review", "under review"],
    [worker.errors, "error", "errors"],
    [worker.ledgerDiscrepancies, "ledger discrepancy", "ledger discrepancies"],
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={!on ? "muted" : "default"}>{on ? "Predictions on" : "Predictions off"}</Badge>
          {counts.map(([count, one, many]) => count ? <Badge key={many} variant="muted">{count} {count === 1 ? one : many}</Badge> : null)}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-heading text-xs text-text-secondary">
            {healthy ? "Processing healthy" : "Processing needs attention"}{last && ` · ${last}`}
          </span>
          {onRetry && <Button variant="outline" size="sm" disabled={retrying} onClick={onRetry}>Retry processing</Button>}
        </div>
      </div>
      {worker.lastError && <ErrorLine message={worker.lastError} />}
      {!on && (
        <p className="mt-3 text-sm text-text-secondary">
          Predictions are off for this league.
          {siteAdmin && <> <Link to="/admin/predictions" className="text-brand no-underline hover:underline">Turn them on in Site Admin</Link>.</>}
        </p>
      )}
    </div>
  );
}
