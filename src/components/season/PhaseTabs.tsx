/**
 * The season's phases as a tab strip.
 *
 * A thin typed wrapper over `UnderlineTabs`, which owns the strip's look and hides it when there is
 * only one phase: a tab strip with a single entry is noise.
 *
 * There is no `DRAFT` marker, and `phase.published` is not read. `/​:conf/season` is fetched
 * anonymously — see the header on `api/seasonView.ts` — so an unpublished phase never reaches this
 * component at all, and a chip for a state that cannot occur only advertises a capability the page
 * does not have. Previewing a draft is the structure editor's job.
 */

import { UnderlineTabs } from "../UnderlineTabs";
import type { SeasonPhase } from "../../lib/api";

interface Props {
  phases: readonly SeasonPhase[];
  selectedId: number | null;
  /** The server's own choice, marked with a dot so "current" and "what I clicked" stay distinct. */
  activeId: number | null;
  onSelect: (id: number) => void;
}

export function PhaseTabs({ phases, selectedId, activeId, onSelect }: Props) {
  return (
    <UnderlineTabs
      tabs={phases.map(phase => ({
        key: phase.id,
        label: (
          <>
            {phase.name}
            {phase.id === activeId && (
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand"
                title="The phase running now"
                aria-label="The phase running now"
              />
            )}
          </>
        ),
      }))}
      selected={selectedId ?? -1}
      onSelect={onSelect}
    />
  );
}
