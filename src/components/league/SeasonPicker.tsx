import { CURRENT } from "../../lib/leagueContext";
import type { Tournament } from "../../lib/api";

interface Props {
  tournaments: Tournament[];
  /** Either `CURRENT` or a specific conf id. */
  selection: string;
  onChange: (value: string) => void;
  activeConfs: readonly string[];
  /** Inline styling for the season bar, rather than a labelled form control. */
  compact?: boolean;
  label?: string;
}

/**
 * Season selector. Every page renders whichever season is chosen here, so past seasons are
 * browsed through the same views as the current one.
 */
export function SeasonPicker({ tournaments, selection, onChange, activeConfs, compact = false, label = "Season" }: Props) {
  if (tournaments.length === 0) return null;

  // With one active conf, `shortname` is exactly the right label — that's what it's for.
  // With several, they deliberately share it, so naming them individually would just repeat.
  const soleActive =
    activeConfs.length === 1 ? tournaments.find(t => t.conf === activeConfs[0]) : undefined;
  const currentLabel = soleActive?.shortname ?? soleActive?.name ?? "";

  const options = (
    <>
      {activeConfs.length > 0 && (
        <option value={CURRENT}>Current season{currentLabel ? ` — ${currentLabel}` : ""}</option>
      )}
      {tournaments.map(t => (
        <option key={t.conf} value={t.conf}>
          {t.name}
        </option>
      ))}
    </>
  );

  if (compact) {
    return (
      <select
        value={selection}
        onChange={e => onChange(e.target.value)}
        aria-label={label}
        className="bg-transparent border-none text-text-muted font-heading tracking-wider cursor-pointer outline-none hover:text-text"
        style={{ fontSize: "inherit" }}
      >
        {options}
      </select>
    );
  }

  return (
    <div className="flex items-center gap-3 mb-5">
      <label className="font-heading text-xs text-text-secondary tracking-wider uppercase">{label}</label>
      <select
        value={selection}
        onChange={e => onChange(e.target.value)}
        className="bg-bg2 border border-border rounded-md text-text font-body text-sm py-2 px-3 min-w-[280px] focus:outline-none focus:border-accent"
      >
        {options}
      </select>
    </div>
  );
}
