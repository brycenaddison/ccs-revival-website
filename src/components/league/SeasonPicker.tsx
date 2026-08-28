import { CURRENT } from "../../lib/leagueContext";
import type { Tournament } from "../../lib/api";

interface Props {
  tournaments: Tournament[];
  /** Either `CURRENT` or a specific conf id. */
  selection: string;
  onChange: (value: string) => void;
  activeConfs: readonly string[];
  /** Inline styling for the nav bar, rather than a labeled form control. */
  compact?: boolean;
  label?: string;
}

/**
 * Season selector. Every page renders whichever season is chosen here, so past seasons are
 * browsed through the same views as the current one.
 */
export function SeasonPicker({ tournaments, selection, onChange, activeConfs, compact = false, label = "Season" }: Props) {
  if (tournaments.length === 0) return null;

  const soleActive =
    activeConfs.length === 1 ? tournaments.find(t => t.conf === activeConfs[0]) : undefined;

  // When one conf is running, the `CURRENT` entry *is* that season, so it carries the season's own
  // full name and the season is not listed again below. Offering both put the same league in the
  // list twice, and picking the lower copy showed it as a PAST SEASON.
  //
  // With several divisions running they deliberately share a name, so `CURRENT` stays generic and
  // each division is still listed: "all of the current season" and "this one division" are
  // different selections rather than duplicates.
  const listed = soleActive ? tournaments.filter(t => t.conf !== soleActive.conf) : tournaments;

  const options = (
    <>
      {activeConfs.length > 0 && (
        <option value={CURRENT}>{soleActive ? soleActive.name : "Current season"}</option>
      )}
      {listed.map(t => (
        <option key={t.conf} value={t.conf}>
          {t.name}
        </option>
      ))}
    </>
  );

  if (compact) {
    return (
      // A native select sizes itself to its *widest option*, and the oldest seasons carry names like
      // "CCS 2022 Fall Diamond Division". Unbounded, one of those would push the nav's tab strip into
      // scrolling at every viewport width, so the control is capped and long names clip. The common
      // case ("CCS 2026 Summer") fits well inside the cap.
      <select
        value={selection}
        onChange={e => onChange(e.target.value)}
        aria-label={label}
        title={label}
        className="season-select bg-transparent border-none text-text-secondary font-heading tracking-wider cursor-pointer outline-none hover:text-text-bright max-w-[12rem] lg:max-w-[15rem]"
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
        className="season-select bg-bg2 border border-border rounded-md text-text font-body text-sm py-2 px-3 min-w-[280px] focus:outline-none focus:border-accent"
      >
        {options}
      </select>
    </div>
  );
}
