/**
 * Transport layer for the CCS API.
 *
 * Three behaviours of the upstream Express app drive the design here:
 *
 *  1. "Not found" is signalled as HTTP 200 with a JSON `null` body, never a 404.
 *     A 404 therefore means the *route* doesn't exist — which is how endpoints that
 *     haven't been built yet present themselves. Both cases are absence, not failure.
 *  2. Param-validation errors are `text/plain` (`"4" is not a valid conf`), so the
 *     response body must never be parsed as JSON before the status is checked.
 *  3. `GET /tournaments` returns an empty body when its database query fails.
 */

export const API_BASE: string =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "") || "https://api.brycenaddison.com";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    readonly detail: string,
    /**
     * The parsed error body, when there was one.
     *
     * `detail` is the sentence to show; this is for the failures that carry *data* as well. A
     * `409` from the code routes names the match and game already holding the code, and "that
     * code is already registered" without them doesn't tell an admin where to look. Undefined for
     * the plain-text param errors, which is most of them.
     */
    readonly body?: unknown,
  ) {
    super(`CCS API ${status} on ${path}: ${detail}`);
    this.name = "ApiError";
  }
}

export interface RequestOpts {
  signal?: AbortSignal;
}

/** Sentinel for a route that does not exist upstream (i.e. a not-yet-built endpoint). */
const MISSING_ROUTE = Symbol("missing-route");

async function request(path: string, opts?: RequestOpts): Promise<unknown | typeof MISSING_ROUTE> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: "application/json" },
    signal: opts?.signal,
  });

  // Read once, unconditionally — error bodies are plain text.
  const text = await res.text();

  if (res.status === 404) return MISSING_ROUTE;
  if (!res.ok) throw new ApiError(res.status, path, text.slice(0, 300) || res.statusText);
  if (text.trim() === "") return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(res.status, path, `expected JSON, got: ${text.slice(0, 120)}`);
  }
}

/**
 * Fetch a collection. Absent data — a `null` body, a non-array body, or a route that
 * doesn't exist yet — all yield an empty array, so callers never branch on absence.
 */
export async function getList<T>(path: string, opts?: RequestOpts): Promise<T[]> {
  const data = await request(path, opts);
  if (data === MISSING_ROUTE || data === null) return [];
  return Array.isArray(data) ? (data as T[]) : [];
}

/** Fetch a single resource, `null` when absent. */
export async function getOne<T>(path: string, opts?: RequestOpts): Promise<T | null> {
  const data = await request(path, opts);
  if (data === MISSING_ROUTE || data === null) return null;
  return data as T;
}

export async function post<T>(path: string, body?: unknown, opts?: RequestOpts): Promise<T | null> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: opts?.signal,
  });
  const text = await res.text();
  if (res.status === 404) return null;
  if (!res.ok) throw new ApiError(res.status, path, text.slice(0, 300) || res.statusText);
  if (text.trim() === "") return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** True when a rejection is just an aborted request, which callers should ignore. */
export function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}

/** Human-readable message for an error surfaced in the UI. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.detail || e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}
