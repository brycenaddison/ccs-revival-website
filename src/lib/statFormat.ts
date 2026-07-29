/**
 * Display formatters for statistic values, shared across the Stats page.
 *
 * These sit a layer above `api/normalize.ts`: that module coerces the wire format into numbers and
 * handles the two Postgres quirks (`numeric` as string, `'Infinity'` KDA). These decide how a number
 * *reads* — how many digits, whether a sign is shown, whether it's a percentage.
 *
 * They live here rather than in each panel because the leaderboard, the team cards and the champion
 * table must agree: "Gold/min 412" in one place and "412.00" in another looks like two different
 * numbers.
 */

/** Whole number with thousands separators. For totals and large rates. */
export const int = (v: number): string => Math.round(v).toLocaleString("en-US");

/** Fixed decimals. `dec(2)` is the default for ratios; `dec(1)` for compact K/D/A. */
export const dec = (digits: number) => (v: number): string => v.toFixed(digits);

/** A 0..1 fraction as a percentage. */
export const pct = (v: number): string => `${(v * 100).toFixed(1)}%`;

/** Same, without decimals — for tight card slots. */
export const pct0 = (v: number): string => `${(v * 100).toFixed(0)}%`;

/**
 * Explicitly signed whole number.
 *
 * Lane diffs are the reason this exists: `+412` and `-412` are opposite results, and an unsigned
 * `412` in a "Gold Diff @14" column is ambiguous in the way that matters most.
 */
export const signed = (v: number): string => `${v > 0 ? "+" : ""}${int(v)}`;

/** Signed with one decimal, for CS diffs where whole minions are too coarse. */
export const signedDec = (v: number): string => `${v > 0 ? "+" : ""}${v.toFixed(1)}`;

/**
 * Read a possibly-null numeric column off a stats row without widening the call site to `any`.
 *
 * The stats interfaces mix `number`, `number | null`, `string` and object arrays, so indexing by a
 * `keyof` yields a union. This narrows to the numeric case and maps everything else to `null`, which
 * is the same thing the UI does with a genuinely-NULL column.
 */
export const col = <T,>(key: keyof T) => (row: T): number | null => {
  const v = row[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};
