/**
 * The home-page banner's write surface — `/admin/announcements`.
 *
 * **Site admin, deliberately not the `content` role.** A banner is an operational control that
 * renders above everything else, not editorial copy, so it sits under `/admin` with the league and
 * role editors rather than with articles. The transport is `./credentialed` for the reasons that
 * file documents.
 *
 * The `Announcement` type itself lives in `./home`, because the read on the hot path is the public
 * one: `GET /home` serves the *current* banner to every visitor, and this module only exists for
 * the handful of people who write them.
 *
 * **Which banner shows is the server's decision, not a field.** `current()` upstream picks the
 * newest active row inside its window, preferring a conf-specific one over a site-wide one posted
 * the same day. So posting a new banner replaces what is showing and the old row stays as history;
 * taking one down with nothing behind it means an explicit `PATCH { active: false }`. Nothing here
 * re-implements that rule — the editor asks `/home` which one is live rather than deriving it, so
 * the badge cannot drift from the server's answer.
 */

import { credentialedRequest } from "./credentialed";
import { mapAnnouncement, type Announcement, type AnnouncementLevel } from "./home";
import type { RequestOpts } from "./http";

// ---------------------------------------------------------------------- types

/** Enforced upstream as `MESSAGE_MAX`. Mirrored so the textarea can cap itself. */
export const MESSAGE_MAX = 4000;
export const LINK_URL_MAX = 1024;
export const LINK_LABEL_MAX = 60;

export interface AnnouncementCreate {
  message: string;
  level?: AnnouncementLevel;
  linkUrl?: string | null;
  linkLabel?: string | null;
  /** `null` — the default — is site-wide. */
  conf?: string | null;
  active?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
}

/** An absent key leaves that field alone; an explicit `null` clears a nullable one. */
export type AnnouncementUpdate = Partial<AnnouncementCreate>;

// ------------------------------------------------------------------ endpoints

type Raw = Record<string, unknown>;
const asRaw = (v: unknown): Raw => (v && typeof v === "object" ? (v as Raw) : {});

/** Every banner, retired ones included, newest first. Rendered in the order served. */
export function announcements(opts?: RequestOpts): Promise<Announcement[]> {
  return credentialedRequest("/admin/announcements", {}, opts).then(raw =>
    Array.isArray(raw) ? raw.map(mapAnnouncement) : [],
  );
}

export function announcement(id: number, opts?: RequestOpts): Promise<Announcement | null> {
  return credentialedRequest(`/admin/announcements/${id}`, {}, opts).then(raw =>
    raw === null ? null : mapAnnouncement(raw),
  );
}

export function createAnnouncement(
  input: AnnouncementCreate,
  opts?: RequestOpts,
): Promise<Announcement> {
  return credentialedRequest(
    "/admin/announcements",
    { method: "POST", body: input },
    opts,
  ).then(mapAnnouncement);
}

/** Partial update. This is also how a banner is retired — `{ active: false }`. */
export function updateAnnouncement(
  id: number,
  changes: AnnouncementUpdate,
  opts?: RequestOpts,
): Promise<Announcement> {
  return credentialedRequest(
    `/admin/announcements/${id}`,
    { method: "PATCH", body: changes },
    opts,
  ).then(mapAnnouncement);
}

export function deleteAnnouncement(id: number, opts?: RequestOpts): Promise<boolean> {
  return credentialedRequest(`/admin/announcements/${id}`, { method: "DELETE" }, opts).then(
    raw => asRaw(raw).success === true,
  );
}

/**
 * The window rule, checked before the round trip.
 *
 * Mirrors `announcements_window_check` upstream, which exists because a banner whose window is
 * inverted is accepted by every other check and then silently never renders. Returns the message
 * to show, or `null` when the window is fine.
 */
export function windowError(startsAt: string | null, endsAt: string | null): string | null {
  if (startsAt === null || endsAt === null) return null;
  const from = Date.parse(startsAt);
  const to = Date.parse(endsAt);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return to > from ? null : "The end time has to be after the start time.";
}

/** Namespaced for call sites that want the surface in one object. */
export const announcementsApi = {
  announcements,
  announcement,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
};
