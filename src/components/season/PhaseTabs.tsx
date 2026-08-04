/**
 * The season's phases as a tab strip.
 *
 * Same shape as the division strip this replaces in `StandingsView`, and hidden for the same reason
 * when there is only one: a tab strip with a single entry is noise.
 */

import type { SeasonPhase } from "../../lib/api";

interface Props {
  phases: readonly SeasonPhase[];
  selectedId: number | null;
  /** The server's own choice, marked with a dot so "current" and "what I clicked" stay distinct. */
  activeId: number | null;
  onSelect: (id: number) => void;
}

export function PhaseTabs({ phases, selectedId, activeId, onSelect }: Props) {
  if (phases.length < 2) return null;

  return (
    // Scrolls rather than wraps: phases are ordered and a season that wrapped onto a second row
    // would break the one cue the strip has. `flex-nowrap` because a long phase name would
    // otherwise shrink its neighbours instead of overflowing.
    <div className="mb-4 flex flex-nowrap gap-0 overflow-x-auto border-b-2 border-accent">
      {phases.map(phase => {
        const selected = phase.id === selectedId;

        return (
          <button
            key={phase.id}
            type="button"
            onClick={() => onSelect(phase.id)}
            aria-current={selected ? "true" : undefined}
            className={`-mb-0.5 flex shrink-0 cursor-pointer items-center gap-1.5 border-none bg-transparent px-4 py-2.5 font-heading text-[13px] uppercase tracking-wider ${
              selected
                ? "border-b-2 border-b-accent bg-bg-input text-text-bright"
                : "border-b-2 border-b-transparent text-text-muted"
            }`}
          >
            {phase.name}
            {/* An unpublished phase only reaches a caller who can edit the conference — everyone
                else never learns it exists. Marking it keeps an admin from mistaking a draft for
                something the public can see. */}
            {!phase.published && (
              <span className="font-mono text-[9px] text-ccs-orange" title="Not published — only visible to you">
                DRAFT
              </span>
            )}
            {phase.id === activeId && (
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                title="The phase running now"
                aria-label="The phase running now"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
