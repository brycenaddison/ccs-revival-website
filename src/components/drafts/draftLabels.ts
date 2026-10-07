/** Every draft label, shared by the schedule panels and Site Admin. Unknown codes render verbatim. */
import {
  draftRefusal,
  errorMessage,
  type DraftBatchStatus,
  type DraftGameIssueKind,
  type DraftMode,
  type DraftReceiptState,
  type DraftRole,
  type DraftRoleStatus,
  type DraftSeriesStatus,
  type GameDraftLockoutReason,
} from "../../lib/api";

export const DRAFT_MODE_LABEL: Record<DraftMode, { label: string; detail: string }> = {
  normal: { label: "Normal", detail: "Every game drafts from the full pool." },
  fearless: { label: "Fearless", detail: "A champion picked in one game is unavailable to both teams for the rest of the series." },
  ironman: { label: "Ironman", detail: "Drafter's ironman series rules." },
};

export const DRAFT_STATUS_LABEL: Record<DraftSeriesStatus, string> = {
  creating: "Creating",
  ready: "Ready",
  failed: "Failed",
  uncertain: "Uncertain",
};

export const DRAFT_BATCH_LABEL: Record<DraftBatchStatus, string> = {
  created: "Created",
  existing: "Already created",
  skipped: "Skipped",
  failed: "Failed",
  uncertain: "Uncertain",
};

export const DRAFT_RECEIPT_LABEL: Record<DraftReceiptState, string> = {
  pending: "Pending",
  processing: "Processing",
  processed: "Processed",
  retry: "Failed",
  unmatched: "Unmatched",
  unsupported: "Unsupported",
  review: "Needs review",
};

export const DRAFT_ROLE_STATUS_LABEL: Record<DraftRoleStatus, string> = {
  unknown: "Roles unknown",
  pending: "Roles pending",
  completed: "Roles confirmed",
  skipped: "Roles skipped",
};

export const DRAFT_ROLE_LABEL: Record<DraftRole, string> = {
  top: "Top",
  jg: "Jungle",
  mid: "Mid",
  bot: "Bot",
  sup: "Support",
};

/** Why a champion was unavailable to a game, with the earlier game that locked it where there is one. */
export function lockoutLabel(reason: GameDraftLockoutReason, game: number | null): string {
  if (reason === "disabled") return "Disabled for the series";
  const label = reason === "fearless" ? "Picked" : "Picked or banned";
  return game === null ? `${label} in an earlier game` : `${label} in game ${game}`;
}

export const DRAFT_GAME_ISSUE_LABEL: Record<DraftGameIssueKind, { label: string; detail: string }> = {
  champion_mismatch: {
    label: "Champions differ",
    detail: "The game's champions differ from its draft, so no statistic uses this draft.",
  },
  missing_draft: {
    label: "Missing draft",
    detail: "A game was played on a drafted match, but no draft is stored for its number.",
  },
};

const ERROR_TEXT: Record<string, string> = {
  body_must_be_empty: "The request carried a body this action does not accept.",
  bye_has_no_draft: "A bye has no draft room.",
  catalog_unavailable: "The champion list is unavailable right now. Try again shortly.",
  creation_conflict: "This match already has a draft registration with different details or an unresolved attempt.",
  draft_game_not_found: "That game number is beyond this series' length.",
  draft_revision_conflict: "Someone changed this draft after you opened it. The editor has reloaded with the current draft; make your correction again.",
  draft_series_not_found: "That draft series no longer exists.",
  draft_storage_unavailable: "Draft storage is unavailable right now. Try again shortly.",
  drafter_not_configured: "Drafter is not configured on the server.",
  explicit_labels_required: "A team on this day has no name, or a name longer than 35 characters. Create those rooms one match at a time with your own labels.",
  fetch_cooldown: "This room was checked recently. Wait before checking again.",
  first_selection_disabled: "This series does not allow first selection, so blue must pick first.",
  fixture_changed: "The match changed while the room was being created.",
  fixture_not_found: "That match no longer exists.",
  game_amount_mismatch: "The game count must match the match's best-of.",
  invalid_champion: "One of the disabled champions is not a known champion.",
  invalid_creation_response: "Drafter answered with something unexpected.",
  invalid_pagination: "That page of issues could not be loaded.",
  invalid_receipt_id: "That receipt ID is not valid.",
  lease_lost: "Another worker took over this receipt. Reload and try again.",
  local_save_failure: "Drafter created the room but the server could not save it.",
  match_not_on_day: "A selected match is not on this day.",
  provider_failure: "Drafter did not answer clearly.",
  provider_throttled: "Drafter is rate limiting requests. Try again later.",
  provider_unavailable: "Drafter has no results for this room yet, or is unavailable. Try again later.",
  receipt_not_found: "That receipt no longer exists.",
  request_budget: "Too many Drafter requests right now. Try again later.",
  reservation_lost: "The room reservation was lost mid-request.",
  series_not_ready: "This match has no ready draft room to check.",
  settings_revision_conflict: "Someone else changed the draft settings first. Review the current settings and save again.",
  stale_snapshot_conflict: "The saved delivery conflicts with newer data and needs review.",
  unknown_champion: "One of the champions is not a known champion.",
  unmatched_series: "The delivery does not match a registered draft room.",
  unsupported_event: "Drafter sent an event this server does not handle.",
};

/** The sentence for a draft error code, or the code itself when it is new. */
export function draftCodeText(code: string): string {
  return ERROR_TEXT[code] ?? code;
}

/** The sentence for a failed draft request; failures without a category render verbatim. */
export function draftErrorText(error: unknown): string {
  const refusal = draftRefusal(error);
  return refusal ? draftCodeText(refusal.category) : errorMessage(error);
}
