/**
 * A player's shop visits, one group per minute, sold items crossed out and repeats counted.
 */

import { X } from "lucide-react";
import type { GameAssetLookup } from "../../../lib/gameAssets";
import type { ItemBuild } from "../../../lib/game/timelineStats";
import { ItemIcon } from "../RiotIcons";

export function BuildPath({ build, lookup }: { build: ItemBuild; lookup: GameAssetLookup | null }) {
  if (build.length === 0) {
    return <p className="text-sm text-text-muted">No purchases recorded.</p>;
  }

  return (
    <ol className="flex flex-wrap gap-3">
      {build.map(({ minute, items }) => (
        <li key={minute} className="flex flex-col items-center gap-1">
          <div className="flex flex-wrap gap-1.5 rounded-md bg-bg3 p-1.5">
            {items.map(({ id, sold, quantity }, index) => (
              <span key={`${id}-${sold}-${index}`} className="relative inline-flex">
                <ItemIcon itemId={id} size={36} lookup={lookup} className={sold ? "opacity-50 grayscale" : undefined} />
                {sold && (
                  <span
                    className="pointer-events-none absolute inset-0 flex items-center justify-center text-ccs-red"
                    aria-label="Sold"
                  >
                    <X className="size-6" strokeWidth={3} />
                  </span>
                )}
                {!sold && quantity > 1 && (
                  <span className="pointer-events-none absolute bottom-0 right-0 rounded-tl rounded-br bg-bg/85 px-1 font-mono text-[10px] font-bold text-text-bright">
                    {quantity}
                  </span>
                )}
              </span>
            ))}
          </div>
          <span className="font-mono text-[11px] text-text-muted">{minute} min</span>
        </li>
      ))}
    </ol>
  );
}
