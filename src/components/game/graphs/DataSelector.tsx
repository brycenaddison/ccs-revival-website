/**
 * The Graphs tab's stat picker: groups of checkboxes, a group box toggling all of its stats.
 *
 * Keys rather than array indices identify a stat, so the selection survives a reorder of the table
 * below and reads back as words in the URL if it is ever put there.
 */

import { Fragment } from "react";
import type { RiotParticipant } from "../../../lib/riot/matchV5";
import { Checkbox } from "../../ui/checkbox";

export interface GraphStat {
  key: string;
  label: string;
  read: (p: RiotParticipant) => number;
}

export interface GraphStatGroup {
  label: string;
  stats: GraphStat[];
}

export const GRAPH_STATS: GraphStatGroup[] = [
  {
    label: "Damage to champions",
    stats: [
      { key: "dmgChamps", label: "Total damage to champions", read: p => p.totalDamageDealtToChampions },
      { key: "physChamps", label: "Physical damage to champions", read: p => p.physicalDamageDealtToChampions },
      { key: "magicChamps", label: "Magic damage to champions", read: p => p.magicDamageDealtToChampions },
      { key: "trueChamps", label: "True damage to champions", read: p => p.trueDamageDealtToChampions },
    ],
  },
  {
    label: "Damage dealt",
    stats: [
      { key: "dmgTotal", label: "Total damage dealt", read: p => p.totalDamageDealt },
      { key: "physTotal", label: "Physical damage dealt", read: p => p.physicalDamageDealt },
      { key: "magicTotal", label: "Magic damage dealt", read: p => p.magicDamageDealt },
      { key: "trueTotal", label: "True damage dealt", read: p => p.trueDamageDealt },
      { key: "dmgTurrets", label: "Damage to turrets", read: p => p.damageDealtToTurrets },
      { key: "dmgObjectives", label: "Damage to objectives", read: p => p.damageDealtToObjectives },
    ],
  },
  {
    label: "Damage taken and healed",
    stats: [
      { key: "healed", label: "Damage healed", read: p => p.totalHeal },
      { key: "taken", label: "Damage taken", read: p => p.totalDamageTaken },
      { key: "physTaken", label: "Physical damage taken", read: p => p.physicalDamageTaken },
      { key: "magicTaken", label: "Magic damage taken", read: p => p.magicDamageTaken },
      { key: "trueTaken", label: "True damage taken", read: p => p.trueDamageTaken },
      { key: "mitigated", label: "Self mitigated damage", read: p => p.damageSelfMitigated },
    ],
  },
  {
    label: "Income",
    stats: [
      { key: "gold", label: "Gold earned", read: p => p.goldEarned },
      { key: "goldSpent", label: "Gold spent", read: p => p.goldSpent },
      { key: "cs", label: "Minions killed", read: p => p.totalMinionsKilled },
      { key: "jungleCs", label: "Jungle minions killed", read: p => p.neutralMinionsKilled },
    ],
  },
  {
    label: "Vision",
    stats: [
      { key: "vision", label: "Vision score", read: p => p.visionScore },
      { key: "wardsPlaced", label: "Wards placed", read: p => p.wardsPlaced },
      { key: "wardsKilled", label: "Wards destroyed", read: p => p.wardsKilled },
      { key: "controlWards", label: "Control wards purchased", read: p => p.visionWardsBoughtInGame },
    ],
  },
];

export const DEFAULT_STAT_KEY = "dmgChamps";

const BY_KEY = new Map(GRAPH_STATS.flatMap(g => g.stats).map(s => [s.key, s] as const));

export function statByKey(key: string): GraphStat | undefined {
  return BY_KEY.get(key);
}

export function DataSelector({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (key: string, on: boolean) =>
    onChange(on ? [...selected.filter(k => k !== key), key] : selected.filter(k => k !== key));

  return (
    <div className="flex flex-col gap-3 text-sm">
      {GRAPH_STATS.map(group => {
        const keys = group.stats.map(s => s.key);
        const on = keys.filter(k => selected.includes(k)).length;
        const state = on === 0 ? false : on === keys.length ? true : ("indeterminate" as const);
        const groupId = `graph-group-${group.label}`;
        return (
          <Fragment key={group.label}>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={groupId} className="flex cursor-pointer items-center gap-2 font-heading text-xs text-text-bright">
                <Checkbox
                  id={groupId}
                  checked={state}
                  onCheckedChange={checked =>
                    onChange(checked ? [...selected.filter(k => !keys.includes(k)), ...keys] : selected.filter(k => !keys.includes(k)))
                  }
                />
                {group.label}
              </label>
              {group.stats.map(stat => {
                const id = `graph-stat-${stat.key}`;
                return (
                  <label key={stat.key} htmlFor={id} className="ml-6 flex cursor-pointer items-center gap-2 text-text-secondary hover:text-text">
                    <Checkbox id={id} checked={selected.includes(stat.key)} onCheckedChange={c => toggle(stat.key, c === true)} />
                    {stat.label}
                  </label>
                );
              })}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
