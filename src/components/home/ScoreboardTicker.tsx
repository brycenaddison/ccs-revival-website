import { Link } from "react-router-dom";
import { TeamBadge } from "../TeamBadge";
import { fmtTime } from "../../lib/utils";
import type { Match } from "../../hooks/useLeagueData";

interface Props {
  matches: Match[];
  isMobile: boolean;
}

export function ScoreboardTicker({ matches, isMobile }: Props) {
  if (!matches.length) return null;
  return (
    <div className="bg-bg border-b border-border3 overflow-hidden">
      <div className="flex overflow-x-auto px-2" style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>
        {matches.map((m, i) => {
          const b = m.team_blue || {} as any;
          const r = m.team_red || {} as any;
          const isLive = m.status === "live";
          const isFinal = m.status === "completed";
          const cardClass = `flex flex-col shrink-0 cursor-pointer ${isLive ? "border-l-[3px] border-l-ccs-red bg-ccs-red/5" : ""} ${i < matches.length - 1 ? "border-r border-border" : ""} ${isFinal ? "hover:bg-bg3/30 transition-colors" : ""}`;
          const cardStyle = { minWidth: isMobile ? 150 : 180, padding: isMobile ? "8px 12px" : "10px 16px" };
          const cardContent = (
            <>
              {isLive ? (
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-ccs-red shadow-[0_0_10px_var(--red),0_0_20px_var(--red)]" style={{ animation: "pulse 1.5s infinite" }} />
                  <span className="text-[11px] text-ccs-red font-bold tracking-widest font-display" style={{ textShadow: "0 0 8px var(--red)" }}>LIVE</span>
                </div>
              ) : (
                <span className="text-[10px] text-text-muted font-semibold mb-1 tracking-wide font-display">
                  {isFinal ? "FINAL" : fmtTime(m.scheduled_at)}
                </span>
              )}
              {[
                { t: b, score: m.score_blue, win: isFinal && m.winner_team_id === b.id },
                { t: r, score: m.score_red, win: isFinal && m.winner_team_id === r.id },
              ].map((row, ri) => (
                <div key={ri} className={`flex justify-between items-center gap-1.5 ${ri ? "mt-0.5" : ""}`}>
                  <div className="flex items-center gap-1.5 flex-1">
                    <TeamBadge team={row.t} size={isMobile ? 18 : 20} />
                    <span className="text-text font-bold font-heading" style={{ fontSize: isMobile ? 11 : 12 }}>
                      {row.t.abbreviation || "TBD"}
                    </span>
                  </div>
                  <span
                    className={`font-display tracking-wider font-extrabold ${row.win || isLive ? "text-text-bright" : "text-text-muted"}`}
                    style={{ fontSize: isMobile ? 14 : 16 }}
                  >
                    {row.score}
                  </span>
                </div>
              ))}
            </>
          );

          return isFinal ? (
            <Link key={m.id} to={`/match/${m.id}`} className={cardClass + " no-underline"} style={cardStyle}>
              {cardContent}
            </Link>
          ) : (
            <div key={m.id} className={cardClass} style={cardStyle}>
              {cardContent}
            </div>
          );
        })}
      </div>
    </div>
  );
}
