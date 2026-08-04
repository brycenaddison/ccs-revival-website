/**
 * Riot accounts attached to this profile.
 *
 * This is the first thing in the site that reads `SessionProfile.puuids` — the field has been
 * populated since Riot Sign On landed and nothing rendered it, so you could link an account and
 * never see what you'd linked.
 *
 * No local state: `linkRiot` re-reads `/auth/me` on success and the provider owns the result toast
 * (see `lib/authContext.tsx`), so the list below re-renders itself when a link lands.
 *
 * A puuid is an opaque 78-character id, which reads as noise. Resolving one to a Riot ID needs an
 * endpoint the API doesn't have, so it's shown as-is rather than guessed at from stats data.
 */

import { Link2 } from "lucide-react";
import { RIOT_LINKING_ENABLED, useAuth } from "../../../lib/authContext";
import { ReadOnlyValue } from "../SettingsSection";

export function ConnectionsSection() {
  const { profile, linkRiot } = useAuth();
  const puuids = profile?.puuids ?? [];

  return (
    <>
      {puuids.length === 0 ? (
        <p className="text-text-dim">No Riot accounts linked yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {puuids.map(puuid => (
            <ReadOnlyValue key={puuid} mono>
              {puuid}
            </ReadOnlyValue>
          ))}
        </div>
      )}

      {/* Unlike the account menu, this section says something when linking is off: it is the page you
          came to *in order to* link, so an empty panel would read as broken rather than paused. */}
      {RIOT_LINKING_ENABLED ? (
        <>
          <button
            onClick={() => void linkRiot()}
            className="mt-5 flex items-center gap-2 bg-transparent border border-accent rounded-md px-4 py-2 cursor-pointer text-text-bright font-heading text-sm tracking-wider uppercase"
          >
            <Link2 size={15} aria-hidden="true" />
            Link Riot Account
          </button>
          <p className="text-text-dim text-xs mt-2">
            Opens Riot's sign-in in a pop-up. Linking more than one account is fine — they all count as you.
          </p>
        </>
      ) : (
        <p className="text-text-dim text-xs mt-5">
          Linking new Riot accounts is temporarily unavailable. Anything already linked stays linked.
        </p>
      )}
    </>
  );
}
