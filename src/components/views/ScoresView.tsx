import { Link } from "react-router-dom";
import { TeamBadge } from "../TeamBadge";
import type { Match } from "../../hooks/useLeagueData";

interface Props {
  matches: Match[];
  isMobile: boolean;
}

export function ScoresView({ matches, isMobile }: Props) {
  const completed = matches.filter(m => m.status === "completed");
  if (!completed.length) return <div className="py-10 text-center text-text-dim text-[13px]">No completed matches yet.</div>;

  return (
    <div className="max-w-[800px] mx-auto">
      <h2 className="font-display text-[22px] text-text-bright tracking-widest mb-4">SCORES</h2>
      <div className="flex flex-col gap-2">
        {completed.map(m => {
          const b = m.team_blue || {} as any;
          const r = m.team_red || {} as any;
          const bWin = m.winner_team_id === b.id;
          const rWin = m.winner_team_id === r.id;
          return (
            <Link key={m.id} to={`/match/${m.id}`} className={`block bg-bg2 border border-border rounded-md cursor-pointer hover:border-border2 transition-colors ${isMobile ? "px-3 py-3.5" : "px-5 py-4"}`}>
              <div className="text-[10px] text-text-muted mb-2.5 font-heading tracking-wide">
                FINAL{m.completed_at ? ` · ${new Date(m.completed_at).toLocaleDateString([], { month: "short", day: "numeric" })}` : ""}
              </div>
              <div className={`flex items-center justify-center ${isMobile ? "gap-3" : "gap-6"}`}>
                <div className="flex items-center gap-2.5 flex-1 justify-end">
                  <span className={`font-heading font-medium ${bWin ? "text-text-bright font-bold" : "text-text-muted"} ${isMobile ? "text-sm" : "text-base"}`}>
                    {isMobile ? b.abbreviation : b.name}
                  </span>
                  <TeamBadge team={b} size={isMobile ? 28 : 36} />
                </div>
                <div className="flex items-center gap-2 min-w-[60px] justify-center">
                  <span className={`font-display ${bWin ? "text-text-bright" : "text-text-muted"} ${isMobile ? "text-[22px]" : "text-[28px]"}`}>
                    {m.score_blue ?? 0}
                  </span>
                  <span className="font-display text-sm text-text-subtle">-</span>
                  <span className={`font-display ${rWin ? "text-text-bright" : "text-text-muted"} ${isMobile ? "text-[22px]" : "text-[28px]"}`}>
                    {m.score_red ?? 0}
                  </span>
                </div>
                <div className="flex items-center gap-2.5 flex-1">
                  <TeamBadge team={r} size={isMobile ? 28 : 36} />
                  <span className={`font-heading font-medium ${rWin ? "text-text-bright font-bold" : "text-text-muted"} ${isMobile ? "text-sm" : "text-base"}`}>
                    {isMobile ? r.abbreviation : r.name}
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
