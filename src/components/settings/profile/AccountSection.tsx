/**
 * Who you are, as the API sees you.
 *
 * Everything here is read-only, and that is the API's shape rather than a simplification: there is
 * no `PATCH /auth/me`. The display name comes from Discord at sign-in. Saying so once in a hint is
 * better than rendering an input that silently can't save.
 */

import { useAuth } from "../../../lib/authContext";
import { ReadOnlyValue, SettingsRow } from "../SettingsSection";

export function AccountSection() {
  const { profile, roles } = useAuth();

  // The gate above guarantees a session, but `profile` is nullable on the identity type — a
  // deployment could answer `authenticated: true` without one, and a crash is the worse outcome.
  if (!profile) {
    return <p className="text-text-dim">Your profile didn't load. Try reloading the page.</p>;
  }

  return (
    <>
      <SettingsRow label="Display name" hint="Comes from your Discord account and updates when you sign in.">
        <ReadOnlyValue>{profile.name ?? "—"}</ReadOnlyValue>
      </SettingsRow>

      <SettingsRow label="Discord ID">
        <ReadOnlyValue mono>{profile.snowflake}</ReadOnlyValue>
      </SettingsRow>

      <SettingsRow label="CCS profile ID">
        <ReadOnlyValue mono>{profile.id}</ReadOnlyValue>
      </SettingsRow>

      <SettingsRow
        label="Roles"
        hint={roles.length === 0 ? "A standard account. Roles are granted by a site admin." : undefined}
      >
        {roles.length === 0 ? (
          <ReadOnlyValue>No special roles</ReadOnlyValue>
        ) : (
          <div className="flex flex-wrap gap-2">
            {roles.map(role => (
              <span
                key={role}
                className="bg-bg3 border border-border rounded-full px-3 py-1 font-heading text-xs tracking-wider uppercase text-text-bright"
              >
                {role}
              </span>
            ))}
          </div>
        )}
      </SettingsRow>
    </>
  );
}
