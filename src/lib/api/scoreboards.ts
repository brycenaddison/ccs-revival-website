/**
 * Site-admin scoreboard recovery, keyed only by scheduled fixture ID.
 * Private reads never cache. A typed status 404 describes a missing fixture; a plain route 404
 * is still an error. Preview PNGs use the existing cookie transport, never a direct image URL.
 * Resend UUIDs identify one reviewed image forever, including after expiry or response loss.
 */
import { credentialedBlobRequest, credentialedRequest } from "./credentialed";
import { ApiError, type RequestOpts } from "./http";

export const SCOREBOARD_IMAGE_BYTES_MAX = 8 * 1024 * 1024;
export const SCOREBOARD_HISTORY_MAX = 20;
export const SCOREBOARD_PREVIEW_LIFETIME_MS = 5 * 60_000;
// Rendering can involve several 30-second browser operations; ordinary read deadlines are too short.
export const SCOREBOARD_OPERATION_TIMEOUT_MS = 120_000;
export const SCOREBOARD_ELIGIBILITIES = ["not_found", "hidden", "pending", "review", "ready"] as const;
export const SCOREBOARD_ORIGINAL_DELIVERIES = ["sent", "sending", "failed", "not_attempted", "unconfigured"] as const;
export const SCOREBOARD_RENDER_STATUSES = ["not_checked", "ready", "unavailable"] as const;
export const SCOREBOARD_RESEND_STATUSES = ["sent", "already_sent", "failed", "unknown", "in_progress", "preview_expired", "stale_preview", "stale_destination", "original_not_sent"] as const;
export type ScoreboardResendStatus = (typeof SCOREBOARD_RESEND_STATUSES)[number];

export interface ScoreboardDestination {
  conf: string;
  revision: number;
  webhookId: string;
  guildId: string;
  channelId: string;
}
export interface ScoreboardResendRecord {
  recipientSnowflake: string | null;
  messageKey: string | null;
  status: string | null;
  attemptId: string | null;
  updatedAt: string | null;
}
export interface ScoreboardStatus {
  scheduleMatchId: number;
  eligibility: (typeof SCOREBOARD_ELIGIBILITIES)[number] | null;
  reason: string | null;
  destination: ScoreboardDestination | null;
  originalDelivery: (typeof SCOREBOARD_ORIGINAL_DELIVERIES)[number] | null;
  originalImage: boolean | null;
  browserConfigured: boolean | null;
  scoreboard: {
    status: (typeof SCOREBOARD_RENDER_STATUSES)[number] | null;
    reason: string | null;
    checkedAt: string | null;
  };
  resends: ScoreboardResendRecord[];
}
export interface ScoreboardPreview {
  previewId: string;
  expiresAt: string;
  imageUrl: string;
  bytes: number;
  sha256: string;
  destination: ScoreboardDestination;
}

type Raw = Record<string, unknown>;
const raw = (v: unknown): Raw => v && typeof v === "object" && !Array.isArray(v) ? v as Raw : {};
const str = (v: unknown): string | null => typeof v === "string" ? v : null;
const date = (v: unknown): string | null => typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : null;
const bool = (v: unknown): boolean | null => typeof v === "boolean" ? v : null;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const base = (id: number) => `/admin/matches/${id}/scoreboard`;

function destinationOf(v: unknown): ScoreboardDestination | null {
  const d = raw(v);
  if (typeof d.conf !== "string" || !d.conf || typeof d.revision !== "number" ||
      !Number.isSafeInteger(d.revision) || d.revision < 0 ||
      typeof d.webhookId !== "string" || !d.webhookId || typeof d.guildId !== "string" || !d.guildId ||
      typeof d.channelId !== "string" || !d.channelId) return null;
  return { conf: d.conf, revision: d.revision, webhookId: d.webhookId, guildId: d.guildId, channelId: d.channelId };
}

function statusOf(v: unknown, id: number): ScoreboardStatus {
  const r = raw(v);
  if (r.scheduleMatchId !== id || !Array.isArray(r.resends)) {
    throw new Error("The scoreboard status response is unavailable. Refresh to try again.");
  }
  const s = raw(r.scoreboard);
  return {
    scheduleMatchId: id,
    eligibility: SCOREBOARD_ELIGIBILITIES.find(value => value === r.eligibility) ?? null,
    reason: str(r.reason), destination: destinationOf(r.destination),
    originalDelivery: SCOREBOARD_ORIGINAL_DELIVERIES.find(value => value === r.originalDelivery) ?? null,
    originalImage: bool(r.originalImage), browserConfigured: bool(r.browserConfigured),
    scoreboard: { status: SCOREBOARD_RENDER_STATUSES.find(value => value === s.status) ?? null,
      reason: str(s.reason), checkedAt: date(s.checkedAt) },
    resends: r.resends.slice(0, SCOREBOARD_HISTORY_MAX).map(v => {
      const row = raw(v);
      return { recipientSnowflake: str(row.recipientSnowflake), messageKey: str(row.messageKey),
        status: str(row.status), attemptId: str(row.attemptId), updatedAt: date(row.updatedAt) };
    }),
  };
}

export async function scoreboardStatus(id: number, opts?: RequestOpts): Promise<ScoreboardStatus> {
  try {
    return statusOf(await credentialedRequest(base(id), { cache: "no-store", expectedStatus: 200 }, opts), id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404 && raw(error.body).eligibility === "not_found") {
      return statusOf(error.body, id);
    }
    throw error;
  }
}

async function operation(path: string, body: unknown): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCOREBOARD_OPERATION_TIMEOUT_MS);
  try {
    return await credentialedRequest(path, { method: "POST", body, cache: "no-store", expectedStatus: 200 }, { signal: controller.signal });
  } catch (error) {
    if (error instanceof ApiError) {
      const r = raw(error.body);
      // These routes use status/reason envelopes as well as the ordinary { error } envelope.
      const detail = str(r.reason) ?? str(r.status);
      if (detail && typeof r.error !== "string") throw new ApiError(error.status, path, detail, error.body);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function previewScoreboard(id: number): Promise<ScoreboardPreview> {
  const r = raw(await operation(`${base(id)}/preview`, {}));
  const destination = destinationOf(r.destination);
  const expiresAt = date(r.expiresAt);
  // Only the documented fixture path can receive the session. Never follow an arbitrary returned URL.
  if (r.status !== "ready" || typeof r.previewId !== "string" || !UUID.test(r.previewId) ||
      typeof r.imageUrl !== "string" || r.imageUrl !== `${base(id)}/previews/${r.previewId}` || !expiresAt || !destination ||
      typeof r.bytes !== "number" || !Number.isInteger(r.bytes) || r.bytes < 1 || r.bytes > SCOREBOARD_IMAGE_BYTES_MAX ||
      typeof r.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(r.sha256)) {
    throw new Error("The scoreboard preview response is unavailable. Generate another preview to review.");
  }
  return { previewId: r.previewId, expiresAt, imageUrl: r.imageUrl, bytes: r.bytes, sha256: r.sha256, destination };
}

export async function scoreboardPreviewImage(id: number, preview: ScoreboardPreview, opts?: RequestOpts): Promise<Blob> {
  if (preview.imageUrl !== `${base(id)}/previews/${preview.previewId}` || !UUID.test(preview.previewId)) {
    throw new Error("This preview does not belong to this fixture.");
  }
  const blob = await credentialedBlobRequest(preview.imageUrl, opts);
  if (!blob.size || blob.size > SCOREBOARD_IMAGE_BYTES_MAX) throw new Error("The scoreboard PNG is unavailable.");
  return blob;
}

export async function resendScoreboard(id: number, previewId: string): Promise<ScoreboardResendStatus> {
  const r = raw(await operation(`${base(id)}/resend`, { previewId }));
  const status = SCOREBOARD_RESEND_STATUSES.find(value => value === r.status);
  if (!status) throw new Error("The delivery response is unavailable. Inspect Discord or retry this exact request.");
  return status;
}

/** Refusal codes survive alongside the verbatim error for state transitions and operator support. */
export function scoreboardRefusal(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  const r = raw(error.body);
  return str(r.status === "unavailable" ? r.reason : r.status) ?? str(r.error);
}
