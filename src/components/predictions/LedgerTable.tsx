/**
 * The viewer's point history, newest first, as served.
 *
 * The Prediction column uses each entry's compact event, linked as one to the prediction (so the
 * team names inside are not links of their own): both crests and names when the event has teams,
 * otherwise a custom market's title. Hidden and eventless entries leave it empty. A stake entry
 * names its team when the ledger recorded one that the event lists.
 */

import { Link } from "react-router-dom";
import { MatchupLabel } from "./MatchupLabel";
import { predictionPath } from "./PredictionCard";
import { LEDGER_KIND_LABEL } from "./predictionLabels";
import type { PredictionHistoryEntry } from "../../lib/api";
import { pointsText, signedPointsText, signedPointsTone } from "../../lib/predictionPoints";
import { fmtKickoff } from "../../lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function LedgerTable({ entries }: { entries: readonly PredictionHistoryEntry[] }) {
  return (
    <Table containerClassName="rounded-lg border border-border bg-bg2" className="w-full min-w-[640px] text-sm">
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Date</TableHead>
            <TableHead scope="col">Activity</TableHead>
            <TableHead scope="col" className="w-full">Prediction</TableHead>
            <TableHead scope="col" className="text-right">Amount</TableHead>
            <TableHead scope="col" className="text-right">Balance</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map(entry => (
            <TableRow key={entry.id}>
              <TableCell className="whitespace-nowrap text-text-secondary">
                {entry.createdAt && <time dateTime={entry.createdAt}>{fmtKickoff(entry.createdAt)}</time>}
              </TableCell>
              <TableCell className="min-w-40 font-heading text-text-bright">{activityText(entry)}</TableCell>
              <TableCell className="max-w-0">
                {entry.event && (
                  <Link to={predictionPath(entry.event.id)} className="block min-w-0 no-underline hover:underline">
                    {entry.event.teams.length === 2
                      ? <MatchupLabel teamA={entry.event.teams[0]} teamB={entry.event.teams[1]} conf={entry.event.conf} linked={false} size={18} />
                      : <span className="block truncate font-heading text-sm text-text-bright">{entry.event.title ?? "League prediction"}</span>}
                  </Link>
                )}
              </TableCell>
              <TableCell className={`whitespace-nowrap text-right font-mono ${signedPointsTone(entry.amount)}`}>{signedPointsText(entry.amount)}</TableCell>
              <TableCell className="whitespace-nowrap text-right font-mono text-text-bright">{pointsText(entry.balanceAfter)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
  );
}

function activityText(entry: PredictionHistoryEntry): string {
  const label = LEDGER_KIND_LABEL[entry.kind];
  if (entry.kind !== "stake" || entry.teamId === null || !entry.event) return label;
  const team = entry.event.teams.find(t => t?.id === entry.teamId);
  return team ? `${label} on ${team.name}` : label;
}
