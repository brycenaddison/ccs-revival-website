/**
 * League Admin > Discord: team roles/channels and the league's results destination.
 *
 * One status read (`queries.teamDiscord`) drives the Teams panel: what the bot recorded per team, drift
 * against Discord, warnings, confirmed/unconfirmed recipients, queued syncs, the provision preflight
 * and teardown counts.
 * Admins provision missing resources, preserving Discord customization. Provision queues a job that
 * ProvisionSection follows; role resync still answers a report. Roster changes and profile
 * links reconcile existing role membership upstream, so nothing here resyncs after a roster save.
 *
 * Role resync and esubs need `roster`; Provision, staff roles and teardown need `admin`.
 * Hiding controls is presentation; the API is the boundary. Failed work stays held until a new
 * event or manual request, and does not keep status polling alive.
 * Results has its own admin-only reads and revisioned writes in ResultsPanel, independent of team
 * provisioning. Keep both tab panels mounted so switching views cannot detach a pending mutation.
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
  resyncTeamDiscordRoles,
  teamDiscordRefusal,
  teamDiscordWorkState,
  type TeamDiscordStatus,
} from "../../../lib/api";
import { useRosterPlayerSources } from "../teams/useRosterPlayerSources";
import { IssueList } from "./discordIssues";
import { DiscordResourceBadge } from "./DiscordResourceBadge";
import { DiscordOperationReport } from "./DiscordOperationReport";
import { ProvisionSection } from "./ProvisionSection";
import { StaffRolesPanel } from "./StaffRolesPanel";
import { useProvisionJobs } from "./useProvisionJobs";
import { TeamDiscordCard } from "./TeamDiscordCard";
import { TeardownPanel } from "./TeardownPanel";
import { ResultsPanel } from "./ResultsPanel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  if (!canAdmin) return canRoster ? <TeamDiscordPanel conf={conf} /> : null;
  if (!canRoster) return <ResultsPanel conf={conf} viewerId={profile?.id ?? null} />;

  return (
    <Tabs defaultValue="teams" className="gap-5">
      <TabsList aria-label="Discord settings">
        <TabsTrigger value="teams">Teams</TabsTrigger>
        <TabsTrigger value="results">Results</TabsTrigger>
      </TabsList>
      {/* Mutations outlive tab changes, retaining pending observers and unresolved request IDs. */}
      <TabsContent value="teams" forceMount className="data-[state=inactive]:hidden">
        <TeamDiscordPanel conf={conf} />
      </TabsContent>
      <TabsContent value="results" forceMount className="data-[state=inactive]:hidden">
        <ResultsPanel conf={conf} viewerId={profile?.id ?? null} />
      </TabsContent>
    </Tabs>
  );
}

function TeamDiscordPanel({ conf }: { conf: string }) {
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
  // Refreshes the jobs list and the followed job too, which sit under the status key.
  const refresh = () => qc.invalidateQueries({ queryKey: statusOptions.queryKey });
  const provisioning = useProvisionJobs(conf, viewerId);

  const resync = useMutation({
    mutationFn: (teamIds?: number[]) => resyncTeamDiscordRoles(conf, teamIds),
    // A lost response can hide Discord writes; only an explicit click sends another request.
    retry: false,
    onSuccess: () => {
      toast.success("Role resync request finished. See the report below.");
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
  const canProvision = canAdmin && data.available && blockers.length === 0 && !provisioning.blocked;
  const canResync = canRoster && data.available && !resync.isPending;
  const refusal = teamDiscordRefusal(resync.error);

  return (
    <div className="flex flex-col gap-5">
      <StatusStrip status={data} refreshing={status.isFetching} onRefresh={() => { void refresh(); }} />
      <IssueList title="Category issues need admin attention" issues={data.cleanupIssues} tone="warning" people={people} />

      {!data.available && (
        <Alert variant="warning">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Discord is not connected</AlertTitle>
          <AlertDescription>
            <p>
              This is what the bot recorded. Current role holders, whether each role and channel still
              exists, which resources need repair and the readiness checks are unknown until Discord
              answers. Changes are unavailable until then.
            </p>
          </AlertDescription>
        </Alert>
      )}

      <ProvisionSection
        conf={conf}
        viewerId={viewerId}
        status={data}
        canAdmin={canAdmin}
        people={people}
        provisioning={provisioning}
        onRefresh={refresh}
      />

      <section aria-labelledby="discord-resync" className="flex flex-col gap-3">
        <h3 id="discord-resync" className="font-heading text-sm text-text-bright">Role membership</h3>
        <p className="text-sm text-text-secondary">
          Reconcile existing team roles with eligible roster members and active esubs, including people
          who joined the server later or whose grants failed. Manual role grants are preserved.
          This action changes membership only. Teams with missing roles need provisioning first.
        </p>
        {canRoster && (
          <div>
            <Button variant="outline" type="button" disabled={!canResync || data.teams.length === 0} onClick={() => resync.mutate(undefined)}>
              {resync.isPending ? "Resyncing roles…" : "Resync all team roles"}
            </Button>
          </div>
        )}
      </section>

      {resync.isPending && <p role="status" className="text-xs text-text-secondary">Reconciling role membership in Discord…</p>}
      {refusal && refusal.issues.length > 0 ? (
        <IssueList title={refusal.error} issues={refusal.issues} tone="destructive" people={people} />
      ) : <ErrorLine message={resync.error ? errorMessage(resync.error) : null} />}
      {resync.data && !resync.isPending && <DiscordOperationReport report={resync.data} people={people} />}

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
            canProvision={canAdmin && data.available}
            source={sources.discord}
            people={people}
            working={resync.isPending || provisioning.blocked}
            onProvision={canProvision ? () => provisioning.start([team.teamId]) : null}
            onResync={canResync ? () => resync.mutate([team.teamId]) : null}
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
  const workStates = status.teams.map(team => teamDiscordWorkState(team.queued));
  const pending = workStates.filter(state => state === "pending").length;
  const held = workStates.filter(state => state === "held").length;
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
        {pending > 0 && (
          <Badge variant="muted">{pending} {pending === 1 ? "sync" : "syncs"} pending</Badge>
        )}
        {held > 0 && (
          <Badge variant="destructive">{held} {held === 1 ? "sync needs" : "syncs need"} action</Badge>
        )}
      </div>
      <Button variant="outline" size="sm" type="button" disabled={refreshing} onClick={onRefresh}>
        <RefreshCw size={13} aria-hidden="true" />
        {refreshing ? "Checking…" : "Check again"}
      </Button>
    </div>
  );
}
