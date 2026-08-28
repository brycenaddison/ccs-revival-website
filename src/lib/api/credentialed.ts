/**
 * The transport every signed-in, mutating route shares.
 *
 * Extracted from `./admin` when the season editors arrived, because three
 * properties of the upstream app have to hold on every one of these calls and
 * two copies of them would drift:
 *
 *  - The session is an httpOnly cookie, so each call needs `credentials:
 *    "include"`. `./http` must *not* send them: the data routes sit behind a
 *    wildcard `Access-Control-Allow-Origin`, which a browser rejects on a
 *    credentialed request.
 *  - `POST`, `PUT` and `PATCH` answer `415` without `Content-Type:
 *    application/json`. That is load-bearing rather than decoration — the header
 *    forces a CORS preflight, and the preflight is the CSRF defense these routes
 *    rely on under `COOKIE_SAMESITE=none`. `DELETE` is exempt upstream because it
 *    carries no body, so no content type is sent for one.
 *  - Failures arrive in three shapes, not one: the auth and role guards answer a
 *    JSON envelope (`{ status, code, error }`), param validation answers plain
 *    text (`"zzz" is not a valid conf`), and a refused save answers `422` with a
 *    list of issues. The first two are flattened into `ApiError.detail`, which is
 *    the string a page shows. The third is its own error class, because a list of
 *    field pointers is not a sentence.
 */

import { API_BASE, ApiError, type RequestOpts } from "./http";

// ---------------------------------------------------------------------- issues

/**
 * One reason a save was refused.
 *
 * `path` is a dotted pointer into the body that was sent (`phases.2.matchDays`,
 * `nodes.7.top.src`), so an editor can mark the field rather than showing a
 * banner. `subjects` names the entities at fault — the node ids in a cycle, the
 * team booked twice — for the cases where a body path is not what the user sees,
 * a bracket canvas being the obvious one.
 */
export interface ValidationIssue {
  path: string;
  message: string;
  subjects?: number[];
}

/**
 * A `422`: the body parsed and is still wrong, and **nothing was written**.
 *
 * Separate from `ApiError` so a call site can branch on it without matching on a
 * status code, and so the issues survive as data. Everything wrong comes back at
 * once, so fixing four mistakes is one round trip rather than four.
 */
export class SaveRejected extends Error {
  constructor(
    readonly path: string,
    readonly issues: ValidationIssue[],
  ) {
    super(
      issues.length === 0
        ? `Save refused by ${path}`
        : `Save refused: ${issues.map(i => i.message).join("; ")}`,
    );
    this.name = "SaveRejected";
  }
}

/** The issues, or `null` when this failure was something else. */
export function issuesOf(e: unknown): ValidationIssue[] | null {
  return e instanceof SaveRejected ? e.issues : null;
}

// ------------------------------------------------------------------- unwrapping

type Raw = Record<string, unknown>;

const asRaw = (v: unknown): Raw => (v && typeof v === "object" ? (v as Raw) : {});

/** The message to show, whichever of the two non-422 error shapes it arrived in. */
function detailOf(text: string): string {
  const body = text.trim();
  if (!body.startsWith("{")) return body.slice(0, 300);
  try {
    const parsed = JSON.parse(body) as { error?: unknown };
    return typeof parsed.error === "string" ? parsed.error : body.slice(0, 300);
  } catch {
    return body.slice(0, 300);
  }
}

/**
 * The error body as data, for the failures that carry more than a sentence.
 *
 * `undefined` rather than `null` when there is nothing to parse, so `ApiError`'s optional field
 * stays absent: a plain-text param error has no body to speak of, and an empty object would
 * invite a call site to read fields off it.
 */
function bodyOf(text: string): unknown {
  const body = text.trim();
  if (!body.startsWith("{")) return undefined;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return undefined;
  }
}

function toIssues(raw: unknown): ValidationIssue[] {
  const list = asRaw(raw).issues;
  if (!Array.isArray(list)) return [];

  return list.flatMap((entry: unknown) => {
    const i = asRaw(entry);
    if (typeof i.message !== "string") return [];
    return [
      {
        path: typeof i.path === "string" ? i.path : "",
        message: i.message,
        ...(Array.isArray(i.subjects)
          ? {
              subjects: i.subjects.filter(
                (s): s is number => typeof s === "number" && Number.isFinite(s),
              ),
            }
          : {}),
      },
    ];
  });
}

// ------------------------------------------------------------------ transport

export interface Init {
  method?: string;
  /** Omit entirely for a GET or DELETE — presence is what adds the content type. */
  body?: unknown;
}

export async function credentialedRequest(
  path: string,
  init: Init = {},
  opts?: RequestOpts,
): Promise<unknown> {
  const hasBody = init.body !== undefined;
  const res = await fetch(`${API_BASE}${path}`, {
    method: init.method ?? "GET",
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
    },
    body: hasBody ? JSON.stringify(init.body) : undefined,
    signal: opts?.signal,
  });

  // Read once, unconditionally — an error body is plain text as often as it is JSON.
  const text = await res.text();

  if (res.status === 422) {
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      // A 422 that isn't the documented envelope is still a refusal, just an
      // unexplained one. Better an empty issue list than a thrown parse error
      // that loses the status.
    }
    throw new SaveRejected(path, toIssues(parsed));
  }

  if (!res.ok) {
    throw new ApiError(res.status, path, detailOf(text) || res.statusText, bodyOf(text));
  }
  if (text.trim() === "") return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(res.status, path, `expected JSON, got: ${text.slice(0, 120)}`);
  }
}
