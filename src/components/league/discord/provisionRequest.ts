/**
 * The Provision submission that has not had an answer yet, kept in `sessionStorage` per conference
 * and viewer so a refresh after a lost response can resend it. Resending the same `requestId` with
 * the same selection answers the job it created rather than queuing the work twice; a different
 * selection under that id is refused, so the selection is kept with it.
 */

import type { TeamDiscordProvisionInput } from "../../../lib/api";

export type ProvisionRequest = TeamDiscordProvisionInput;

const key = (conf: string, viewerId: number | null) => `ccs:discord-provision:${conf}:${viewerId ?? "anonymous"}`;

/** Every click is a new request; only a resend of an unanswered one reuses its id. */
export function newProvisionRequest(teamIds: readonly number[] | null): ProvisionRequest {
  return { requestId: crypto.randomUUID(), teamIds: teamIds ? [...teamIds] : null };
}

export function storedProvisionRequest(conf: string, viewerId: number | null): ProvisionRequest | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key(conf, viewerId)) ?? "null");
    if (!value || typeof value !== "object") return null;
    const { requestId, teamIds } = value as Record<string, unknown>;
    if (typeof requestId !== "string" || !requestId) return null;
    if (teamIds === null) return { requestId, teamIds: null };
    if (!Array.isArray(teamIds) || !teamIds.every(id => Number.isSafeInteger(id) && id > 0)) return null;
    return { requestId, teamIds: teamIds as number[] };
  } catch {
    // Unreadable storage or a malformed entry is no pending request.
    return null;
  }
}

/** Storage can be full or disabled; the in-memory copy still covers this page. */
export function storeProvisionRequest(conf: string, viewerId: number | null, request: ProvisionRequest): void {
  try {
    sessionStorage.setItem(key(conf, viewerId), JSON.stringify(request));
  } catch {
    // Best effort.
  }
}

/** Only clears the given request, so a late answer cannot drop a newer submission. */
export function clearProvisionRequest(conf: string, viewerId: number | null, requestId: string): void {
  try {
    if (storedProvisionRequest(conf, viewerId)?.requestId === requestId) sessionStorage.removeItem(key(conf, viewerId));
  } catch {
    // Best effort.
  }
}
