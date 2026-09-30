/**
 * The viewer's point history, newest first, as served.
 *
 * The Match column uses each entry's compact event: both crests and names, linked as one to the
 * prediction (so the team names inside are not links of their own). Hidden and eventless entries
 * leave it empty. A stake entry names its team when the ledger recorded one.
 */

import { Link } from "react-router-dom";
import { MatchupLabel } from "./MatchupLabel";
import { predictionPath } from "./PredictionCard";
import { LEDGER_KIND_LABEL } from "./predictionLabels";
import type { PredictionHistoryEntry } from "../../lib/api";
import { pointsText, signedPointsText, signedPointsTone } from "../../lib/predictionPoints";
import { fmtKickoff } from "../../lib/utils";

const HEAD = "px-3 py-2 text-left font-heading text-[10px] font-medium text-text-muted";

export function LedgerTable({ entries }: { entries: readonly PredictionHistoryEntry[] }) {
  return (
    <div className="min-w-0 overflow-x-auto rounded-lg border border-border bg-bg2">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr>
            <th scope="col" className={HEAD}>Date</th>
            <th scope="col" className={HEAD}>Activity</th>
            <th scope="col" className={HEAD}>Match</th>
            <th scope="col" className={`${HEAD} text-right`}>Amount</th>
            <th scope="col" className={`${HEAD} text-right`}>Balance</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(entry => (
            <tr key={entry.id} className="border-t border-border">
              <td className="whitespace-nowrap px-3 py-2 text-text-secondary">
                {entry.createdAt && <time dateTime={entry.createdAt}>{fmtKickoff(entry.createdAt)}</time>}
              </td>
              <td className="px-3 py-2 font-heading text-text-bright">{activityText(entry)}</td>
              <td className="max-w-0 px-3 py-2">
                {entry.event && (
                  <Link to={predictionPath(entry.event.id)} className="block min-w-0 no-underline hover:underline">
                    <MatchupLabel teamA={entry.event.teams[0]} teamB={entry.event.teams[1]} conf={entry.event.conf} linked={false} size={18} />
                  </Link>
                )}
              </td>
              <td className={`whitespace-nowrap px-3 py-2 text-right font-mono ${signedPointsTone(entry.amount)}`}>{signedPointsText(entry.amount)}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-text-bright">{pointsText(entry.balanceAfter)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function activityText(entry: PredictionHistoryEntry): string {
  const label = LEDGER_KIND_LABEL[entry.kind];
  if (entry.kind !== "stake" || entry.teamId === null || !entry.event) return label;
  const team = entry.event.teams.find(t => t?.id === entry.teamId);
  return team ? `${label} on ${team.name}` : label;
}
