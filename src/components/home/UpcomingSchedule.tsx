import { TeamBadge } from "../TeamBadge";
import { fmtTime } from "../../lib/utils";
import type { Match } from "../../hooks/useLeagueData";

interface Props {
  matches: Match[];
  isMobile: boolean;
}

export function UpcomingSchedule({ matches, isMobile }: Props) {
  const upcoming = matches.filter(m => m.status === "scheduled").slice(0, 4);
  if (!upcoming.length) return null;

  return (
    <div className="bg-bg2 rounded-md border border-border overflow-hidden">
      <div className="px-4 py-3.5 border-b border-border">
        <span className="font-display text-[15px] text-text-bright tracking-widest">UPCOMING</span>
      </div>
      {upcoming.map((m, i) => {
        const b = m.team_blue || {} as any;
        const r = m.team_red || {} as any;
        return (
          <div key={m.id} className={`px-4 py-3.5 ${i < upcoming.length - 1 ? "border-b border-bg3" : ""}`}>
            <div className="text-[10px] text-text-muted mb-1.5 font-heading tracking-wide">{fmtTime(m.scheduled_at)}</div>
            <div className="flex items-center justify-center" style={{ gap: isMobile ? 10 : 16 }}>
              <div className="flex items-center gap-1.5 flex-1 justify-end">
                <span className="font-heading text-text font-medium" style={{ fontSize: isMobile ? 12 : 13 }}>
                  {isMobile ? b.abbreviation : b.name}
                </span>
                <TeamBadge team={b} />
              </div>
              <span className="font-display text-[13px] text-text-dim tracking-widest px-2 py-0.5 bg-bg-input rounded">VS</span>
              <div className="flex items-center gap-1.5 flex-1">
                <TeamBadge team={r} />
                <span className="font-heading text-text font-medium" style={{ fontSize: isMobile ? 12 : 13 }}>
                  {isMobile ? r.abbreviation : r.name}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
