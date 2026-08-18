/** Shared Riot-account presentation for Settings and public player pages. */

import { Flame } from "lucide-react";
import { shortName } from "../../lib/statViews";
import type { AccountRank, LinkedAccount } from "../../lib/api";
import { Pill } from "../admin/adminUi";

const QUEUE_LABEL: Record<AccountRank["queue"], string> = { solo: "Solo/Duo", flex: "Flex" };

export function RiotAccountCards({ accounts }: { accounts: readonly LinkedAccount[] }) {
  if (accounts.length === 0) return <p className="text-text-dim">No Riot accounts linked yet.</p>;
  return (
    <div className="flex flex-col gap-3">
      {accounts.map(account => <RiotAccountCard key={account.puuid} account={account} />)}
    </div>
  );
}

export function RiotAccountCard({ account }: { account: LinkedAccount }) {
  const { riotId, summonerLevel, profileIconUrl, ranked } = account;
  const gameName = riotId ? shortName(riotId) : null;
  const tag = riotId && gameName ? riotId.slice(gameName.length) : "";

  return (
    <div className="flex items-start gap-3 rounded-md border border-border bg-bg3 p-3">
      {profileIconUrl ? (
        <img src={profileIconUrl} alt="" width={48} height={48} loading="lazy" decoding="async" className="h-12 w-12 shrink-0 rounded-md" />
      ) : (
        <div className="h-12 w-12 shrink-0 rounded-md border border-border bg-bg" />
      )}
      <div className="min-w-0 flex-1">
        {gameName ? (
          <p className="truncate">
            <span className="font-heading tracking-wide text-text-bright">{gameName}</span>
            {tag && <span className="text-text-dim">{tag}</span>}
          </p>
        ) : (
          <p className="text-text-dim">Name unavailable — Riot no longer resolves this account.</p>
        )}
        {summonerLevel !== null && <p className="mt-0.5 text-xs text-text-secondary">Level {summonerLevel}</p>}
        <div className="mt-2">
          {ranked === null ? (
            <p className="text-xs text-text-dim">Rank unavailable — Riot didn't answer.</p>
          ) : ranked.length === 0 ? (
            <p className="text-xs text-text-secondary">Unranked</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {ranked.map(rank => <RankLine key={rank.queue} rank={rank} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RankLine({ rank }: { rank: AccountRank }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Pill muted>{QUEUE_LABEL[rank.queue]}</Pill>
      <span className="font-heading text-sm uppercase tracking-wider text-text-bright">
        {rank.division ? `${rank.tier} ${rank.division}` : rank.tier}
      </span>
      <span className="text-xs text-text-secondary">{rank.leaguePoints} LP</span>
      <span className="text-xs text-text-dim">{rank.wins}W {rank.losses}L</span>
      {rank.hotStreak && <Flame size={13} className="text-ccs-orange" aria-label="On a win streak" />}
    </div>
  );
}
