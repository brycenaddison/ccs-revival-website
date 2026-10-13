import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Image, RefreshCw } from "lucide-react";
import { useAuth } from "../../lib/authContext";
import { ApiError, errorMessage, SITE_ADMIN_ROLE, type ScoreboardDestination, type ScoreboardStatus } from "../../lib/api";
import { fmtKickoff } from "../../lib/utils";
import { ErrorLine } from "../admin/adminUi";
import { SectionFrame, SettingsGroup, SettingsRow } from "../settings/SettingsSection";
import { useScoreboardRecovery } from "./useScoreboardRecovery";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const SECTION = { slug: "scoreboard-recovery", label: "Scoreboard recovery", icon: Image,
  description: "Review a scoreboard and send it in a new Discord embed. The original message remains visible.",
  Component: () => null };

/** Site authority is independent of league grants; account/fixture changes discard private previews. */
export function ScoreboardRecoveryPanel({ matchId }: { matchId: number }) {
  const { profile, hasRole, loading } = useAuth();
  if (loading || !profile || !hasRole(SITE_ADMIN_ROLE)) return null;
  return <Recovery key={`${matchId}-${profile.id}`} matchId={matchId} viewerId={profile.id} />;
}

function Recovery({ matchId, viewerId }: { matchId: number; viewerId: number }) {
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(false);
  return (
    <div className="my-5">
      <Button type="button" variant="outline" size="sm" aria-expanded={open} onClick={() => { setOpened(true); setOpen(value => !value); }}>
        <Image size={14} aria-hidden="true" />
        {open ? "Hide scoreboard recovery" : "Scoreboard recovery"}
      </Button>
      {/* Keep the mutation observer mounted when the panel closes or a public tab changes. */}
      <div hidden={!open}>{opened && <RecoveryContent matchId={matchId} viewerId={viewerId} open={open} />}</div>
    </div>
  );
}

function RecoveryContent({ matchId, viewerId, open }: { matchId: number; viewerId: number; open: boolean }) {
  const { login } = useAuth();
  const recovery = useScoreboardRecovery(matchId, viewerId);
  const { state, status, busy } = recovery;
  const data = status.data;
  const wasOpen = useRef(open);
  const refetch = status.refetch;
  useEffect(() => {
    if (open && !wasOpen.current) void refetch();
    wasOpen.current = open;
  }, [open, refetch]);
  return (
    <div className="mt-3">
      <SectionFrame section={SECTION}>
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="muted">Fixture {matchId}</Badge>
            <Button type="button" variant="outline" size="sm" disabled={busy || status.isFetching} onClick={() => void recovery.refresh()}>
              <RefreshCw size={13} aria-hidden="true" />
              {status.isFetching ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
          {status.isPending && <p role="status" className="text-sm text-text-dim">Loading scoreboard status…</p>}
          {status.isError && <Alert variant="destructive"><AlertDescription>{errorMessage(status.error)}</AlertDescription></Alert>}
          {status.error instanceof ApiError && status.error.status === 401 && (
            <Button type="button" variant="outline" size="sm" onClick={login}>Sign in with Discord again</Button>
          )}
          {status.error instanceof ApiError && status.error.status === 403 && (
            <p className="text-sm text-text-dim">Scoreboard recovery requires the site admin role. A league admin grant does not qualify.</p>
          )}
          {data && <StatusFacts status={data} />}

          {(recovery.needsInspection || state.phase === "unresolved") && (
            <Alert variant="warning">
              <AlertDescription>
                Delivery is unresolved. Check Discord before authorizing another embed. Retrying the same request preserves duplicate protection.
              </AlertDescription>
            </Alert>
          )}
          {(recovery.needsInspection || state.inspectedDiscord) && (
            <SettingsRow label="I inspected Discord and want to authorize a new preview" hint="A new preview can authorize a separate embed, even if an earlier delivery is still unresolved.">
              {field => <Checkbox {...field} checked={state.inspectedDiscord} disabled={busy} onCheckedChange={checked => recovery.inspectDiscord(checked === true)} />}
            </SettingsRow>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" size="sm" disabled={!recovery.canGenerate} onClick={recovery.generate}>
              {state.phase === "generating" ? "Generating scoreboard…" : state.preview ? "Generate a fresh preview" : "Generate preview"}
            </Button>
            {recovery.canRetryUnresolved && (
              <Button type="button" variant="outline" size="sm" onClick={recovery.retryUnresolved}>Retry the exact send request</Button>
            )}
          </div>
          {state.phase === "generating" && <p role="status" className="text-sm text-text-dim">Generating scoreboard… Rendering may take tens of seconds.</p>}
          {state.phase === "preview_loading" && <p role="status" className="text-sm text-text-dim">Loading the scoreboard image…</p>}
          {state.phase === "preview_expired" && <Alert variant="warning"><AlertDescription>Preview expired or unavailable. Generate and review a fresh preview.</AlertDescription></Alert>}
          {state.phase === "preview_unavailable" && <Alert variant="warning"><AlertDescription>Preview unavailable. Generate another preview deliberately. For render failures, inspect server diagnostics.</AlertDescription></Alert>}
          {state.message && (state.phase === "sent"
            ? <p role="status" className="text-sm text-text-secondary">{state.message}</p>
            : <ErrorLine message={state.message} />)}

          {state.preview && (
            <SettingsGroup title="Review this scoreboard">
              <div className="space-y-3">
                <Destination destination={state.preview.destination} />
                <p className="text-xs text-text-dim">Expires {fmtKickoff(state.preview.expiresAt)}. Statistics and draft details are a snapshot; corrections need a fresh preview.</p>
                {state.imageUrl && <img src={state.imageUrl} alt={`Scoreboard preview for fixture ${matchId}`} className="h-auto w-full rounded-md border border-border"
                  onLoad={() => recovery.imageLoaded(state.imageUrl!)} onError={() => recovery.imageFailed(state.imageUrl!)} />}
                <details className="text-xs text-text-dim">
                  <summary className="cursor-pointer">Preview identity for support</summary>
                  <p className="mt-2 break-all font-mono">Preview: {state.preview.previewId}<br />SHA-256: {state.preview.sha256}<br />Bytes: {state.preview.bytes}</p>
                </details>
                <p className="text-sm text-text-secondary">Sending creates a new Discord embed with this exact scoreboard. The original message remains visible.</p>
                <Button type="button" size="sm" disabled={!recovery.canSend} onClick={recovery.send}>
                  {state.phase === "sending" ? "Sending new embed…" : state.phase === "sent" ? "This preview was delivered" : state.phase === "failed" ? "Retry sending this scoreboard" : "Send new embed with this scoreboard"}
                </Button>
              </div>
            </SettingsGroup>
          )}
          {state.phase === "sending" && <p role="status" className="text-sm text-text-dim">Sending new embed…</p>}
          {state.attemptPreviewId && <p className="break-all text-xs text-text-dim">Send request preview ID: <span className="font-mono">{state.attemptPreviewId}</span></p>}
          {data && <SettingsGroup title="Recent resends">
            {data.resends.length === 0 ? <p className="text-sm text-text-dim">No recorded scoreboard resends.</p> : (
              <Table>
                <TableHeader><TableRow><TableHead>Status</TableHead><TableHead>Updated</TableHead><TableHead>Support identities</TableHead></TableRow></TableHeader>
                <TableBody>{data.resends.map((row, index) => <TableRow key={`${row.attemptId}-${index}`}>
                  <TableCell>{row.status === "sending" || row.status === "unknown" || row.status === "in_progress" ? "Delivery unresolved" : row.status ?? "Unknown"}</TableCell>
                  <TableCell>{row.updatedAt ? fmtKickoff(row.updatedAt) : "Unknown"}</TableCell>
                  <TableCell className="break-all font-mono text-xs">Status: {row.status ?? "Unknown"}<br />Attempt: {row.attemptId ?? "Unknown"}<br />Request: {row.messageKey ?? "Unknown"}<br />Webhook: {row.recipientSnowflake ?? "Unknown"}</TableCell>
                </TableRow>)}</TableBody>
              </Table>
            )}
          </SettingsGroup>}
        </div>
      </SectionFrame>
    </div>
  );
}

function Destination({ destination }: { destination: ScoreboardDestination }) {
  return <p className="break-all text-sm text-text-secondary">
    League {destination.conf} · Channel <span className="font-mono">{destination.channelId}</span> · Guild <span className="font-mono">{destination.guildId}</span> · Webhook <span className="font-mono">{destination.webhookId}</span> · Revision {destination.revision}
    {" · "}<Link to={`/league/${encodeURIComponent(destination.conf)}/admin/discord`} className="text-brand hover:underline">Results destination settings</Link>
  </p>;
}

function StatusFacts({ status }: { status: ScoreboardStatus }) {
  const original = status.originalDelivery === "sent"
    ? "Original embed delivered."
    : status.originalDelivery === "sending"
      ? "Original delivery unresolved. Check Discord before recovery."
      : status.originalDelivery ? `Original announcement not successfully recorded (${status.originalDelivery}); scoreboard repost is blocked.`
      : "Original delivery status unknown; scoreboard repost is blocked.";
  const render = status.scoreboard.status === "not_checked" ? "No recent render check. Generate a preview to check rendering."
    : status.scoreboard.status === "ready" ? "A recent render succeeded. A live, reviewed preview is still required to send."
    : status.scoreboard.status === "unavailable" ? "Latest render failed." : "Render status unknown.";
  return <SettingsGroup title="Recorded status">
    <div className="space-y-2 text-sm text-text-secondary">
      <p>{original}</p>
      <p>{status.originalImage === false ? "Original embed delivered without a scoreboard." : status.originalImage === true ? "Original embed already included a scoreboard. Sending another remains an explicit admin action." : "Original image status unknown, or no successful original delivery recorded."}</p>
      <p>Eligibility: {status.eligibility ?? "Unknown"}{status.reason ? ` · ${status.reason}` : ""}</p>
      <p>{status.browserConfigured === true ? "Browser path is configured; rendering success is checked by generating a preview." : status.browserConfigured === false ? "Browser rendering is not configured." : "Browser configuration unknown."}</p>
      <p>{render}{status.scoreboard.checkedAt ? ` Checked ${fmtKickoff(status.scoreboard.checkedAt)}.` : ""}</p>
      {status.scoreboard.reason && <ErrorLine message={status.scoreboard.reason} />}
      <p className="text-xs text-text-dim">Render checks last at most five minutes and can reset after restart or result changes. They do not prove a preview is still available.</p>
      {status.destination ? <Destination destination={status.destination} /> : <Alert variant="warning"><AlertDescription>No configured results destination. Preview generation is blocked.</AlertDescription></Alert>}
    </div>
  </SettingsGroup>;
}
