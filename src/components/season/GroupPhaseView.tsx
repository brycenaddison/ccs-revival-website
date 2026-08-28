/**
 * A group phase: one table per group, then the phase's legend of every outcome.
 *
 * The legend belongs to the *phase*, not to a group — the scenario library is defined once and every
 * group in the phase is scored against it — so it is drawn once below all the tables rather than
 * repeated under each.
 */

import { useMemo } from "react";
import { GroupTable } from "./GroupTable";
import { ScenarioPill } from "./ScenarioPill";
import type { SeasonGroupPhase } from "../../lib/api";

interface Props {
  phase: SeasonGroupPhase;
  conf: string;
  isMobile: boolean;
}

export function GroupPhaseView({ phase, conf, isMobile }: Props) {
  const legend = useMemo(
    () =>
      Object.values(phase.scenarios).sort(
        // By level, then title. Two scenarios may legally share a level — the level is a color, not
        // a key — and without the second term their order would be whatever key order the JSON
        // happened to arrive in, which is nobody's decision.
        (a, b) => a.level - b.level || a.title.localeCompare(b.title),
      ),
    [phase.scenarios],
  );

  if (phase.groups.length === 0) {
    return <div className="py-10 text-center text-[13px] text-text-dim">Groups haven&rsquo;t been drawn yet.</div>;
  }

  return (
    <>
      {phase.groups.map(group => (
        <GroupTable
          key={`${group.ordinal}-${group.name}`}
          group={group}
          conf={conf}
          showName={phase.groups.length > 1}
          isMobile={isMobile}
        />
      ))}

      {legend.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-md border border-border bg-bg2">
          <div className="border-b border-border px-4 py-3">
            <span className="font-display text-[14px] tracking-widest text-text-bright">
              {phase.name.toUpperCase()} — OUTCOMES
            </span>
          </div>
          <div className="flex flex-col gap-2 p-4">
            {legend.map(scenario => (
              <div key={`${scenario.level}-${scenario.title}`} className="flex items-center gap-3">
                <ScenarioPill scenario={scenario} />
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
