/**
 * The Riot-accounts rail card, and the public refresh that belongs with it.
 *
 * The mutation lives here rather than on the page because everything it touches is on this card:
 * the account list it rewrites, the OP.GG link it may complete, and the status summary it reports.
 *
 * Two behaviors are deliberate and easy to lose. The refreshed accounts are written straight into
 * both caches with `setQueryData`, and the follow-up invalidation uses `refetchType: "none"` — a
 * refetch here would re-read the browser's own copy of a cacheable response and overwrite the fresh
 * data we were just handed. And a failed refresh leaves the existing cards on screen: the server
 * keeps last-known-good data per account, so blanking the panel would be showing *less* than the API
 * knows.
 *
 * The refresh response carries the profile's unverified claims back unchanged — there is nothing on
 * a claim to refresh — so they are written through with the rest rather than dropped, which would
 * empty the list below the cards on every press.
 */

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import opggLogo from "../../assets/opgg.svg";
import {
  errorMessage,
  refreshProfileAccounts,
  type PlayerProfile,
  type ProfileAccountRefresh,
} from "../../lib/api";
import { queries, queryRoots } from "../../lib/queries";
import { ACTION_SM, ErrorLine } from "../admin/adminUi";
import { RiotAccountCards, UnverifiedAccountRow } from "./RiotAccountCards";
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
      qc.setQueryData(queries.profileAccounts(data.profile.id).queryKey, {
        profileId: result.profileId,
        accounts: result.accounts,
        unverifiedAccounts: result.unverifiedAccounts,
        links: result.links,
      });
      qc.setQueryData<PlayerProfile>(
        queries.playerProfile(data.profile.id, data.filter.conf).queryKey,
        current =>
          current
            ? {
                ...current,
                accounts: result.accounts,
                unverifiedAccounts: result.unverifiedAccounts,
                links: result.links,
              }
            : current,
      );
      void qc.invalidateQueries({ queryKey: queryRoots.profiles, refetchType: "none" });
      setSummary(refreshSummary(result));
    },
  });

  return (
    <RailCard title="RIOT ACCOUNTS">
      <div className="p-3">
        <RiotAccountCards accounts={data.accounts} />

        {/* Below the verified list rather than mixed into it, and shown even though nothing on this
            page counts them: they are in the OP.GG link, so a reader who spots a sixth summoner
            there needs somewhere to see where it came from. */}
        {data.unverifiedAccounts.length > 0 && (
          <div className="mt-2 flex flex-col gap-2">
            {data.unverifiedAccounts.map(account => (
              <UnverifiedAccountRow key={account.claimId} account={account} />
            ))}
          </div>
        )}

        <div className="mt-3 border-t border-border pt-3">
          <div className="flex items-stretch gap-2">
            {data.links.opggMultisearch && (
              <a
                href={data.links.opggMultisearch}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open this player's accounts on OP.GG"
                className="flex flex-1 items-center justify-center rounded-md border border-opgg bg-opgg px-3 py-2 no-underline"
              >
                <img src={opggLogo} alt="OP.GG" width={66} height={16} className="h-4 w-auto" />
              </a>
            )}

            <button
              type="button"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className={`${ACTION_SM} justify-center`}
            >
              <RefreshCw size={13} aria-hidden="true" className={mutation.isPending ? "animate-spin" : ""} />
              {/* Both labels occupy one grid cell, so the button is always as wide as the longer of
                  them and does not resize — and neither does the OP.GG button beside it — when the
                  state flips. The hidden copy is `aria-hidden` so the label isn't announced twice. */}
              <span className="grid">
                <span aria-hidden="true" className="invisible col-start-1 row-start-1">Refreshing…</span>
                <span className="col-start-1 row-start-1">
                  {mutation.isPending ? "Refreshing…" : "Refresh"}
                </span>
              </span>
            </button>
          </div>

          {!data.links.opggComplete && data.accounts.length > 0 && (
            <p className="mt-2 text-xs text-text-dim">OP.GG omits accounts whose Riot ID is unavailable.</p>
          )}
          {summary && <p className="mt-2 text-xs text-text-secondary">{summary}</p>}
          {mutation.error && <div className="mt-2"><ErrorLine message={errorMessage(mutation.error)} /></div>}
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
