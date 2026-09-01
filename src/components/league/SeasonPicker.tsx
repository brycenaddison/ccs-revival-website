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
      // scrolling at every viewport width, so the control is capped and long names clip. The cap is
      // the width a full season name needs, at every size above a phone: the two-row nav has a whole
      // row for the brand and this control, so there is no width to save there, and on a phone the
      // wrapper shrinks it regardless.
      //
      // `w-full` as well, so the control follows its wrapper *down*: a select's intrinsic width is
      // its widest option regardless of the room around it, and on a phone that width was painted
      // straight over the hamburger. The wrapper in `NavBar` is the flex item that gives up space,
      // and this makes the control shrink with it — the browser clips the name rather than the layout.
      <select
        value={selection}
        onChange={e => onChange(e.target.value)}
        aria-label={label}
        title={label}
        className="season-select w-full max-w-[15rem] bg-transparent border-none text-text-secondary font-heading tracking-wider cursor-pointer outline-none hover:text-text-bright"
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
        className="season-select bg-bg2 border border-border rounded-md text-text font-body text-sm py-2 px-3 min-w-[280px] focus:outline-none focus:border-brand"
      >
        {options}
      </select>
    </div>
  );
}
