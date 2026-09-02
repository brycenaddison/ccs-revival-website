/**
 * The arrows above a switchable scoreboard column.
 *
 * The client's post-game screen rotates its last two columns through three stats each, and that is
 * what this is: two buttons and the glyph of the current stat, sized to the column below it so the
 * glyph sits over the numbers it names. State lives in `Scoreboard`; the original kept it in a global
 * store keyed by a string, which two `useState`s replace.
 */

import type { Density } from "./density";
import { ScoreboardIcon, type ScoreboardIconType } from "./ScoreboardIcon";

export interface SwitcherOption<T extends string> {
  value: T;
  label: string;
  icon: ScoreboardIconType;
}

export type DamageStat = "damage" | "damageTaken" | "cc";
export type FarmStat = "gold" | "cs" | "vision";

/** The two rotations, in the client's order. Declared here so the rows and the header share one list. */
export const DAMAGE_OPTIONS: readonly SwitcherOption<DamageStat>[] = [
  { value: "damage", label: "Damage to champions", icon: "sword" },
  { value: "damageTaken", label: "Damage taken", icon: "shield" },
  { value: "cc", label: "Crowd control score", icon: "cc" },
];

export const FARM_OPTIONS: readonly SwitcherOption<FarmStat>[] = [
  { value: "gold", label: "Gold earned", icon: "gold" },
  { value: "cs", label: "Minions killed", icon: "minions" },
  { value: "vision", label: "Vision", icon: "eye" },
];

export function StatSwitcher<T extends string>({
  value,
  options,
  onChange,
  density,
}: {
  value: T;
  options: readonly SwitcherOption<T>[];
  onChange: (next: T) => void;
  density: Density;
}) {
  const index = Math.max(0, options.findIndex(o => o.value === value));
  const current = options[index];
  const step = (delta: number) => onChange(options[(index + delta + options.length) % options.length].value);

  const arrow =
    "flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded text-text-muted transition-colors hover:text-text-bright";

  return (
    <div className={"flex w-full min-w-0 items-center justify-between text-text-secondary"}>
      <button type="button" className={arrow} onClick={() => step(-1)} aria-label={`Previous stat (now ${current.label})`}>
        <ScoreboardIcon type="arrow-left" className="h-4 w-4" />
      </button>
      <ScoreboardIcon type={current.icon} className="h-[18px] w-[18px] text-text-bright" title={current.label} />
      <button type="button" className={arrow} onClick={() => step(1)} aria-label={`Next stat (now ${current.label})`}>
        <ScoreboardIcon type="arrow-right" className="h-4 w-4" />
      </button>
    </div>
  );
}
