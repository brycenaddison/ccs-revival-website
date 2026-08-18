/** Where the player has played, in served order — most games first. */

import { fmtPct, roleLabel, type ProfileRoleBreakdown } from "../../lib/api";
import { int } from "../../lib/statFormat";
import { kdaText, metricText, RailCard, winRateTone } from "./profileUi";

export function RoleSplitCard({ roles }: { roles: readonly ProfileRoleBreakdown[] }) {
  return (
    <RailCard title="ROLES">
      {roles.length === 0 ? (
        <p className="px-3 py-4 text-xs text-text-dim">No recorded games.</p>
      ) : (
        <ul className="divide-y divide-border">
          {roles.map(row => (
            <li key={row.role} className="flex items-baseline justify-between gap-3 px-3 py-2.5">
              <span className="font-heading text-sm uppercase tracking-wider text-text-bright">
                {roleLabel(row.role)}
              </span>
              <span className="flex items-baseline gap-3 font-mono text-[11px] text-text-secondary">
                <span>{int(row.games)}G</span>
                <span>{row.wins}–{row.losses}</span>
                <span className={winRateTone(row.winPercent)}>{metricText(row.winPercent, fmtPct)}</span>
                <span>{kdaText(row.kda)} KDA</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </RailCard>
  );
}
