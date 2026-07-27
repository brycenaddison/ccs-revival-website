import { useEffect, useMemo, useState } from "react";
import { groupLabels } from "../../lib/leagueAdapters";
import { useLeague } from "../../lib/leagueContext";
import { TeamStatsTable } from "./TeamStatsTable";
import { PlayerStatsTable } from "./PlayerStatsTable";
import { ChampionStatsTable } from "./ChampionStatsTable";

const SUB_TABS = ["Teams", "Players", "Champions"] as const;
type SubTab = (typeof SUB_TABS)[number];

interface Props {
  /**
   * Confs to show, from the season picker. More than one when several divisions run at
   * once, in which case a selector appears — stats are per-conf and don't merge.
   */
  confs: readonly string[];
}

export function StatsSection({ confs }: Props) {
  const { tournaments } = useLeague();
  const [confIndex, setConfIndex] = useState(0);
  const [tab, setTab] = useState<SubTab>("Teams");

  const confKey = confs.join(",");
  useEffect(() => setConfIndex(0), [confKey]);

  const labels = useMemo(() => groupLabels(tournaments, confs), [tournaments, confs]);
  const conf = confs[Math.min(confIndex, Math.max(confs.length - 1, 0))];

  if (!conf) return <div className="text-center py-10 text-text-dim">No season selected.</div>;

  return (
    <div className="max-w-[1200px] mx-auto">
      <h2 className="font-display text-[22px] text-text-bright tracking-widest mb-4">STATS</h2>

      {confs.length > 1 && (
        <div className="flex gap-1 mb-4 flex-wrap">
          {confs.map((c, i) => (
            <button
              key={c}
              onClick={() => setConfIndex(i)}
              className={`py-1.5 px-3 text-[11px] font-heading uppercase tracking-wider rounded border ${
                i === confIndex ? "bg-accent text-white border-accent" : "bg-bg2 text-text-secondary border-border"
              }`}
            >
              {labels.get(c) ?? c}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-1 border-b border-border mb-5">
        {SUB_TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`py-2.5 px-4 font-heading text-xs tracking-wider uppercase border-b-2 ${
              tab === t ? "text-text-bright border-accent font-bold" : "text-text-secondary border-transparent"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Teams" && <TeamStatsTable conf={conf} />}
      {tab === "Players" && <PlayerStatsTable conf={conf} />}
      {tab === "Champions" && <ChampionStatsTable conf={conf} />}
    </div>
  );
}
