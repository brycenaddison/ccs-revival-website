/**
 * Riot accounts attached to this profile.
 *
 * This used to list raw puuids, because resolving one to a Riot ID needed an endpoint the API
 * didn't have. `GET /profiles/:id/accounts` is that endpoint, so the puuid is gone from the screen
 * entirely — it is the join key the two systems agree on and there is nothing a player can do with
 * it. What replaces it is what they'd recognise: the icon, the Riot ID, the level and the rank.
 *
 * **The page is now in two halves, and the split is the point.** Above are verified accounts: they
 * are in `profiles.puuids`, so they carry match attribution, roster eligibility and statistics.
 * Below are self-reported claims, which carry none of that until proven. A player has to be able to
 * tell which of their accounts are actually doing anything, and one list with a badge on some rows
 * is not that.
 *
 * There are two ways to prove one, and the deployment decides which exist — `verification.profileIcon`
 * and `verification.rso` from `/auth/me`. Rendering a control for a method the server can't serve
 * fails only after the player has committed to it, so neither is assumed.
 *
 * Three states here are absence rather than failure, and they say different things:
 *  - `[]` — asked, nothing linked.
 *  - `null` from the query — the endpoint didn't answer for this profile, so we know from
 *    `/auth/me` that accounts exist but can't describe them. Saying "no accounts linked" there
 *    would read as them having been dropped.
 *  - `ranked: null` on an account — Riot wouldn't say. Rendered as unavailable and **never** as
 *    Unranked; see the header on `lib/api/profiles.ts`.
 */

import { Link2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { errorMessage } from "../../../lib/api";
import { queries } from "../../../lib/queries";
import { useAuth } from "../../../lib/authContext";
import { ACTION_PRIMARY, ErrorLine } from "../../admin/adminUi";
import { RiotAccountCards } from "../../profile/RiotAccountCards";
import { UnverifiedAccounts } from "./UnverifiedAccounts";

export function ConnectionsSection() {
  const { profile, linkRiot, canLinkRiot, verification } = useAuth();
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
        // Null, not empty — an empty payload is an object, and `undefined` can't reach here past
        // `isPending`. We know the count from the session even when the lookup can't describe them.
        <p className="text-text-dim">
          {profile.puuids.length === 1
            ? "1 Riot account is linked, but its details aren't available right now."
            : `${profile.puuids.length} Riot accounts are linked, but their details aren't available right now.`}
        </p>
      ) : (
        <>
          <RiotAccountCards accounts={data.accounts} />
          <UnverifiedAccounts
            accounts={data.unverifiedAccounts}
            canVerify={verification.profileIcon}
          />
        </>
      )}

      {/* Unlike the account menu, this section keeps the button when RSO is off and disables it: it
          is the page you came to *in order to* link, so the control has to be visible for its absence
          not to read as a bug. The sentence beneath says which it is. */}
      <div className="mt-6 border-t border-border pt-5">
        <button
          type="button"
          onClick={() => void linkRiot()}
          disabled={!canLinkRiot}
          className={ACTION_PRIMARY}
        >
          <Link2 size={15} aria-hidden="true" />
          Sign in with Riot
        </button>
        <p className="mt-2 text-xs text-text-dim">
          {canLinkRiot
            ? "Opens Riot's sign-in in a pop-up and verifies the account in one step. Linking more than one account is fine — they all count as you."
            : verification.profileIcon
              ? "Signing in with Riot is unavailable until we get approved to use Riot Sign On. Add your accounts above and verify by summoner icon instead."
              : "Signing in with Riot is unavailable until we get approved to use Riot Sign On."}
        </p>
      </div>
    </>
  );
}
