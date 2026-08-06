/**
 * Riot accounts attached to this profile.
 *
 * This used to list raw puuids, because resolving one to a Riot ID needed an endpoint the API
 * didn't have. `GET /profiles/:id/accounts` is that endpoint, so the puuid is gone from the screen
 * entirely — it is the join key the two systems agree on and there is nothing a player can do with
 * it. What replaces it is what they'd recognise: the icon, the Riot ID, the level and the rank.
 *
 * Three states here are absence rather than failure, and they say different things:
 *  - `[]` — asked, nothing linked.
 *  - `null` from the query — the endpoint didn't answer for this profile, so we know from
 *    `/auth/me` that accounts exist but can't describe them. Saying "no accounts linked" there
 *    would read as them having been dropped.
 *  - `ranked: null` on an account — Riot wouldn't say. Rendered as unavailable and **never** as
 *    Unranked; see the header on `lib/api/profiles.ts`.
 */

import { Flame, Link2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { errorMessage, type AccountRank, type LinkedAccount } from "../../../lib/api";
import { queries } from "../../../lib/queries";
import { RIOT_LINKING_ENABLED, useAuth } from "../../../lib/authContext";
import { shortName } from "../../../lib/statViews";
import { ACTION_PRIMARY, ErrorLine, Pill } from "../../admin/adminUi";

const QUEUE_LABEL: Record<AccountRank["queue"], string> = { solo: "Solo/Duo", flex: "Flex" };

export function ConnectionsSection() {
  const { profile, linkRiot } = useAuth();
  const { data, isPending, error } = useQuery(queries.profileAccounts(profile?.id ?? null));

  return (
    <>
      {!profile ? (
        <p className="text-text-dim">Your profile didn't load. Try reloading the page.</p>
      ) : isPending ? (
        <p className="text-text-dim">Loading your Riot accounts…</p>
      ) : error ? (
        <ErrorLine message={errorMessage(error)} />
      ) : !data ? (
        // Null, not empty — `[]` is truthy, and `undefined` can't reach here past `isPending`.
        // We know the count from the session even when the lookup can't describe them.
        <p className="text-text-dim">
          {profile.puuids.length === 1
            ? "1 Riot account is linked, but its details aren't available right now."
            : `${profile.puuids.length} Riot accounts are linked, but their details aren't available right now.`}
        </p>
      ) : data.length === 0 ? (
        <p className="text-text-dim">No Riot accounts linked yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {data.map(account => (
            <AccountCard key={account.puuid} account={account} />
          ))}
        </div>
      )}

      {/* Unlike the account menu, this section keeps the button when linking is off and disables it:
          it is the page you came to *in order to* link, so the control has to be visible for its
          absence not to read as a bug. The sentence beneath says which it is. */}
      <button
        type="button"
        onClick={() => void linkRiot()}
        disabled={!RIOT_LINKING_ENABLED}
        className={`${ACTION_PRIMARY} mt-5`}
      >
        <Link2 size={15} aria-hidden="true" />
        Link Riot Account
      </button>
      <p className="text-text-dim text-xs mt-2">
        {RIOT_LINKING_ENABLED
          ? "Opens Riot's sign-in in a pop-up. Linking more than one account is fine — they all count as you."
          : "Linking new Riot accounts is temporarily unavailable. Anything already linked stays linked."}
      </p>
    </>
  );
}

function AccountCard({ account }: { account: LinkedAccount }) {
  const { riotId, summonerLevel, profileIconUrl, ranked } = account;
  // `shortName` keeps the identity intact and strips the tag for display; the remainder is the tag
  // itself, dimmed rather than dropped — two accounts can share a game name.
  const gameName = riotId ? shortName(riotId) : null;
  const tag = riotId && gameName ? riotId.slice(gameName.length) : "";

  return (
    <div className="flex items-start gap-3 bg-bg3 border border-border rounded-md p-3">
      {profileIconUrl ? (
        <img
          src={profileIconUrl}
          alt=""
          width={48}
          height={48}
          loading="lazy"
          decoding="async"
          className="w-12 h-12 rounded-md shrink-0"
        />
      ) : (
        <div className="w-12 h-12 rounded-md bg-bg border border-border shrink-0" />
      )}

      <div className="min-w-0 flex-1">
        {gameName ? (
          <p className="truncate">
            <span className="text-text-bright font-heading tracking-wide">{gameName}</span>
            {tag && <span className="text-text-dim">{tag}</span>}
          </p>
        ) : (
          // Routine rather than an error: Riot stops resolving banned and deleted accounts.
          <p className="text-text-dim">Name unavailable — Riot no longer resolves this account.</p>
        )}

        {summonerLevel !== null && (
          <p className="text-text-secondary text-xs mt-0.5">Level {summonerLevel}</p>
        )}

        <div className="mt-2">
          {ranked === null ? (
            <p className="text-text-dim text-xs">Rank unavailable — Riot didn't answer.</p>
          ) : ranked.length === 0 ? (
            <p className="text-text-secondary text-xs">Unranked</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {ranked.map(rank => (
                <RankLine key={rank.queue} rank={rank} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RankLine({ rank }: { rank: AccountRank }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Pill muted>{QUEUE_LABEL[rank.queue]}</Pill>
      <span className="font-heading text-sm tracking-wider uppercase text-text-bright">
        {rank.division ? `${rank.tier} ${rank.division}` : rank.tier}
      </span>
      <span className="text-text-secondary text-xs">{rank.leaguePoints} LP</span>
      {/* Per queue and never summed — a combined total would hide which tier the record belongs to. */}
      <span className="text-text-dim text-xs">
        {rank.wins}W {rank.losses}L
      </span>
      {rank.hotStreak && (
        <Flame size={13} className="text-ccs-orange" aria-label="On a win streak" />
      )}
    </div>
  );
}
