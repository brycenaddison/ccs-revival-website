import {
  RESULTS_WEBHOOK_NAME_FORBIDDEN, RESULTS_WEBHOOK_NAME_MAX,
  type ResultsChannel, type ResultsOperation, type ResultsOperationStatus,
} from "../../../lib/api";

export const RESULTS_OPERATION_LABEL: Record<ResultsOperationStatus, string> = {
  creating: "Creation unresolved",
  ready: "Created, awaiting activation",
  uncertain: "Creation uncertain",
  failed: "Creation failed",
  active: "Activated",
  cancelled: "Cancelled",
};

/** Treat an unfamiliar state as unresolved rather than offering a second creation. */
export function resultsOperationPending(op: ResultsOperation): boolean {
  return op.status !== "failed" && op.status !== "active" && op.status !== "cancelled";
}

const TEST_LABEL: Record<string, string> = {
  sent: "Test sent",
  already_sent: "Test already sent",
  failed: "Test failed",
  storage_failed: "Test was not sent because its delivery could not be saved",
  sending: "Test outcome unresolved",
  in_progress: "Test outcome unresolved",
  unknown: "Test may have been sent",
  unavailable: "Discord unavailable",
  permission_denied: "Test refused by Discord permissions",
  invalid_credentials: "Test refused because the saved credentials are invalid",
  invalid_destination: "Test refused because the saved destination is invalid",
  destination_mismatch: "Test refused because the webhook moved. Save its link again to accept the new channel",
};

export function resultsTestLabel(status: string | null): string {
  return status === null ? "Test outcome unavailable" : TEST_LABEL[status] ?? status;
}

export function resultsTestUncertain(status: string | null): boolean {
  return status === null || !["sent", "already_sent", "failed", "storage_failed", "unavailable",
    "permission_denied", "invalid_credentials", "invalid_destination", "destination_mismatch"].includes(status);
}

/** Why a channel cannot take a new webhook, or null when it can. */
export function resultsChannelUnavailable(channel: ResultsChannel, leagueName: string | null): string | null {
  if (!channel.available) return `Reserved by ${leagueName ?? "another league"}`;
  if (!channel.canGenerate) return "Bot can't manage webhooks here";
  return null;
}

/** Mirrors Discord's webhook name rules; the API's refusal stays authoritative. */
export function resultsWebhookNameError(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed === "") return "Enter a webhook name.";
  if (trimmed.length > RESULTS_WEBHOOK_NAME_MAX) return `Use at most ${RESULTS_WEBHOOK_NAME_MAX} characters.`;
  const word = RESULTS_WEBHOOK_NAME_FORBIDDEN.find(w => trimmed.toLowerCase().includes(w));
  return word ? `Discord doesn't allow "${word}" in webhook names.` : null;
}
