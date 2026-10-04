/** Every reader-facing label for the team Discord section, so the panels cannot word one state two ways. */

import type {
  TeamDiscordDrift,
  TeamDiscordProvisionStatus,
  TeamDiscordResourceKind,
  TeamDiscordRoleResyncStatus,
  TeamDiscordTeardownMode,
  TeamDiscordTeardownResult,
} from "../../../lib/api";

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

export const PROVISION_LABEL: Record<TeamDiscordProvisionStatus, string> = {
  provisioned: "Provisioned",
  in_progress: "In progress",
  queued: "Queued for background sync",
  failed: "Failed",
};

export const ROLE_RESYNC_LABEL: Record<TeamDiscordRoleResyncStatus, string> = {
  synced: "Roles synced",
  queued: "Queued for background sync",
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
