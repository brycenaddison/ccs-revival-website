/** Point amounts are decimal strings of hundredths. Keep arithmetic in BigInt. */
export const MAX_PAID_STAKE_MINOR = 1_000_000_000_000n;

/**
 * Suggested amounts, in whole points, offered beside the points input. A preset only fills the
 * input; any amount can be typed. "Max" is offered separately and fills the available balance.
 */
export const PREDICTION_QUICK_AMOUNTS = [50, 100, 250] as const;

const isMinor = (value: string | null | undefined): value is string =>
  value !== null && value !== undefined && /^-?\d+$/.test(value);

export function pointsText(minor: string | null | undefined): string {
  if (!isMinor(minor)) return "N/A";
  const value = BigInt(minor);
  const negative = value < 0n;
  const positive = negative ? -value : value;
  const whole = (positive / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = (positive % 100n).toString().padStart(2, "0");
  return `${negative ? "−" : ""}${whole}${fraction === "00" ? "" : `.${fraction}`}`;
}

/** Gains read with a plus sign, so a change column is scannable by sign as well as color. */
export function signedPointsText(minor: string | null | undefined): string {
  return isMinor(minor) && BigInt(minor) > 0n ? `+${pointsText(minor)}` : pointsText(minor);
}

/** Tone for a signed amount: green for gains, red for losses, neutral at zero or unknown. */
export function signedPointsTone(minor: string | null | undefined): string {
  if (!isMinor(minor)) return "text-text-secondary";
  const value = BigInt(minor);
  return value > 0n ? "text-ccs-green" : value < 0n ? "text-ccs-red" : "text-text-secondary";
}

export function isPositivePoints(minor: string | null | undefined): boolean {
  return isMinor(minor) && BigInt(minor) > 0n;
}

/** The input's text for an amount, without grouping, so it round-trips through `pointInputToMinor`. */
export function minorToPointInput(minor: string): string {
  const value = BigInt(minor);
  const fraction = (value % 100n).toString().padStart(2, "0");
  return fraction === "00" ? (value / 100n).toString() : `${value / 100n}.${fraction}`;
}

export function pointInputToMinor(input: string): string | null {
  const value = input.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0") || "0");
  return minor > 0n && minor <= MAX_PAID_STAKE_MINOR ? minor.toString() : null;
}

export function exceedsPoints(value: string, available: string | null): boolean {
  return isMinor(available) && BigInt(value) > BigInt(available);
}

/**
 * One outcome's share of the pool as a whole percent, for the pool bar and its label only. Never an
 * input to a payout: returns are computed upstream. Null for an empty pool, where there is no share.
 */
export function poolSharePercent(pool: string, total: string): number | null {
  if (!isMinor(pool) || !isMinor(total) || BigInt(total) <= 0n) return null;
  return Number((BigInt(pool) * 1000n) / BigInt(total)) / 10;
}
