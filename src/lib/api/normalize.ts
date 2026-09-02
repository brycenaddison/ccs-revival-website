/**
 * Coercion and formatting helpers for the CCS API boundary.
 *
 * The API is Postgres behind Express, which leaks two quirks into JSON:
 *   - `numeric` columns arrive as strings ("0.77"), while `int`/`bigint` arrive as numbers.
 *   - KDA is `'Infinity'::numeric` when a player has zero deaths.
 * Everything here exists so components can work with plain numbers.
 */

export type Numeric = string | number | null | undefined;

/** Parse an API numeric into a number. Non-finite and unparseable values fall back. */
export function num(v: Numeric, fallback = 0): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
  if (typeof v !== "string" || v.trim() === "") return fallback;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Like `num`, but preserves "no data" instead of collapsing it to 0. */
export function numOrNull(v: Numeric): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v.trim() === "") return null;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse a ratio that may legitimately be infinite (KDA with zero deaths).
 * Postgres sends `'Infinity'`; lowercase `'infinity'` also appears in some views.
 */
export function ratio(v: Numeric): number {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return 0;
  const s = v.trim();
  if (/^-?infinity$/i.test(s)) return s.startsWith("-") ? -Infinity : Infinity;
  const n = Number.parseFloat(s);
  return Number.isNaN(n) ? 0 : n;
}

/** Render a ratio for display, showing ∞ rather than "Infinity". */
export function fmtRatio(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return v > 0 ? "∞" : "—";
  return v.toFixed(digits);
}

/** Sort key that pushes missing/infinite values to the bottom of a descending sort. */
export function sortValue(v: unknown): number {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : -Infinity;
}

/** Format a 0..1 fraction as a whole percentage. */
export function fmtPct(v: Numeric, digits = 0): string {
  const n = numOrNull(v);
  if (n === null) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

/** Format a duration in seconds as m:ss. */
export function fmtSec(sec: Numeric): string {
  const n = numOrNull(sec);
  if (n === null) return "—";
  const m = Math.floor(n / 60);
  const s = Math.floor(n % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Convert the integer `color` column to a CSS hex string.
 *
 * `null` and `0` both appear in live data and both mean "no color set" — a real
 * black team color is not distinguishable from unset, so treat 0 as unset rather
 * than rendering a black-on-black badge.
 */
export function hexFromInt(color: number | null | undefined, fallback = "#3a3a3a"): string {
  if (color === null || color === undefined || !Number.isFinite(color) || color === 0) return fallback;
  return "#" + Math.trunc(color).toString(16).padStart(6, "0");
}

/**
 * The inverse: a `<input type="color">` value back into the integer column.
 *
 * **Pure black is nudged to `#010101`.** `hexFromInt` reads `0` as unset — it has to, because live
 * data uses it that way — so a team that genuinely picked black would save and come back colorless.
 * One unit off is visually identical and survives the round trip. Anything unparseable lands there
 * too rather than on `0`, for the same reason: a color control always reports a value, so an
 * unreadable one is a bug in the caller, not a request to clear the field.
 */
export function intFromHex(hex: string): number {
  const parsed = Number.parseInt(hex.replace("#", ""), 16);
  if (!Number.isFinite(parsed) || parsed === 0) return 0x010101;
  return parsed;
}

/**
 * The optional secondary color, for spreading into a mapped team.
 *
 * Absent keys stay absent rather than becoming `null`: a deployment or a read without the column has
 * no secondary color, which is not the same answer as a team that has never set one. Every
 * team-shaped mapper spreads this, so the rule lives once — `lib/teamStyle.ts` reads the result.
 */
export function colorSecondaryOf(raw: Record<string, unknown>): { colorSecondary?: number | null } {
  return "colorSecondary" in raw ? { colorSecondary: numOrNull(raw.colorSecondary as Numeric) } : {};
}

/** Lighten a #rrggbb color toward white, for deriving a gradient's second stop when a team has none. */
export function lighten(hex: string, amount = 0.35): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const v = Number.parseInt(m[1], 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const r = mix((v >> 16) & 0xff);
  const g = mix((v >> 8) & 0xff);
  const b = mix(v & 0xff);
  return "#" + [r, g, b].map(c => c.toString(16).padStart(2, "0")).join("");
}

/**
 * Upgrade an asset URL to https.
 *
 * Team logos and article artwork are stored with an `http://` scheme. The media host does serve
 * https (and 301s http to it), but browsers block mixed content *before* following the redirect,
 * so the upgrade has to happen client-side.
 */
export function httpsUrl(u: string | null | undefined): string | undefined {
  if (!u) return undefined;
  const s = u.trim();
  if (s === "") return undefined;
  return s.startsWith("http://") ? "https://" + s.slice("http://".length) : s;
}

export const ROLE_ORDER = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;
export type Role = (typeof ROLE_ORDER)[number];

const ROLE_ALIASES: Record<string, Role> = {
  TOP: "TOP",
  JG: "JUNGLE",
  JUNG: "JUNGLE",
  JUNGLE: "JUNGLE",
  MID: "MIDDLE",
  MIDDLE: "MIDDLE",
  BOT: "BOTTOM",
  ADC: "BOTTOM",
  BOTTOM: "BOTTOM",
  SUP: "UTILITY",
  SUPP: "UTILITY",
  SUPPORT: "UTILITY",
  UTILITY: "UTILITY",
};

/** Map any of the casings/abbreviations in play onto a canonical Riot role. */
export function normalizeRole(v: string | null | undefined): Role | null {
  if (!v) return null;
  return ROLE_ALIASES[v.trim().toUpperCase()] ?? null;
}

export function isRole(v: string): v is Role {
  return (ROLE_ORDER as readonly string[]).includes(v);
}

/**
 * Display labels. `UTILITY` is Riot's internal name for the support position and nobody in the
 * league calls it that; every other role reads the same either way.
 *
 * Only the *label* differs. The canonical value stays Riot's, because it is what the API filters
 * on (`/stats/champions/:conf/:role`) and what `playerstats.role` is keyed by.
 */
const ROLE_LABELS: Record<Role, string> = {
  TOP: "Top",
  JUNGLE: "Jungle",
  MIDDLE: "Middle",
  BOTTOM: "Bottom",
  UTILITY: "Support",
};

/**
 * How a role should be shown.
 *
 * Passes anything it doesn't recognize straight through, so a filter's pseudo-value (`"ALL"`) or an
 * unnormalized string from upstream renders as itself rather than as the missing-value fallback.
 */
export function roleLabel(role: string | null | undefined, fallback = "—"): string {
  if (!role) return fallback;
  return ROLE_LABELS[role as Role] ?? role;
}

/** Sort rows into canonical role order, with unknown roles last. */
export function sortByRole<T extends { role: string | null }>(arr: readonly T[]): T[] {
  const idx = (r: string | null) => {
    const n = normalizeRole(r);
    return n === null ? ROLE_ORDER.length : ROLE_ORDER.indexOf(n);
  };
  return [...arr].sort((a, b) => idx(a.role) - idx(b.role));
}
