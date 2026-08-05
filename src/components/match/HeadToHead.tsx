/**
 * Two teams' numbers with the label between them.
 *
 * The layout a preview and a series summary both want, because comparison is the whole question on
 * either — two separate stat lists make a reader hold one column in their head while they scan the
 * other. The label sits in the middle so the two value columns can be right- and left-aligned against
 * it, which is what makes a row readable at a glance.
 *
 * Emphasis marks the better value rather than the winner: on a preview nobody has won anything yet, and
 * on a finished series the scoreline above already says who did.
 */

import { fmtPct, fmtRatio } from "../../lib/api";

export interface ComparisonRow {
  label: string;
  a: string;
  b: string;
  /** Which value to emphasise. `null` for a tie, an incomparable pair, or a row with no direction. */
  better: "a" | "b" | null;
}

/** Whether more is better for a metric. Deaths and gold conceded are the cases that aren't. */
type Direction = "high" | "low";

/**
 * One row, formatted and compared in one place.
 *
 * `null` is "no data" and never loses a comparison: a team with no games yet would otherwise appear to
 * be beaten on every metric, when in fact nothing has been measured. Two nulls, or a genuine tie, are
 * emphasised on neither side.
 */
export function compare(
  label: string,
  a: number | null | undefined,
  b: number | null | undefined,
  format: (v: number) => string,
  direction: Direction = "high",
): ComparisonRow {
  const av = a ?? null;
  const bv = b ?? null;

  const better =
    av === null || bv === null || av === bv
      ? null
      : direction === "high"
        ? av > bv
          ? "a"
          : "b"
        : av < bv
          ? "a"
          : "b";

  return {
    label,
    a: av === null ? "—" : format(av),
    b: bv === null ? "—" : format(bv),
    better,
  };
}

/** A row whose values are already strings — a record, a duration — and so carries its own comparison. */
export function compareText(
  label: string,
  a: string,
  b: string,
  better: "a" | "b" | null = null,
): ComparisonRow {
  return { label, a, b, better };
}

// ------------------------------------------------------------------ formatters

/** Rounded to whole units, thousands separated. For gold, damage and other large counts. */
export const asInt = (v: number): string => Math.round(v).toLocaleString();

/** Thousands, one decimal: `12.4k`. For gold and damage, where the last three digits are noise. */
export const asK = (v: number): string => `${(v / 1000).toFixed(1)}k`;

/** Two decimals, or `∞` for a ratio with a zero denominator. */
export const asRatio = (v: number): string => fmtRatio(v, 2);

export const asOne = (v: number): string => fmtRatio(v, 1);

/** A 0–1 fraction as a whole percentage. */
export const asPct = (v: number): string => fmtPct(v);

// ------------------------------------------------------------------ the table

export function HeadToHead({ rows }: { rows: readonly ComparisonRow[] }) {
  return (
    <table className="w-full border-collapse">
      <tbody>
        {rows.map(row => (
          <tr key={row.label} className="border-b border-border/50 last:border-b-0">
            <td
              className={`w-[30%] py-1.5 pr-3 text-right font-mono text-[13px] ${
                row.better === "a" ? "font-bold text-text-bright" : "text-text-muted"
              }`}
            >
              {row.a}
            </td>
            <td className="whitespace-nowrap px-2 py-1.5 text-center font-heading text-[10px] uppercase tracking-wider text-text-dim">
              {row.label}
            </td>
            <td
              className={`w-[30%] py-1.5 pl-3 text-left font-mono text-[13px] ${
                row.better === "b" ? "font-bold text-text-bright" : "text-text-muted"
              }`}
            >
              {row.b}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
