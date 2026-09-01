/**
 * The season's phases as a tab strip.
 *
 * Same shape as the division strip this replaces in `StandingsView`, and hidden for the same reason
 * when there is only one: a tab strip with a single entry is noise.
 *
 * There is no `DRAFT` marker, and `phase.published` is not read. `/​:conf/season` is fetched
 * anonymously — see the header on `api/seasonView.ts` — so an unpublished phase never reaches this
 * component at all, and a chip for a state that cannot occur only advertises a capability the page
 * does not have. Previewing a draft is the structure editor's job.
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
    /*
     * Scrolls sideways rather than wrapping: phases are ordered and a season that wrapped onto a
     * second row would break the one cue the strip has. `flex-nowrap` because a long phase name
     * would otherwise shrink its neighbours instead of overflowing.
     *
     * `overflow-y-hidden` is load-bearing. Setting `overflow-x` to anything but `visible` makes
     * `overflow-y` compute to `auto`, so this strip is a *vertical* scroll container too — and it
     * only takes a couple of pixels of overflow to put a scrollbar on a single row of tabs. The
     * tabs used to sit on a `-mb-0.5` that hung them exactly that far past the content box.
     */
    <div className="mb-4 flex flex-nowrap gap-0 overflow-x-auto overflow-y-hidden border-b-2 border-brand">
      {phases.map(phase => {
        const selected = phase.id === selectedId;

        return (
          <button
            key={phase.id}
            type="button"
            onClick={() => onSelect(phase.id)}
            aria-current={selected ? "true" : undefined}
            className={`flex shrink-0 cursor-pointer items-center gap-1.5 border-none bg-transparent px-4 py-2.5 font-heading text-[13px] uppercase tracking-wider ${
              selected
                ? "border-b-2 border-b-brand bg-bg-input text-text-bright"
                : "border-b-2 border-b-transparent text-text-muted"
            }`}
          >
            {phase.name}
            {phase.id === activeId && (
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand"
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
