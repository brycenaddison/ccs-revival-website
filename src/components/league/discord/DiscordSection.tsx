/**
 * League Admin > Discord: each team's role and private text and voice channels in the CCS server.
 *
 * One status read (`queries.teamDiscord`) drives the section: what the bot recorded per team, drift
 * against Discord, warnings, role holders, queued syncs, the provision preflight and teardown counts.
 * Provisioning is the only step staff repeat by hand. Once the conference category exists the API's
 * background worker follows roster, name, code, color and logo changes on its own, so nothing here
 * re-syncs a team after a roster save.
 *
 * Provision and esubs need the `roster` scope, the same as the section. Staff roles and teardown need
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
import { queries } from "../../../lib/queries";
import { rosterNames } from "../../../lib/roster";
import {
  errorMessage,
  hasScope,
  provisionTeamDiscord,
  teamDiscordRefusal,
  type TeamDiscordProvisionReport,
  type TeamDiscordStatus,
} from "../../../lib/api";
import { useRosterPlayerSources } from "../teams/useRosterPlayerSources";
import { PROVISION_LABEL, RESOURCE_LABEL } from "./discordLabels";
import { IssueList, IssueText, type RosterNames } from "./discordIssues";
import { StaffRolesPanel } from "./StaffRolesPanel";
import { TeamDiscordCard } from "./TeamDiscordCard";
import { TeardownPanel } from "./TeardownPanel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function DiscordSection() {
  const { conf = "" } = useParams();
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

  const provision = useMutation({
    mutationFn: (teamIds?: number[]) => provisionTeamDiscord(conf, teamIds),
    // A lost response can hide Discord writes; only an explicit click sends another request.
    retry: false,
    onSuccess: async () => {
      await refresh();
      toast.success("Provisioning finished. See the report below.");
    },
  });

  if (status.isPending) return <p role="status" className="text-sm text-text-dim">Loading Discord setup…</p>;
  if (status.error || !status.data) {
    return <ErrorLine message={status.error ? errorMessage(status.error) : "The Discord setup is unavailable."} />;
  }
  const data = status.data;
  const blockers = data.preflight?.blockers ?? [];
  const canProvision = canRoster && data.available && blockers.length === 0 && !provision.isPending;
  const refusal = teamDiscordRefusal(provision.error);

  return (
    <div className="flex flex-col gap-5">
      <StatusStrip status={data} refreshing={status.isFetching} onRefresh={() => { void refresh(); }} />

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
          Creates a category for this league and, for each team, a role named and colored after the
          team (with its logo as the icon where the server allows), a private text channel named after
          the code and a voice channel named after the team. Players, substitutes, the owner and
          contacts with a Discord account get the role. After that, roster and branding changes sync in
          the background.
        </p>
        <IssueList title="Provisioning is blocked" issues={blockers} tone="destructive" people={people} />
        <IssueList title="Warnings" issues={data.preflight?.warnings ?? []} tone="warning" people={people} />
        {canRoster && (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" disabled={!canProvision || data.teams.length === 0} onClick={() => provision.mutate(undefined)}>
              {provision.isPending ? "Provisioning…" : data.provisioned ? "Provision all teams again" : "Provision all teams"}
            </Button>
            {provision.isPending && <span role="status" className="text-xs text-text-secondary">Creating roles and channels in Discord…</span>}
          </div>
        )}
        {canRoster && data.provisioned && (
          <p className="text-xs text-text-dim">
            Running it again is safe: finished teams are left alone and unfinished ones continue.
          </p>
        )}
        {refusal && refusal.issues.length > 0 ? (
          <IssueList title={refusal.error} issues={refusal.issues} tone="destructive" people={people} />
        ) : <ErrorLine message={provision.error ? errorMessage(provision.error) : null} />}
        {provision.data && !provision.isPending && <ProvisionReport report={provision.data} people={people} />}
      </section>

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
            provisioning={provision.isPending}
            onProvision={canProvision ? () => provision.mutate([team.teamId]) : null}
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
  const created = status.categories.filter(c => c.status === "created");
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={status.available ? "default" : "muted"}>
          {status.available ? "Discord connected" : "Discord not connected"}
        </Badge>
        <Badge variant={status.provisioned ? "default" : "muted"}>
          {status.provisioned ? "Provisioned" : "Not provisioned"}
        </Badge>
        {created.map(category => (
          <Badge key={category.id} variant={category.exists === false ? "destructive" : "muted"}>
            {RESOURCE_LABEL[category.kind]}{category.exists === false && " missing in Discord"}
          </Badge>
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

function ProvisionReport({ report, people }: { report: TeamDiscordProvisionReport; people: RosterNames }) {
  return (
    <div className="space-y-2" aria-live="polite">
      <h4 className="font-heading text-sm text-text-bright">Provision report</h4>
      <IssueList title="Warnings" issues={report.warnings} tone="warning" people={people} />
      {report.teams.length === 0 && <p className="text-sm text-text-dim">No teams were provisioned.</p>}
      <ul className="space-y-2">
        {report.teams.map(team => (
          <li key={team.teamId} className="rounded-md border border-border bg-bg2 p-3 text-sm">
            <span className="text-text-bright">{team.name || team.code}</span>
            {team.status && <> · {PROVISION_LABEL[team.status]}</>}
            {team.created.length > 0 && (
              <span className="text-text-secondary"> · Created {team.created.map(kind => RESOURCE_LABEL[kind].toLowerCase()).join(", ")}</span>
            )}
            {team.error && <ErrorLine message={team.error} />}
            {team.warnings.length > 0 && (
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-text-secondary">
                {team.warnings.map((warning, index) => (
                  <li key={`${warning.code}-${index}`}><IssueText issue={warning} people={people} /></li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs text-text-dim">Queued and failed teams finish in the background sync.</p>
    </div>
  );
}
