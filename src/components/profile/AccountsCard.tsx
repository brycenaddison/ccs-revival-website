/**
 * The Riot-accounts rail card, and the public refresh that belongs with it.
 *
 * The mutation lives here rather than on the page because everything it touches is on this card:
 * the account list it rewrites, the OP.GG link it may complete, and the status summary it reports.
 *
 * Two behaviours are deliberate and easy to lose. The refreshed accounts are written straight into
 * both caches with `setQueryData`, and the follow-up invalidation uses `refetchType: "none"` — a
 * refetch here would re-read the browser's own copy of a `max-age=600` response and overwrite the
 * fresh data we were just handed. And a failed refresh leaves the existing cards on screen: the
 * server keeps last-known-good data per account, so blanking the panel would be showing *less* than
 * the API knows.
 */

import { useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  errorMessage,
  refreshProfileAccounts,
  type PlayerProfile,
  type ProfileAccountRefresh,
} from "../../lib/api";
import { queries, queryRoots } from "../../lib/queries";
import { ACTION_SM, ErrorLine } from "../admin/adminUi";
import { RiotAccountCards } from "./RiotAccountCards";
import { RailCard } from "./profileUi";

export function AccountsCard({ data }: { data: PlayerProfile }) {
  const qc = useQueryClient();
  const [summary, setSummary] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => refreshProfileAccounts(data.profile.id),
    onSuccess: result => {
      if (!result) {
        setSummary("This player profile is no longer available.");
        return;
      }
      qc.setQueryData(queries.profileAccounts(data.profile.id).queryKey, result.accounts);
      qc.setQueryData<PlayerProfile>(
        queries.playerProfile(data.profile.id, data.filter.conf).queryKey,
        current => (current ? { ...current, accounts: result.accounts, links: result.links } : current),
      );
      void qc.invalidateQueries({ queryKey: queryRoots.profiles, refetchType: "none" });
      setSummary(refreshSummary(result));
    },
  });

  return (
    <RailCard title="RIOT ACCOUNTS">
      <div className="p-3">
        <RiotAccountCards accounts={data.accounts} />

        <div className="mt-3 flex flex-col items-start gap-2 border-t border-border pt-3">
          {data.links.opggMultisearch && (
            <a
              href={data.links.opggMultisearch}
              target="_blank"
              rel="noopener noreferrer"
              className={`${ACTION_SM} no-underline`}
            >
              Open OP.GG <ExternalLink size={13} aria-hidden="true" />
            </a>
          )}
          {!data.links.opggComplete && data.accounts.length > 0 && (
            <p className="text-xs text-text-dim">OP.GG omits accounts whose Riot ID is unavailable.</p>
          )}

          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className={ACTION_SM}
          >
            <RefreshCw size={13} aria-hidden="true" className={mutation.isPending ? "animate-spin" : ""} />
            {mutation.isPending ? "Refreshing…" : "Refresh Riot data"}
          </button>

          {summary && <p className="text-xs text-text-secondary">{summary}</p>}
          {mutation.error && <ErrorLine message={errorMessage(mutation.error)} />}
        </div>
      </div>
    </RailCard>
  );
}

/**
 * Per-account outcomes, counted rather than listed.
 *
 * `partial` and `stale` are successes with caveats — the account still has data — so they are
 * reported alongside `refreshed` rather than presented as failure.
 */
function refreshSummary(result: ProfileAccountRefresh): string {
  if (result.refresh.length === 0) return "No Riot accounts are linked.";
  const counts = new Map<string, number>();
  result.refresh.forEach(row => counts.set(row.status, (counts.get(row.status) ?? 0) + 1));
  return [...counts.entries()].map(([status, count]) => `${count} ${status.replace(/_/g, " ")}`).join(" · ");
}
