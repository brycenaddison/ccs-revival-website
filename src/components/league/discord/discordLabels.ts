/** Every reader-facing label for the team Discord section, so the panels cannot word one state two ways. */

import type {
  TeamDiscordAttemptStatus,
  TeamDiscordDrift,
  TeamDiscordProvisionCounts,
  TeamDiscordResourceKind,
  TeamDiscordRoleResyncStatus,
  TeamDiscordStage,
  TeamDiscordStageStatus,
  TeamDiscordTeardownMode,
  TeamDiscordTeardownResult,
  TeamDiscordUnconfirmedReason,
} from "../../../lib/api";

export const UNCONFIRMED_MEMBER_LABEL: Record<TeamDiscordUnconfirmedReason, string> = {
  not_in_guild: "Not in Discord server",
  missing_role: "Missing team role",
  unavailable: "Could not verify role",
};

export const RESOURCE_LABEL: Record<TeamDiscordResourceKind, string> = {
  category: "Category",
  voice_category: "Voice category",
  archive_category: "Archive category",
  role: "Role",
  text: "Text channel",
  voice: "Voice channel",
};

export const DRIFT_LABEL: Record<TeamDiscordDrift, string> = {
  role_missing: "Role missing in Discord",
  role_name: "Role name",
  role_color: "Role color",
  role_icon: "Role icon",
  text_missing: "Text channel missing in Discord",
  text_name: "Text channel name",
  text_parent: "Text channel category",
  text_permissions: "Text channel permissions",
  voice_missing: "Voice channel missing in Discord",
  voice_name: "Voice channel name",
  voice_parent: "Voice channel category",
  voice_permissions: "Voice channel permissions",
};

export const MEMBERSHIP_RETRY_GUIDANCE = "Role membership failures wait for another change to the team or a manual Resync roles.";
export const RESOURCE_RETRY_GUIDANCE = "Role or channel failures require a league admin to retry the Provision job or run Provision again.";

export const ATTEMPT_STATUS_LABEL: Record<TeamDiscordAttemptStatus, string> = {
  queued: "Queued",
  running: "Running",
  succeeded: "Completed",
  failed: "Failed",
  needs_attention: "Needs attention",
  superseded: "Cancelled by teardown",
};

export const STAGE_LABEL: Record<TeamDiscordStage, string> = {
  role: "Role",
  membership: "Role membership",
  text: "Text channel",
  voice: "Voice channel",
};

export const STAGE_STATUS_LABEL: Record<TeamDiscordStageStatus, string> = {
  running: "Running",
  succeeded: "Done",
  failed: "Failed",
  needs_attention: "Needs attention",
  skipped: "Skipped, needs the role first",
};

/** Problem tokens on attempts and stages. Unknown tokens render verbatim. */
export const PROVISION_PROBLEM_LABEL: Record<string, string> = {
  creation_uncertain: "Create uncertain",
  claim_in_progress: "Create claim still held",
  claim_lost: "Create claim lost",
  mixed_channel_placement: "Channels split across categories",
  channel_parent_missing: "Channel category missing",
  invalid_resource: "Recorded resource is not usable",
  role_hierarchy: "Role hierarchy blocks the bot",
  interrupted: "Interrupted by a worker restart",
  team_missing: "Team no longer in this league",
  teardown: "Cancelled by teardown",
  discord_error: "Discord error",
  error: "Error",
};

export const provisionProblemText = (code: string): string => PROVISION_PROBLEM_LABEL[code] ?? code;

/** What to do before retrying a team that stopped on one of these tokens. */
export const PROVISION_RETRY_GUIDANCE: Record<string, string> = {
  creation_uncertain: "Discord may still be settling this create. Wait a couple of minutes before retrying so the retry can settle the claim through the audit log.",
  claim_in_progress: "Discord may still be settling this create. Wait a couple of minutes before retrying so the retry can settle the claim through the audit log.",
  mixed_channel_placement: "Move this league's channels into one category in Discord, or adopt an existing category, before retrying.",
  channel_parent_missing: "Move this league's channels into one category in Discord, or adopt an existing category, before retrying.",
  interrupted: "A retry inspects anything the interrupted attempt left behind before creating again.",
};

/**
 * "8 completed, 2 running, 4 queued, 1 needs attention", omitting empty buckets, in the order a
 * reader scans for progress and then problems.
 */
export function provisionCountsText(counts: TeamDiscordProvisionCounts): string {
  const parts: [number, string][] = [
    [counts.succeeded, "completed"],
    [counts.running, "running"],
    [counts.queued, "queued"],
    [counts.failed, "failed"],
    [counts.needsAttention, counts.needsAttention === 1 ? "needs attention" : "need attention"],
    [counts.superseded, "cancelled by teardown"],
  ];
  const text = parts.filter(([n]) => n > 0).map(([n, label]) => `${n} ${label}`).join(", ");
  return text || "No teams";
}

/** "45s", "1m 20s", "2h 5m". */
export function elapsedText(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export const teamCountText = (n: number): string => `${n} ${n === 1 ? "team" : "teams"}`;

export const ROLE_RESYNC_LABEL: Record<TeamDiscordRoleResyncStatus, string> = {
  synced: "Roles synced",
  queued: "Queued for completion",
  in_progress: "In progress",
  failed: "Failed",
  not_provisioned: "Role missing; provision this team first",
};

export const TEARDOWN_MODE: Record<TeamDiscordTeardownMode, { label: string; detail: string }> = {
  archive: {
    label: "Archive",
    detail: "Moves the text channels into a new archive category, read-only for staff roles. Deletes the voice channels, roles and categories.",
  },
  delete: {
    label: "Delete",
    detail: "Deletes every recorded role, channel and category, including text channels archived earlier.",
  },
};

export const TEARDOWN_RESULT: Record<TeamDiscordTeardownResult, string> = {
  deleted: "Deleted",
  gone: "Already gone from Discord",
  archived: "Archived",
  released: "Unfinished create released",
  failed: "Failed",
};
