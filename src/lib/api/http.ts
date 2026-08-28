/**
 * Transport layer for the CCS API.
 *
 * Three behaviors of the upstream Express app drive the design here:
 *
 *  1. "Not found" is signalled as HTTP 200 with a JSON `null` body, never a 404.
 *     A 404 therefore means the *route* doesn't exist — which is how endpoints that
 *     haven't been built yet present themselves. Both cases are absence, not failure.
 *  2. Param-validation errors are `text/plain` (`"4" is not a valid conf`), so the
 *     response body must never be parsed as JSON before the status is checked.
 *  3. `GET /tournaments` returns an empty body when its database query fails.
 */

/**
 * Where the API lives. **Required** — there is no default.
 *
 * A fallback hostname is worse than no hostname here: a deploy that forgot the variable would
 * silently talk to whatever was baked in, which is the failure that looks like a data bug rather
 * than a config one. Both workflows in `.github/workflows/` inject it from a repository variable
 * and `.env` supplies it locally, so the only way to reach this throw is to have skipped setup.
 *
 * Thrown at module load rather than per request, so it surfaces on the first page load with a
 * message naming the variable instead of as a wall of failed fetches.
 */
const configuredBase = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "");

if (!configuredBase) {
  throw new Error(
    "VITE_API_BASE_URL is not set. Point it at the CCS API (see .env.example) and restart the dev server.",
  );
}

export const API_BASE: string = configuredBase;

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
  /**
   * Force a conditional request instead of letting the browser reuse a cached body.
   *
   * Needed by the reads the server marks `Cache-Control: public, max-age=N`. React Query's
   * `invalidateQueries` refetches, but a refetch is an ordinary `fetch`, and inside the `max-age`
   * window the browser answers it from its own cache **without contacting the server** — so an
   * editor that just published something invalidates the key, gets a refetch, and is handed the
   * same stale payload. The write appears to have done nothing until the window expires.
   *
   * `no-cache` means "revalidate", not "don't cache": the request still carries `If-None-Match`, so
   * an unchanged resource costs a `304` with no body. Correctness with almost none of the traffic.
   */
  revalidate?: boolean;
}

/** Sentinel for a route that does not exist upstream (i.e. a not-yet-built endpoint). */
const MISSING_ROUTE = Symbol("missing-route");

async function request(path: string, opts?: RequestOpts): Promise<unknown | typeof MISSING_ROUTE> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: "application/json" },
    cache: opts?.revalidate ? "no-cache" : "default",
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
