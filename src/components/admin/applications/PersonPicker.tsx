/**
 * Naming a person for an import: the submitter, or one member of the staged roster.
 *
 * One search box, two sources, because the people on an external form fall into two groups and
 * neither search finds both. Somebody who has never visited the site has no profile and can only be
 * found in the **CCS Discord** (the site-admin guild search, `queries.adminGuildSearch`); somebody who
 * has signed in, or was picked up by a match ingest, has a **profile** and may since have left the
 * guild (`queries.profileSearch`, unfiltered, for the same reason the roster editor's picker is). The
 * results are shown in two groups under one input rather than behind a toggle, so the admin does not
 * have to know which kind of person they are looking for before they type.
 *
 * A pick is carried as a `PersonIdentity`, a discriminated union the wire `PersonRef` is built from
 * at send time, plus the label and face the row needs to stay legible. Only the id ever goes to the
 * server; the name is the server's to resolve.
 *
 * **The same person can be picked twice under two identities**, once by snowflake and once by
 * profile id, and nothing here can tell. `taken` marks a repeat of the *same* identity; the server
 * resolves both to a profile and refuses `duplicate_member` for the case this cannot see.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { ACTION_SM } from "../adminUi";
import { CONTROL_CLASS, LABEL_CLASS } from "../../stats/FilterBar";
import { discordAvatarUrl } from "../../apply/applyUi";
import { PlayerIdentity, PlayerResultRow } from "../../players/PlayerIdentity";
import { useDebounced } from "../../../hooks/useDebounced";
import { queries } from "../../../lib/queries";
import {
  errorMessage,
  GUILD_SEARCH_MIN,
  PROFILE_SEARCH_MIN,
  type PersonRef,
} from "../../../lib/api";

/** Who was picked, by the one key that source has for them. */
export type PersonIdentity =
  | { kind: "discord"; userId: string }
  | { kind: "profile"; profileId: number };

export interface PickedPerson {
  identity: PersonIdentity;
  /** Guild display name, or profile name; falls back to the username or the id. */
  name: string;
  /** Discord username, or the profile's cached handle. */
  handle: string | null;
  /** A finished image url, or null for a profile with no avatar. */
  avatar: string | null;
  verified?: boolean;
}

/** The wire shape: exactly one of `discordUserId` or `profileId`. */
export function toPersonRef(identity: PersonIdentity): PersonRef {
  return identity.kind === "discord"
    ? { discordUserId: identity.userId }
    : { profileId: identity.profileId };
}

/** A stable key for "already picked" checks. Distinct identities stay distinct, see the header. */
export function identityKey(identity: PersonIdentity): string {
  return identity.kind === "discord"
    ? `discord:${identity.userId}`
    : `profile:${identity.profileId}`;
}

/** Both floors are two characters today; the max is what keeps a future divergence from `400`ing. */
const SEARCH_MIN = Math.max(GUILD_SEARCH_MIN, PROFILE_SEARCH_MIN);

interface SearchProps {
  id: string;
  taken: ReadonlySet<string>;
  onPick: (person: PickedPerson) => void;
  /** Absent when there is nothing to go back to: the slot is empty and the search is the slot. */
  onCancel?: () => void;
}

function PersonSearch({ id, taken, onPick, onCancel }: SearchProps) {
  const [term, setTerm] = useState("");
  const query = useDebounced(term, 300).trim();

  const guild = useQuery(queries.adminGuildSearch(query));
  const profiles = useQuery(queries.profileSearch(query, null));

  const searching = guild.isFetching || profiles.isFetching;
  const current = query === term.trim();
  const guildHits = current && !guild.isPlaceholderData && !guild.error ? guild.data ?? [] : [];
  const profileHits = current && !profiles.isPlaceholderData && !profiles.error ? profiles.data ?? [] : [];
  const settled = query.length >= SEARCH_MIN && !searching;
  const nothing = current && settled && !guild.error && !profiles.error && guildHits.length === 0 && profileHits.length === 0;

  return (
    <div className="rounded-md border border-border bg-bg3 p-3">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            size={14}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-dim"
          />
          <input
            id={id}
            value={term}
            onChange={e => setTerm(e.target.value)}
            placeholder="Discord name, site name or profile id"
            autoComplete="off"
            autoFocus
            className={`${CONTROL_CLASS} pl-8`}
          />
        </div>
        {onCancel && (
          <button type="button" onClick={onCancel} className={ACTION_SM}>
            Cancel
          </button>
        )}
      </div>

      {term.trim().length > 0 && query.length < SEARCH_MIN && (
        <p className="mt-1.5 text-xs text-text-dim">Keep typing, {SEARCH_MIN} characters minimum.</p>
      )}
      {searching && <p className="mt-1.5 text-xs text-text-dim">Searching…</p>}

      {/* The one failure that does not implicate the other half: the bot being offline (`503`) or
          the route not existing yet (`404`) loses the Discord group and nothing else, so it is a note
          beside the profile results rather than an error that hides them. */}
      {guild.error && (
        <p className="mt-1.5 text-xs text-ccs-orange">
          Couldn't search Discord: {errorMessage(guild.error)}. Site profiles below still work.
        </p>
      )}
      {profiles.error && (
        <p className="mt-1.5 text-xs text-ccs-orange">
          Couldn't search profiles: {errorMessage(profiles.error)}.
        </p>
      )}

      {guildHits.length > 0 && (
        <div className="mt-2">
          <span className={LABEL_CLASS}>In the CCS Discord</span>
          <ul className="max-h-48 overflow-y-auto rounded-md border border-border">
            {guildHits.map(hit => {
              const identity: PersonIdentity = { kind: "discord", userId: hit.userId };
              return (
                <li key={hit.userId}>
                  <PlayerResultRow
                    player={{ profileId: null, name: hit.displayName, avatar: discordAvatarUrl(hit.userId, hit.avatar), verified: false }}
                    detail={hit.username ? `@${hit.username}` : hit.userId}
                    annotation={taken.has(identityKey(identity)) ? "already listed" : undefined}
                    onSelect={() =>
                      onPick({
                        identity,
                        name: hit.displayName,
                        handle: hit.username || null,
                        avatar: discordAvatarUrl(hit.userId, hit.avatar),
                      })
                    }
                  />
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {profileHits.length > 0 && (
        <div className="mt-2">
          <span className={LABEL_CLASS}>Site profiles</span>
          <ul className="max-h-48 overflow-y-auto rounded-md border border-border">
            {profileHits.map(hit => {
              const identity: PersonIdentity = { kind: "profile", profileId: hit.profileId };
              const name = hit.name ?? `Profile ${hit.profileId}`;
              return (
                <li key={hit.profileId}>
                  <PlayerResultRow
                    player={hit}
                    detail={[hit.handle ? `@${hit.handle}` : null, `Profile ${hit.profileId}`].filter(Boolean).join(" · ")}
                    annotation={taken.has(identityKey(identity)) ? "already listed" : undefined}
                    onSelect={() =>
                      onPick({ identity, name, handle: hit.handle, avatar: hit.avatar, verified: hit.verified })
                    }
                  />
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {nothing && (
        <p className="mt-1.5 text-xs text-text-dim">
          Nobody matches that in the CCS Discord or among site profiles. Somebody who has never
          joined the server and never signed in cannot be placed until they do one or the other.
        </p>
      )}
    </div>
  );
}

interface PickerProps {
  id: string;
  value: PickedPerson | null;
  onChange: (person: PickedPerson | null) => void;
  /** Identity keys already used on this form, so a repeat is marked in the results. */
  taken: ReadonlySet<string>;
}

/** One person: who it is, with Change and Clear, or the search while nobody is chosen. */
export function PersonPicker({ id, value, onChange, taken }: PickerProps) {
  const [searching, setSearching] = useState(false);

  if (value === null || searching) {
    return (
      <PersonSearch
        id={id}
        taken={taken}
        onPick={person => {
          onChange(person);
          setSearching(false);
        }}
        onCancel={value === null ? undefined : () => setSearching(false)}
      />
    );
  }

  return (
    <div className="flex items-center gap-2.5 rounded-md border border-brand/50 bg-bg2 px-3 py-2">
      <span className="min-w-0 flex-1 truncate text-sm text-text-bright">
        <PlayerIdentity player={{ profileId: value.identity.kind === "profile" ? value.identity.profileId : null,
          name: value.name, avatar: value.avatar, verified: value.verified === true }} />
        {value.handle && value.handle !== value.name && (
          <span className="ml-2 text-xs text-text-dim">@{value.handle}</span>
        )}
        <span className="ml-2 font-mono text-[10px] text-text-dim">
          {value.identity.kind === "discord" ? "Discord" : `profile #${value.identity.profileId}`}
        </span>
      </span>
      <button type="button" onClick={() => setSearching(true)} className={ACTION_SM}>
        Change
      </button>
      <button
        type="button"
        onClick={() => onChange(null)}
        title="Clear"
        className={ACTION_SM}
      >
        <X size={13} aria-hidden="true" />
      </button>
    </div>
  );
}
