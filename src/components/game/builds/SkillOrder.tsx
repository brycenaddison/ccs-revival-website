/**
 * The skill-max grid: one row per ability, one column per level, the level number in the cell
 * where that point was spent. Scrolls sideways at eighteen columns on a phone.
 */

import { cn } from "../../../lib/cn";
import { ABILITY_KEYS, type AbilityInfo } from "../../../lib/championAbilities";
import { AbilityIcon } from "../RiotIcons";

export function SkillOrder({ order, abilities }: { order: number[]; abilities: AbilityInfo[] | null }) {
  if (order.length === 0) return <p className="text-sm text-text-muted">No skill points recorded.</p>;

  return (
    <div className="overflow-x-auto">
      <div className="flex w-max flex-col gap-1">
        {ABILITY_KEYS.map((key, i) => {
          const slot = i + 1;
          return (
            <div key={key} className="flex items-center gap-1">
              <AbilityIcon ability={abilities?.[i] ?? null} fallbackKey={key} size={32} className="mr-2" />
              {order.map((spent, level) => (
                <span
                  key={level}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded border font-mono text-[11px]",
                    spent === slot ? "border-brand/50 bg-brand/15 text-text-bright" : "border-border/60 text-transparent",
                  )}
                  aria-label={spent === slot ? `${key} at level ${level + 1}` : undefined}
                >
                  {spent === slot ? level + 1 : ""}
                </span>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
