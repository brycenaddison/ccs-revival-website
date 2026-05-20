import { TeamBadge } from "../TeamBadge";
import { fmtTime } from "../../lib/utils";
import type { Match } from "../../hooks/useLeagueData";

interface Props {
  matches: Match[];
  isMobile: boolean;
}

export function ScheduleView({ matches, isMobile }: Props) {
  const upcoming = matches.filter(m => m.status === "scheduled");
  if (!upcoming.length) return <div className="py-10 text-center text-text-dim text-[13px]">No upcoming matches scheduled.</div>;

  return (
    <div className="max-w-[800px] mx-auto">
      <h2 className="font-display text-[22px] text-text-bright tracking-widest mb-4">SCHEDULE</h2>
      <div className="flex flex-col gap-2">
        {upcoming.map(m => {
          const b = m.team_blue || {} as any;
          const r = m.team_red || {} as any;
          return (
            <div key={m.id} className={`bg-bg2 border border-border rounded-md ${isMobile ? "px-3 py-3.5" : "px-5 py-4"}`}>
              <div className="text-[10px] text-accent mb-2.5 font-heading tracking-wide font-semibold">{fmtTime(m.scheduled_at)}</div>
              <div className={`flex items-center justify-center ${isMobile ? "gap-3" : "gap-6"}`}>
                <div className="flex items-center gap-2.5 flex-1 justify-end">
                  <span className={`font-heading text-text font-medium ${isMobile ? "text-sm" : "text-base"}`}>{isMobile ? b.abbreviation : b.name}</span>
                  <TeamBadge team={b} size={isMobile ? 28 : 36} />
                </div>
                <span className="font-display text-sm text-text-dim tracking-widest px-3 py-1 bg-bg-input rounded">VS</span>
                <div className="flex items-center gap-2.5 flex-1">
                  <TeamBadge team={r} size={isMobile ? 28 : 36} />
                  <span className={`font-heading text-text font-medium ${isMobile ? "text-sm" : "text-base"}`}>{isMobile ? r.abbreviation : r.name}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
