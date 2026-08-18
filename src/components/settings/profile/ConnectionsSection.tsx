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

import { Link2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { errorMessage } from "../../../lib/api";
import { queries } from "../../../lib/queries";
import { RIOT_LINKING_ENABLED, useAuth } from "../../../lib/authContext";
import { ACTION_PRIMARY, ErrorLine } from "../../admin/adminUi";
import { RiotAccountCards } from "../../profile/RiotAccountCards";

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
      ) : (
        <RiotAccountCards accounts={data} />
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
