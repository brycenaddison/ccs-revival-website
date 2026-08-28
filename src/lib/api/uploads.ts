/**
 * Image uploads — `POST /uploads/images`.
 *
 * **Not `credentialedRequest`, and it can't be.** That transport JSON-stringifies its body and sets
 * `Content-Type: application/json`, which is exactly what this route rejects: it takes the raw file
 * bytes as the request body and reads the declared image type off `Content-Type`, then verifies the
 * bytes' own signature against it. Multipart form data is refused too. So this is the one write in
 * the API layer with its own `fetch`, and the reason is the content type rather than laziness.
 *
 * It still needs the session cookie, so `credentials: "include"` — and note there is no JSON content
 * type to force a preflight here. `image/png` is not a CORS-simple content type either (the simple
 * set is only `text/plain`, `multipart/form-data` and `application/x-www-form-urlencoded`), so the
 * browser preflights this anyway and the same CSRF property holds.
 *
 * Every failure this route has is one a person can act on — too big, wrong type, out of quota — so
 * they are mapped to sentences rather than passed through as status codes. `errorMessage` on a bare
 * `ApiError` would say "Payload Too Large", which tells a writer nothing about what to do next.
 */

import { API_BASE, ApiError, type RequestOpts } from "./http";

/**
 * What the route accepts, verified against the file's own signature server-side.
 *
 * Mirrored here so the file picker can filter to these rather than letting somebody choose a HEIC
 * from a phone and find out after the upload that it was refused.
 */
export const UPLOAD_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

export type UploadImageType = (typeof UPLOAD_IMAGE_TYPES)[number];

/** The `accept` attribute for a file input, straight off the accepted list. */
export const UPLOAD_ACCEPT = UPLOAD_IMAGE_TYPES.join(",");

/** 5 MiB, matching the route's own limit. Checked here so a doomed upload never leaves the browser. */
export const UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

/** Upstream's per-profile quota, for the copy on a `429`. */
export const UPLOAD_HOURLY_LIMIT = 20;

export function isUploadImageType(v: unknown): v is UploadImageType {
  return typeof v === "string" && (UPLOAD_IMAGE_TYPES as readonly string[]).includes(v);
}

/**
 * A refused upload, already worded for a person.
 *
 * Separate from `ApiError` so a call site can show `message` without matching on status codes, and
 * so the retry hint survives as data — a `429` is the one failure where *when* matters as much as
 * what.
 */
export class UploadRejected extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Seconds to wait, from `Retry-After` on a `429`. Null when the response didn't say. */
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "UploadRejected";
  }
}

function refusalFor(status: number, retryAfter: number | null, detail: string): UploadRejected {
  switch (status) {
    case 400:
      return new UploadRejected(
        status,
        "That file isn't the image type its name claims. Try re-saving it as a PNG or JPEG.",
      );
    case 401:
      return new UploadRejected(status, "Your session expired. Sign in again and retry the upload.");
    case 413:
      return new UploadRejected(status, `That image is over ${UPLOAD_MAX_BYTES / 1024 / 1024} MB.`);
    case 415:
      return new UploadRejected(status, "Only PNG, JPEG, WebP and GIF images can be uploaded.");
    case 429:
      return new UploadRejected(
        status,
        retryAfter === null
          ? `You've hit the limit of ${UPLOAD_HOURLY_LIMIT} uploads an hour. Try again shortly.`
          : `You've hit the limit of ${UPLOAD_HOURLY_LIMIT} uploads an hour. Try again in ${describeWait(retryAfter)}.`,
        retryAfter,
      );
    case 503:
      return new UploadRejected(
        status,
        "Image storage isn't configured on this deployment, so uploads are unavailable. Paste an image URL instead.",
      );
    default:
      // Anything else keeps whatever the server said; it is not a case with known copy.
      return new UploadRejected(status, detail || "The upload failed. Try again.");
  }
}

function describeWait(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? "a minute" : `${minutes} minutes`;
}

/**
 * Send one file and get back the absolute URL to store.
 *
 * The two client-side checks are not duplicated validation for its own sake: a 6 MB photo would
 * otherwise be uploaded in full before the server refused it, which on a phone connection is a
 * minute of somebody's time and their data. The server remains the authority on both — it checks the
 * bytes, not the declared type.
 */
export async function uploadImage(file: File, opts?: RequestOpts): Promise<string> {
  if (!isUploadImageType(file.type)) {
    throw new UploadRejected(415, "Only PNG, JPEG, WebP and GIF images can be uploaded.");
  }
  if (file.size > UPLOAD_MAX_BYTES) {
    throw new UploadRejected(413, `That image is over ${UPLOAD_MAX_BYTES / 1024 / 1024} MB.`);
  }

  const res = await fetch(`${API_BASE}/uploads/images`, {
    method: "POST",
    credentials: "include",
    // The declared type *is* the payload's metadata here — there is no filename and no form field.
    headers: { "Content-Type": file.type, Accept: "application/json" },
    body: file,
    signal: opts?.signal,
  });

  const text = await res.text();

  if (!res.ok) {
    const header = res.headers.get("Retry-After");
    const retryAfter = header !== null && /^\d+$/.test(header.trim()) ? Number(header) : null;
    throw refusalFor(res.status, retryAfter, text.trim().slice(0, 300));
  }

  let url: unknown;
  try {
    url = (JSON.parse(text) as { url?: unknown }).url;
  } catch {
    throw new ApiError(res.status, "/uploads/images", `expected JSON, got: ${text.slice(0, 120)}`);
  }

  if (typeof url !== "string" || url === "") {
    throw new ApiError(res.status, "/uploads/images", "the upload response carried no URL");
  }
  return url;
}

export const uploadsApi = { uploadImage };
