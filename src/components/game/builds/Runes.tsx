/**
 * A rune page as the client lays it out: the primary tree's four picks with the keystone leading,
 * the secondary tree's symbol and two picks, then the three stat shards.
 */

import type { ReactNode } from "react";
import type { RuneLookup } from "../../../lib/runeData";
import type { RiotPerks } from "../../../lib/riot/matchV5";
import { RuneIcon } from "../RiotIcons";

export function Runes({ perks, lookup }: { perks: RiotPerks | undefined; lookup: RuneLookup | null }) {
  const primary = perks?.styles?.[0];
  const secondary = perks?.styles?.[1];
  if (!primary) return <p className="text-sm text-text-muted">No runes recorded.</p>;

  const shards = [perks?.statPerks?.offense, perks?.statPerks?.flex, perks?.statPerks?.defense];

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <Group label="Primary">
        <RuneIcon id={primary.style} kind="style" size={28} lookup={lookup} className="p-0.5" />
        {primary.selections.map((s, i) => (
          <RuneIcon key={`p${i}`} id={s.perk} kind="perk" size={i === 0 ? 44 : 32} round={i !== 0} lookup={lookup} />
        ))}
      </Group>
      {secondary && (
        <Group label="Secondary">
          <RuneIcon id={secondary.style} kind="style" size={28} lookup={lookup} className="p-0.5" />
          {secondary.selections.map((s, i) => (
            <RuneIcon key={`s${i}`} id={s.perk} kind="perk" size={32} round lookup={lookup} />
          ))}
        </Group>
      )}
      <Group label="Shards">
        {shards.map((id, i) => (
          <RuneIcon key={`sh${i}`} id={id} kind="perk" size={24} round lookup={lookup} />
        ))}
      </Group>
    </div>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-heading text-[10px] text-text-muted">{label}</span>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}
