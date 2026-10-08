/**
 * League Admin > Standings tiebreakers: the order this conference's standings and group tables rank
 * teams by (`lib/api/tiebreakers.ts`).
 *
 * The whole list is one document saved in one request. A criterion is in exactly one of the two
 * lists, and the last rule cannot be removed, so the editor cannot build the empty or repeated list
 * upstream refuses; a refusal still marks its rows. Reset to default only changes the working list.
 *
 * The preview is the saved order's standings, refreshed after a save. It never ranks locally: a
 * what-if ranking needs head-to-head results this page does not load, and belongs upstream.
 *
 * Needs the conference `admin` grant (site admins pass); narrower staff grants do not see the
 * section. A 403 from a grant revoked mid-session locks the editor.
 */

import { useId, useLayoutEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  ApiError,
  errorMessage,
  isHeadToHeadTiebreaker,
  issuesOf,
  isTimeTiebreaker,
  saveTiebreakers,
  tiebreakerInfos,
  usesTiebreaker,
  TIEBREAKERS_MIN,
  type TiebreakerDocument,
  type TiebreakerId,
  type TiebreakerInfo,
  type ValidationIssue,
} from "../../../lib/api";
import { queries, queryRoots } from "../../../lib/queries";
import { toBadge } from "../../../lib/leagueAdapters";
import { ErrorLine } from "../../admin/adminUi";
import { IssueList } from "../../admin/season/issues";
import { MoveButtons } from "../../MoveButtons";
import { AvgGameTime } from "../../season/AvgGameTime";
import { TeamBadge } from "../../TeamBadge";
import { TeamLink } from "../TeamLink";
import { SettingsGroup } from "../../settings/SettingsSection";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/cn";

const ISSUE_PATH = /^tiebreakers\.(\d+)$/;

const sameOrder = (a: readonly TiebreakerId[], b: readonly TiebreakerId[]) =>
  a.length === b.length && a.every((id, index) => id === b[index]);

export function TiebreakersSection() {
  const { conf = "" } = useParams();
  const read = useQuery(queries.manageTiebreakers(conf));

  if (read.isError) return <ErrorLine message={errorMessage(read.error)} />;
  if (read.isPending) return <p role="status" className="text-sm text-text-dim">Loading tiebreakers…</p>;

  // Keyed by conference only, so the refetch after a save cannot reset the editor.
  return <TiebreakerEditor key={conf} conf={conf} initial={read.data} />;
}

/** Where focus goes once a change renders: the item's control in the list it now sits in. */
interface FocusTarget {
  list: "used" | "available";
  /** Accessible names to try in order; the first enabled one wins. */
  names: string[];
}

function TiebreakerEditor({ conf, initial }: { conf: string; initial: TiebreakerDocument }) {
  const qc = useQueryClient();
  const [saved, setSaved] = useState(initial);
  const [working, setWorking] = useState<TiebreakerId[]>(initial.tiebreakers);
  // Refusal paths index the list as it was sent, which later edits do not change.
  const [sent, setSent] = useState<TiebreakerId[]>([]);
  const [forbidden, setForbidden] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const minimumHintId = useId();
  const focusTarget = useRef<FocusTarget | null>(null);
  const usedRef = useRef<HTMLOListElement>(null);
  const availableRef = useRef<HTMLUListElement>(null);

  const save = useMutation({
    mutationFn: (ids: TiebreakerId[]) => saveTiebreakers(conf, ids),
    onMutate: ids => setSent(ids),
    onSuccess: async doc => {
      // The response is what the server stored, so it replaces both the saved and working lists.
      setSaved(doc);
      setWorking(doc.tiebreakers);
      qc.setQueryData(queries.manageTiebreakers(conf).queryKey, doc);
      toast.success("Tiebreakers saved. Standings use the new order immediately.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryRoots.tiebreakers }),
        qc.invalidateQueries({ queryKey: queryRoots.standings }),
        qc.invalidateQueries({ queryKey: queryRoots.season }),
        // The re-seeded slots are match teams, which the schedule shows too.
        qc.invalidateQueries({ queryKey: queryRoots.schedule }),
      ]);
    },
    onError: error => {
      if (error instanceof ApiError && error.status === 403) setForbidden(true);
    },
  });

  useLayoutEffect(() => {
    const target = focusTarget.current;
    if (!target) return;
    focusTarget.current = null;
    const container = target.list === "used" ? usedRef.current : availableRef.current;
    for (const name of target.names) {
      const button = container?.querySelector<HTMLButtonElement>(`button[aria-label="${CSS.escape(name)}"]`);
      if (button && !button.disabled) {
        button.focus();
        return;
      }
    }
  }, [working]);

  const catalog = saved.available;
  const used = tiebreakerInfos(saved, working);
  const available = catalog.filter(info => !working.includes(info.id));
  const dirty = !sameOrder(working, saved.tiebreakers);
  const atDefault = sameOrder(working, saved.defaults);
  const locked = forbidden || save.isPending;

  const issues = issuesOf(save.error) ?? [];
  const rowIssues = new Map<TiebreakerId, ValidationIssue[]>();
  for (const issue of issues) {
    const index = ISSUE_PATH.exec(issue.path)?.[1];
    const id = index === undefined ? undefined : sent[Number(index)];
    if (id !== undefined) rowIssues.set(id, [...(rowIssues.get(id) ?? []), issue]);
  }
  const issueLabel = (path: string): string | null => {
    if (path === "tiebreakers") return "Rules";
    const index = ISSUE_PATH.exec(path)?.[1];
    if (index === undefined) return null;
    const name = tiebreakerInfos(saved, [sent[Number(index)]])[0]?.label;
    return name ? `Rule ${Number(index) + 1} (${name})` : `Rule ${Number(index) + 1}`;
  };

  function move(info: TiebreakerInfo, index: number, step: -1 | 1) {
    const target = index + step;
    if (target < 0 || target >= working.length) return;
    const next = [...working];
    [next[index], next[target]] = [next[target], next[index]];
    setWorking(next);
    const [first, second] = step === -1 ? ["up", "down"] : ["down", "up"];
    focusTarget.current = { list: "used", names: [`Move ${info.label} ${first}`, `Move ${info.label} ${second}`] };
    setAnnouncement(`${info.label} moved to position ${target + 1}.`);
  }

  function add(info: TiebreakerInfo) {
    setWorking([...working, info.id]);
    focusTarget.current = { list: "used", names: [`Move ${info.label} up`, `Remove ${info.label}`] };
    setAnnouncement(`${info.label} added at position ${working.length + 1}.`);
  }

  function remove(info: TiebreakerInfo) {
    if (working.length <= TIEBREAKERS_MIN) return;
    setWorking(working.filter(id => id !== info.id));
    focusTarget.current = { list: "available", names: [`Add ${info.label}`] };
    setAnnouncement(`${info.label} removed.`);
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-text-secondary">
        Teams are ranked by each rule in order. Teams still tied move on to the next rule; teams tied
        after the last rule share a place.
      </p>

      <IssueList issues={issues} label={issueLabel} />

      <div className="grid gap-6 md:grid-cols-2">
        <SettingsGroup title="In use (applied top to bottom)">
          <ol ref={usedRef} className="flex flex-col gap-2">
            {used.map((info, index) => {
              const refused = rowIssues.get(info.id) ?? [];
              return (
                <li
                  key={info.id}
                  className={cn(
                    "rounded-md border bg-bg3 p-3",
                    refused.length > 0 ? "border-ccs-red" : "border-border",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span className="w-5 shrink-0 font-mono text-sm text-text-muted">{index + 1}.</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-heading text-sm text-text-bright">{info.label}</div>
                      {info.description && <p className="text-xs text-text-dim">{info.description}</p>}
                      <RuleHint id={info.id} />
                      {refused.map(issue => (
                        <p key={issue.message} className="mt-1 text-xs text-ccs-red">{issue.message}</p>
                      ))}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <MoveButtons
                        variant="quiet"
                        onMove={step => move(info, index, step)}
                        isFirst={index === 0}
                        isLast={index === used.length - 1}
                        upLabel={`Move ${info.label} up`}
                        downLabel={`Move ${info.label} down`}
                        disabled={locked}
                      />
                      <Button
                        type="button"
                        variant="quiet"
                        size="inline"
                        className="text-ccs-red hover:text-text-bright"
                        onClick={() => remove(info)}
                        disabled={locked || working.length <= TIEBREAKERS_MIN}
                        aria-label={`Remove ${info.label}`}
                        aria-describedby={working.length <= TIEBREAKERS_MIN ? minimumHintId : undefined}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          {working.length <= TIEBREAKERS_MIN && (
            <p id={minimumHintId} className="mt-2 text-xs text-text-dim">At least one rule is required.</p>
          )}
        </SettingsGroup>

        <SettingsGroup title="Available">
          {available.length === 0 ? (
            <p className="text-sm text-text-dim">Every rule is in use.</p>
          ) : (
            <ul ref={availableRef} className="flex flex-col gap-2">
              {available.map(info => (
                <li key={info.id} className="flex items-start gap-3 rounded-md border border-border p-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-heading text-sm text-text">{info.label}</div>
                    {info.description && <p className="text-xs text-text-dim">{info.description}</p>}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => add(info)}
                    disabled={locked}
                    aria-label={`Add ${info.label}`}
                  >
                    <Plus size={13} aria-hidden="true" />
                    Add
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </SettingsGroup>
      </div>

      <p aria-live="polite" aria-atomic="true" className="sr-only">{announcement}</p>

      {/* Verbatim, including a 403, which also locks the editor; the working list stays either way. */}
      <ErrorLine message={save.isError && !issuesOf(save.error) ? errorMessage(save.error) : null} />

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-5">
        <Button type="button" onClick={() => save.mutate(working)} disabled={!dirty || locked}>
          {save.isPending ? "Saving…" : "Save order"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setWorking(saved.tiebreakers);
            save.reset();
          }}
          disabled={!dirty || locked}
        >
          Discard changes
        </Button>
        <Button
          type="button"
          variant="outline"
          className="ml-auto"
          onClick={() => {
            setWorking(saved.defaults);
            setAnnouncement("Default order restored. Save to apply it.");
          }}
          disabled={atDefault || locked || saved.defaults.length === 0}
        >
          Reset to default
        </Button>
      </div>
      {/* Upstream re-seeds in the same transaction, so a failed save changed neither the order nor a slot. */}
      <p className="-mt-3 text-xs text-text-dim">
        Saving also re-seeds playoff slots filled from a table. Matches already being played keep their teams.
      </p>

      <SavedStandings conf={conf} saved={saved} />
    </div>
  );
}

function RuleHint({ id }: { id: TiebreakerId }) {
  if (isHeadToHeadTiebreaker(id)) {
    return <p className="mt-1 text-xs text-text-muted">Counts only results between the teams still tied at this point.</p>;
  }
  if (isTimeTiebreaker(id)) {
    return (
      <p className="mt-1 text-xs text-text-muted">
        Forfeits and games under 14 minutes aren&rsquo;t timed. Teams with no timed games rank last on this rule.
      </p>
    );
  }
  return null;
}

/** The season-wide standings as the saved order ranks them, in served order. */
function SavedStandings({ conf, saved }: { conf: string; saved: TiebreakerDocument }) {
  const { data, isError, error } = useQuery(queries.manageStandings(conf));
  const avgWin = usesTiebreaker(saved, "avg_win_time");
  const avgLoss = usesTiebreaker(saved, "avg_loss_time");

  return (
    <SettingsGroup title="Current standings (saved order)">
      {isError ? (
        <ErrorLine message={errorMessage(error)} />
      ) : data === undefined ? (
        <p role="status" className="text-sm text-text-dim">Loading standings…</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-text-dim">No teams in this league yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Place</TableHead>
              <TableHead className="w-full">Team</TableHead>
              <TableHead className="text-center">Series</TableHead>
              <TableHead className="text-center">Games</TableHead>
              {avgWin && <TableHead className="text-center">Avg win</TableHead>}
              {avgLoss && <TableHead className="text-center">Avg loss</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map(row => (
              <TableRow key={`${row.teamId ?? row.code}-${row.rank}`}>
                <TableCell className="font-mono">{row.place}</TableCell>
                <TableCell className="max-w-0">
                  <TeamLink teamId={row.teamId} className="flex min-w-0 items-center gap-2 no-underline">
                    <TeamBadge team={toBadge(row)} size={20} />
                    <span className="truncate text-text">{row.name}</span>
                  </TeamLink>
                </TableCell>
                <TableCell className="text-center font-mono">{row.seriesWins}-{row.seriesLosses}</TableCell>
                <TableCell className="text-center font-mono">{row.gameWins}-{row.gameLosses}</TableCell>
                {avgWin && <TimeCell seconds={row.avgWinSeconds} />}
                {avgLoss && <TimeCell seconds={row.avgLossSeconds} />}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </SettingsGroup>
  );
}

function TimeCell({ seconds }: { seconds: number | null }) {
  return (
    <TableCell className="text-center font-mono">
      <AvgGameTime seconds={seconds} />
    </TableCell>
  );
}
