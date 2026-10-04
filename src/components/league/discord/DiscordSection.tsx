/**
 * League Admin > Discord: each team's role and private text and voice channels in the CCS server.
 *
 * One status read (`queries.teamDiscord`) drives the section: what the bot recorded per team, drift
 * against Discord, warnings, role holders, queued syncs, the provision preflight and teardown counts.
 * Staff can provision resources or resync existing role memberships. The API's background worker
 * follows roster, name, code, color and logo changes once the conference category exists, so nothing
 * here resyncs a team after a roster save.
 *
 * Provision, role resync and esubs need the `roster` scope. Staff roles and teardown need
 * `admin`, so roster-only staff see those panels read-only. Hiding controls is presentation; the API
 * is the boundary.
 *
 * Without Discord the read still answers with the recorded objects, but drift, existence and the
 * preflight are unknown rather than clean, and every write answers 503. The section says so and
 * disables the writes instead of offering commands that can only fail.
 *
 * Per-person warnings list roster profile ids; the conference's team read (the same cache the Teams
 * section uses) names them. Until it answers, or if it fails, the links still lead to each profile.
 */

import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { ErrorLine } from "../../admin/adminUi";
import { useAdminAccess } from "../../../lib/adminAccess";
import { useAuth } from "../../../lib/authContext";
import { queries, queryRoots } from "../../../lib/queries";
import { rosterNames } from "../../../lib/roster";
import {
  errorMessage,
  hasScope,
  provisionTeamDiscord,
  resyncTeamDiscordRoles,
  teamDiscordRefusal,
  type TeamDiscordStatus,
} from "../../../lib/api";
import { useRosterPlayerSources } from "../teams/useRosterPlayerSources";
import { IssueList } from "./discordIssues";
import { DiscordResourceBadge } from "./DiscordResourceBadge";
import { DiscordOperationReport, type DiscordOperationResult } from "./DiscordOperationReport";
import { StaffRolesPanel } from "./StaffRolesPanel";
import { TeamDiscordCard } from "./TeamDiscordCard";
import { TeardownPanel } from "./TeardownPanel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function DiscordSection() {
  const { conf = "" } = useParams();
  const { profile } = useAuth();
  // League navigation reuses this route component; reports must stay with their conference/viewer.
  return <DiscordConference key={`${conf}:${profile?.id ?? "anonymous"}`} conf={conf} />;
}

function DiscordConference({ conf }: { conf: string }) {
  const { profile } = useAuth();
  const { leagues, isSiteAdmin } = useAdminAccess();
  const league = leagues.find(l => l.conf === conf);
  const canRoster = isSiteAdmin || hasScope(league, "roster");
  const canAdmin = isSiteAdmin || hasScope(league, "admin");
  const viewerId = profile?.id ?? null;
  const qc = useQueryClient();
  const statusOptions = queries.teamDiscord(conf, viewerId);
  const status = useQuery(statusOptions);
  const sources = useRosterPlayerSources(conf, canRoster);
  const rosters = useQuery(queries.teamsForConf(conf));
  const people = useMemo(() => rosterNames(rosters.data ?? []), [rosters.data]);
  const refresh = () => qc.invalidateQueries({ queryKey: statusOptions.queryKey });

  const operation = useMutation({
    mutationFn: async ({ kind, teamIds }: { kind: "provision" | "roles"; teamIds?: number[] }): Promise<DiscordOperationResult> =>
      kind === "provision"
        ? { kind, report: await provisionTeamDiscord(conf, teamIds) }
        : { kind, report: await resyncTeamDiscordRoles(conf, teamIds) },
    // A lost response can hide Discord writes; only an explicit click sends another request.
    retry: false,
    onSuccess: result => {
      toast.success(`${result.kind === "provision" ? "Provisioning" : "Role resync"} request finished. See the report below.`);
    },
    // Partial writes and lost responses can also leave queued work, so refresh after failures.
    onSettled: () => qc.invalidateQueries({ queryKey: queryRoots.teams }),
  });

  if (status.isPending) return <p role="status" className="text-sm text-text-dim">Loading Discord setup…</p>;
  if (status.error || !status.data) {
    return <ErrorLine message={status.error ? errorMessage(status.error) : "The Discord setup is unavailable."} />;
  }
  const data = status.data;
  const blockers = data.preflight?.blockers ?? [];
  const canRun = canRoster && data.available && !operation.isPending;
  const canProvision = canRun && blockers.length === 0;
  const refusal = teamDiscordRefusal(operation.error);

  return (
    <div className="flex flex-col gap-5">
      <StatusStrip status={data} refreshing={status.isFetching} onRefresh={() => { void refresh(); }} />
      <IssueList title="Category cleanup needs attention" issues={data.cleanupIssues} tone="warning" people={people} />

      {!data.available && (
        <Alert variant="warning">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Discord is not connected</AlertTitle>
          <AlertDescription>
            <p>
              This is what the bot recorded. Whether each role and channel still exists, what the next
              sync would change and the readiness checks are unknown until Discord answers. Changes are
              unavailable until then.
            </p>
          </AlertDescription>
        </Alert>
      )}

      <section aria-labelledby="discord-provision" className="flex flex-col gap-3">
        <h3 id="discord-provision" className="font-heading text-sm text-text-bright">Provisioning</h3>
        <p className="text-sm text-text-secondary">
          Creates text and voice categories for this league and, for each team, a role named and colored
          after the team (with its logo as the icon where the server allows), a private text channel named after
          the code and a voice channel named after the team. Players, substitutes, the owner and
          contacts with a Discord account get the role. After that, roster and branding changes sync in
          the background.
        </p>
        <IssueList title="Provisioning is blocked" issues={blockers} tone="destructive" people={people} />
        <IssueList title="Warnings" issues={data.preflight?.warnings ?? []} tone="warning" people={people} />
        {canRoster && (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" disabled={!canProvision || data.teams.length === 0} onClick={() => operation.mutate({ kind: "provision" })}>
              {operation.isPending && operation.variables.kind === "provision" ? "Provisioning…" : data.provisioned ? "Provision all teams again" : "Provision all teams"}
            </Button>
          </div>
        )}
        {canRoster && data.provisioned && (
          <p className="text-xs text-text-dim">
            Provisioning again updates existing roles and channels in place, preserving their IDs and messages.
            Uncertain creates need inspection before they can continue.
          </p>
        )}
      </section>

      <section aria-labelledby="discord-resync" className="flex flex-col gap-3">
        <h3 id="discord-resync" className="font-heading text-sm text-text-bright">Role membership</h3>
        <p className="text-sm text-text-secondary">
          Reconcile existing team roles with eligible roster members and active esubs, including people
          who joined the server later or whose grants failed. Manual role grants are preserved.
          This action changes membership only. Teams with missing roles need provisioning first.
        </p>
        {canRoster && (
          <div>
            <Button variant="outline" type="button" disabled={!canRun || data.teams.length === 0} onClick={() => operation.mutate({ kind: "roles" })}>
              {operation.isPending && operation.variables.kind === "roles" ? "Resyncing roles…" : "Resync all team roles"}
            </Button>
          </div>
        )}
      </section>

      {operation.isPending && <p role="status" className="text-xs text-text-secondary">{operation.variables.kind === "provision" ? "Updating roles and channels in Discord…" : "Reconciling role membership in Discord…"}</p>}
      {refusal && refusal.issues.length > 0 ? (
        <IssueList title={refusal.error} issues={refusal.issues} tone="destructive" people={people} />
      ) : <ErrorLine message={operation.error ? errorMessage(operation.error) : null} />}
      {operation.data && !operation.isPending && <DiscordOperationReport result={operation.data} people={people} />}

      <section aria-labelledby="discord-teams" className="flex flex-col gap-3">
        <h3 id="discord-teams" className="font-heading text-sm text-text-bright">Teams</h3>
        {data.teams.length === 0 ? (
          <p className="text-sm text-text-dim">This league has no teams yet.</p>
        ) : data.teams.map(team => (
          <TeamDiscordCard
            key={`${conf}:${team.teamId}:${sources.discord.contextKey}`}
            conf={conf}
            team={team}
            canEdit={canRoster && data.available}
            source={sources.discord}
            people={people}
            working={operation.isPending}
            onProvision={canProvision ? () => operation.mutate({ kind: "provision", teamIds: [team.teamId] }) : null}
            onResync={canRun ? () => operation.mutate({ kind: "roles", teamIds: [team.teamId] }) : null}
          />
        ))}
        {data.orphans.length > 0 && (
          <p className="text-sm text-text-secondary">
            {data.orphans.length} recorded {data.orphans.length === 1 ? "object belongs" : "objects belong"} to
            teams that were deleted or moved to another league. Teardown removes them.
          </p>
        )}
      </section>

      <StaffRolesPanel
        key={`${conf}:${data.staffRoleIds.join(",")}`}
        conf={conf}
        staffRoleIds={data.staffRoleIds}
        staffRoles={data.staffRoles}
        assignableRoles={data.assignableRoles}
        available={data.available}
        provisioned={data.provisioned}
        canEdit={canAdmin && data.available}
        onSaved={refresh}
      />

      <TeardownPanel key={conf} conf={conf} status={data} canEdit={canAdmin && data.available} onDone={refresh} />
    </div>
  );
}

function StatusStrip({ status, refreshing, onRefresh }: {
  status: TeamDiscordStatus;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={status.available ? "default" : "muted"}>
          {status.available ? "Discord connected" : "Discord not connected"}
        </Badge>
        <Badge variant={status.provisioned ? "default" : "muted"}>
          {status.provisioned ? "Provisioned" : "Not provisioned"}
        </Badge>
        {status.categories.map(category => (
          <DiscordResourceBadge key={category.id} kind={category.kind} resource={category} />
        ))}
        {status.queue.depth > 0 && (
          <Badge variant="muted">{status.queue.depth} {status.queue.depth === 1 ? "sync" : "syncs"} queued</Badge>
        )}
      </div>
      <Button variant="outline" size="sm" type="button" disabled={refreshing} onClick={onRefresh}>
        <RefreshCw size={13} aria-hidden="true" />
        {refreshing ? "Checking…" : "Check again"}
      </Button>
    </div>
  );
}
