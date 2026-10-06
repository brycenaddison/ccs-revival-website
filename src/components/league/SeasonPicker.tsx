import { useId } from "react";
import { CURRENT } from "../../lib/leagueContext";
import type { Tournament } from "../../lib/api";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

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
  const id = useId();
  if (tournaments.length === 0) return null;

  const soleActive =
    activeConfs.length === 1 ? tournaments.find(t => t.conf === activeConfs[0]) : undefined;

  // When one conf is running, the `CURRENT` entry *is* that season, so it carries the season's own
  // full name and the season is not listed again below. Offering both put the same league in the
  // list twice, and picking the lower copy showed it as a PAST SEASON.
  //
  // With several divisions running they deliberately share a name, so `CURRENT` stays generic and
  // each division is still listed: "all of the current season" and "this one division" are
  // different selections rather than duplicates. Its label invites narrowing to one league,
  // because readers otherwise take the control for a static caption.
  const listed = soleActive ? tournaments.filter(t => t.conf !== soleActive.conf) : tournaments;

  const options = (
    <>
      {activeConfs.length > 0 && (
        <NativeSelectOption value={CURRENT}>{soleActive ? soleActive.name : "Filter by league…"}</NativeSelectOption>
      )}
      {listed.map(t => (
        <NativeSelectOption key={t.conf} value={t.conf}>
          {t.name}
        </NativeSelectOption>
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
      // Chromeless and at the nav's own type size, so it reads as part of the strip, not a form field.
      <NativeSelect
        value={selection}
        onChange={e => onChange(e.target.value)}
        aria-label={label}
        containerClassName="max-w-[15rem]"
        className="h-auto truncate border-none bg-transparent py-0 pl-0 pr-7 font-heading text-[length:inherit] text-text-secondary hover:text-text-bright md:text-[length:inherit]"
      >
        {options}
      </NativeSelect>
    );
  }

  return (
    <div className="flex items-center gap-3 mb-5">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <NativeSelect
        id={id}
        value={selection}
        onChange={e => onChange(e.target.value)}
        containerClassName="w-auto min-w-[280px]"
      >
        {options}
      </NativeSelect>
    </div>
  );
}
