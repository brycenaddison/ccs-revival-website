/**
 * Who you are, as the API sees you.
 *
 * Public presentation is editable through the same complete-document form first-time setup uses.
 *
 * What it deliberately does *not* show is the join keys. The Discord snowflake, the CCS profile id
 * and the roles list were all on this page and none of them are yours to act on — the ids are what
 * the API groups on, and the roles row told everyone who isn't staff that they have no roles. The
 * two names and the picture are the whole of what a player recognises as their account.
 *
 * `name` and `handle` come from Discord at different times and drift apart, which is why both are
 * here: `name` is the site's own field, seeded once when the profile was created and never
 * rewritten, while `handle` is re-cached on every login. Someone who renamed on Discord years ago
 * sees the old name above the current handle, and the hints are what explain that.
 */

import { User } from "lucide-react";
import { useAuth } from "../../../lib/authContext";
import { ProfilePresentationForm } from "../../profile/ProfilePresentationForm";
import { ReadOnlyValue, SettingsRow } from "../SettingsSection";

export function AccountSection() {
  const { profile } = useAuth();

  // The gate above guarantees a session, but `profile` is nullable on the identity type — a
  // deployment could answer `authenticated: true` without one, and a crash is the worse outcome.
  if (!profile) {
    return <p className="text-text-dim">Your profile didn't load. Try reloading the page.</p>;
  }

  return (
    <>
      <div className="flex items-center gap-4 mb-6">
        {/* Upstream resolves the default avatar itself, so a null here means a deployment older
            than the field rather than a user without a picture. */}
        {profile.avatar ? (
          <img
            src={profile.avatar}
            alt=""
            width={64}
            height={64}
            loading="lazy"
            decoding="async"
            className="w-16 h-16 rounded-full border border-border shrink-0"
          />
        ) : (
          <div className="w-16 h-16 rounded-full border border-border bg-bg3 grid place-items-center shrink-0">
            <User size={26} className="text-text-dim" aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0">
          <p className="font-display text-2xl text-text-bright tracking-wide truncate">
            {profile.nickname ?? profile.name ?? "—"}
          </p>
          {profile.handle && (
            <p className="text-text-secondary text-sm font-mono truncate">@{profile.handle}</p>
          )}
        </div>
      </div>

      <ProfilePresentationForm
        initial={{
          nickname: profile.nickname ?? profile.name ?? "",
          pronouns: profile.pronouns ?? "",
          pronunciation: profile.pronunciation ?? "",
        }}
        submitLabel="Save profile"
      />

      <div className="my-6 border-t border-border" />

      <SettingsRow
        label="Discord"
        hint={
          profile.handle
            ? "Your handle and picture are refreshed every time you sign in."
            : "Not recorded yet — sign out and back in and we'll pick it up."
        }
      >
        <ReadOnlyValue>{profile.handle ? `@${profile.handle}` : "—"}</ReadOnlyValue>
      </SettingsRow>
    </>
  );
}
