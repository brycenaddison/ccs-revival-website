/**
 * Shared Riot-account presentation for Settings and public player pages.
 *
 * Two shapes, because a player with five linked accounts has one they actually play. The **primary**
 * card is the tall one: icon, Riot ID, level, then one block per ranked queue beneath. Every other
 * account gets the **compact** single row — enough to see it exists and where it sits, without five
 * tall cards pushing the rest of the rail off the screen.
 *
 * Which account is primary is `primaryAccount()`'s call, not this file's: the API models a profile
 * as an unordered bag of PUUIDs with no primary flag, so highest **current** rank is the proxy.
 * Peak rank would be the better one and does not exist — Riot serves only the current standing and
 * nothing stores history, so there is no peak to read. See §9.4 of the gap analysis.
 *
 * `ranked: null` and `ranked: []` stay distinct all the way down here — "Riot didn't answer" and
 * "unranked" are different sentences, and collapsing them puts Unranked on a Challenger player.
 *
 * A third shape, `UnverifiedAccountRow`, is a **claim** rather than an account: a name a player
 * typed, resolved by Riot and nothing more. It has no icon, level or rank because upstream never
 * asks for any — so it is a deliberately plainer row, and it says "unverified" on its face. Making
 * it look like the compact card with empty fields would read as an account whose data failed to
 * load, which is a different problem with a different fix.
 *
 * Everything is `truncate`, never wrapped: a Riot ID has no length limit worth trusting and a
 * wrapped one drags the card's height around unpredictably.
 */

import type { ReactNode } from "react";
import { Flame } from "lucide-react";
import { pct0 } from "../../lib/statFormat";
import {
  bestRank,
  primaryAccount,
  rankWinRate,
  type AccountRank,
  type LinkedAccount,
  type UnverifiedAccount,
} from "../../lib/api";
import { metricText, winRateTone } from "./profileUi";

const QUEUE_LABEL: Record<AccountRank["queue"], string> = { solo: "Solo/Duo", flex: "Flex" };

/**
 * Riot reports a division for every tier, including the three that don't have one.
 *
 * Master, Grandmaster and Challenger are single-division tiers separated purely by LP, and Riot
 * still sends `rank: "I"` for all of them — so rendering tier-and-division verbatim produces
 * "CHALLENGER I", which is not a thing. Below Master the division is load-bearing and stays.
 */
const APEX_TIERS = new Set(["MASTER", "GRANDMASTER", "CHALLENGER"]);

/** Riot serves tiers shouted (`EMERALD`); a person writes Emerald. */
const tierName = (tier: string): string => tier.charAt(0).toUpperCase() + tier.slice(1).toLowerCase();

function tierLabel(rank: AccountRank): string {
  if (!rank.division || APEX_TIERS.has(rank.tier.toUpperCase())) return tierName(rank.tier);
  return `${tierName(rank.tier)} ${rank.division}`;
}

/**
 * The tier crest, from Community Dragon.
 *
 * The **mini crests** rather than the full ranked emblems: they are drawn for this size, so they
 * stay legible at 18px where the large emblem turns to mush, and they are SVG so neither size is
 * resampled. `latest` is safe on this path — same as `championData.ts` — so no patch is pinned and
 * nothing here has to be bumped when Riot reworks the artwork.
 */
const CREST_BASE =
  "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-mini-crests";

const crestUrl = (tier: string): string => `${CREST_BASE}/${tier.toLowerCase()}.svg`;

/** Ranked W–L, plainly: `48W 57L`. */
const winLossText = (rank: AccountRank): string => `${rank.wins}W ${rank.losses}L`;

export function RiotAccountCards({ accounts }: { accounts: readonly LinkedAccount[] }) {
  if (accounts.length === 0) return <p className="text-text-dim">No Riot accounts linked yet.</p>;

  const primary = primaryAccount(accounts);
  const others = accounts.filter(account => account !== primary);

  return (
    <div className="flex flex-col gap-2">
      {primary && <RiotAccountCard account={primary} />}
      {others.map(account => (
        <RiotAccountCard key={account.puuid} account={account} compact />
      ))}
    </div>
  );
}

export function RiotAccountCard({
  account,
  compact = false,
}: {
  account: LinkedAccount;
  compact?: boolean;
}) {
  return compact ? <CompactCard account={account} /> : <PrimaryCard account={account} />;
}

function PrimaryCard({ account }: { account: LinkedAccount }) {
  const { riotId, summonerLevel, profileIconUrl, ranked } = account;

  return (
    <div className="rounded-md border border-border bg-bg3 p-3">
      <div className="flex min-w-0 items-center gap-3">
        <AccountIcon url={profileIconUrl} size={48} />
        <div className="min-w-0 flex-1">
          <RiotId riotId={riotId} />
          {summonerLevel !== null && (
            <p className="mt-0.5 truncate text-xs text-text-secondary">Level {summonerLevel}</p>
          )}
        </div>
      </div>

      {/* Both queues, stacked rather than side by side. Two columns is what left a hole on the many
          players who have a solo rank and no flex one; stacking only renders the entries that
          exist, so an unranked queue costs nothing. */}
      <div className="mt-3 flex flex-col gap-2">
        {ranked === null ? (
          <p className="text-xs text-text-dim">Rank unavailable — Riot didn't answer.</p>
        ) : ranked.length === 0 ? (
          <p className="text-xs text-text-secondary">Unranked</p>
        ) : (
          ranked.map(rank => <RankBlock key={rank.queue} rank={rank} />)
        )}
      </div>
    </div>
  );
}

/**
 * One queue: crest, tier over LP, record over win rate.
 *
 * The crest carries the tier as artwork, which is what lets the text shrink to two short lines and
 * the whole block stay one row tall in a 320px rail.
 */
function RankBlock({ rank }: { rank: AccountRank }) {
  const winRate = rankWinRate(rank);

  return (
    <div className="grid min-w-0 grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-x-2 rounded border border-border bg-bg px-2 py-1.5">
      <img
        src={crestUrl(rank.tier)}
        alt=""
        width={40}
        height={40}
        loading="lazy"
        decoding="async"
        className="row-span-2 h-10 w-10 shrink-0 object-contain"
      />

      <span className="flex min-w-0 items-baseline gap-1.5">
        <span className="truncate font-heading text-sm text-text-bright">
          {tierLabel(rank)}
        </span>
        {rank.hotStreak && (
          <Flame size={11} className="shrink-0 self-center text-ccs-orange" aria-label="On a win streak" />
        )}
      </span>
      <span className="justify-self-end whitespace-nowrap font-mono text-[10px] text-text-secondary">
        {winLossText(rank)}
      </span>

      <span className="flex min-w-0 items-baseline gap-1.5">
        <span className="shrink-0 font-mono text-[11px] text-text-secondary">{rank.leaguePoints} LP</span>
        <span className="truncate font-heading text-[9px] text-text-dim">
          {QUEUE_LABEL[rank.queue]}
        </span>
      </span>
      <span className="flex items-baseline justify-self-end gap-1.5 whitespace-nowrap">
        <span className="font-heading text-[9px] text-text-dim">Win rate</span>
        <span className={`font-mono text-[11px] ${winRateTone(winRate, "text-text-secondary")}`}>
          {metricText(winRate, pct0)}
        </span>
      </span>
    </div>
  );
}

/** A secondary account: one line, best queue only. */
function CompactCard({ account }: { account: LinkedAccount }) {
  const { riotId, profileIconUrl, ranked } = account;
  const rank = bestRank(account);
  const winRate = rank ? rankWinRate(rank) : null;

  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-bg3 px-2 py-1.5">
      <AccountIcon url={profileIconUrl} size={22} />
      <span className="min-w-0 flex-1">
        <RiotId riotId={riotId} compact />
      </span>

      {rank ? (
        <>
          <img
            src={crestUrl(rank.tier)}
            alt=""
            width={18}
            height={18}
            loading="lazy"
            decoding="async"
            className="h-[18px] w-[18px] shrink-0 object-contain"
          />
          <span className="shrink-0 truncate font-heading text-[10px] text-text-secondary">
            {tierLabel(rank)}
          </span>
          <span className="shrink-0 whitespace-nowrap font-mono text-[10px] text-text-dim">
            {winLossText(rank)}
          </span>
          <span className={`w-8 shrink-0 text-right font-mono text-[10px] ${winRateTone(winRate, "text-text-secondary")}`}>
            {metricText(winRate, pct0)}
          </span>
        </>
      ) : (
        <span className="shrink-0 text-[10px] text-text-dim">
          {ranked === null ? "No rank data" : "Unranked"}
        </span>
      )}
    </div>
  );
}

/**
 * One self-reported claim: the Riot ID, a label saying it is unproven, and whatever the owner is
 * allowed to do about it.
 *
 * `actions` is what makes this shared rather than two components. The public page passes nothing and
 * gets a read-only row; Settings passes Verify and Remove. The row itself has no idea whether it is
 * being shown to the account's owner — that judgement belongs to the caller that has the session.
 */
export function UnverifiedAccountRow({
  account,
  actions,
}: {
  account: UnverifiedAccount;
  actions?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 rounded-md border border-dashed border-border2 bg-bg3 px-2 py-1.5">
      <span className="min-w-0 flex-1">
        <RiotId riotId={account.riotId} compact />
      </span>
      <span className="shrink-0 rounded-full border border-border px-2 py-0.5 font-heading text-[9px] text-text-dim">
        Unverified
      </span>
      {actions}
    </div>
  );
}

/**
 * A summoner profile icon's URL, from its numeric id.
 *
 * The same rule `championData.ts` follows for champion squares, and for the same reason: the id is
 * the durable thing the database holds, and one local builder means every profile icon on the site
 * resolves through one path instead of trusting a string per payload. Upstream builds the identical
 * URL (`utils/communityDragon.ts`), so this is a second spelling of one agreement, not a guess —
 * which is what makes it usable as a fallback when a payload's own URL field is missing.
 *
 * `latest` rather than a pinned patch: pinning is how the old ddragon code ended up resolving every
 * champion released in two years to `undefined`.
 */
export const profileIconUrl = (iconId: number): string =>
  `https://cdn.communitydragon.org/latest/profile-icon/${iconId}`;

function AccountIcon({ url, size }: { url: string | null; size: number }) {
  if (!url) {
    return (
      <div
        className="shrink-0 rounded-md border border-border bg-bg"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className="shrink-0 rounded-md"
      style={{ width: size, height: size }}
    />
  );
}

/**
 * `gameName` bright, `#tagLine` dim.
 *
 * A null Riot ID is routine rather than an error — a banned or deleted account stops resolving —
 * so it says so instead of rendering an empty line.
 */
function RiotId({ riotId, compact = false }: { riotId: string | null; compact?: boolean }) {
  if (!riotId) {
    return (
      <p className={`truncate text-text-dim ${compact ? "text-[11px]" : "text-sm"}`}>
        {compact ? "Name unavailable" : "Name unavailable — Riot no longer resolves this account."}
      </p>
    );
  }

  // Split rather than stripped: the tag is dimmed, not dropped. This is a genuine Riot ID — the
  // only string on the site that has one — and `Faker#KR1` without its tag is a different account.
  const hash = riotId.indexOf("#");
  const gameName = hash > 0 ? riotId.slice(0, hash) : riotId;
  const tag = riotId.slice(gameName.length);

  return (
    <p className="truncate">
      <span className={`font-heading tracking-wide text-text-bright ${compact ? "text-[11px]" : ""}`}>
        {gameName}
      </span>
      {tag && <span className={`text-text-dim ${compact ? "text-[11px]" : ""}`}>{tag}</span>}
    </p>
  );
}
