# Player picker integration

The frontend implements `profile`, `riot`, and `discord` modes in
`src/components/players/`. Team starters and substitutes use Riot; owner and
contacts use Discord. The application import only shares presentation components
and still resolves its `PersonRef` values on import.

The sibling API now implements team create/edit, Riot preview/acceptance, Discord
search/resolution, identity filtering, and summary enrichment. Its picker routes
are in `routes/tournaments/teamPlayers.ts` and `teamDiscord.ts`. The additional
`primaryRiotId` search field described below still requires backend implementation.
The website does not fall back to the legacy resolver when preview-aware
acceptance fails. Deployment and authenticated live behavior remain unverified.

## Shared presentation

Search, resolution, and hydrated roster values use this projection:

```ts
type PlayerSummary = {
  profileId: number; // public profile search may use `id` instead
  name: string | null;
  avatar: string | null; // finished image URL selected by the server
  avatarSource: "discord" | "riot" | null;
  verified: boolean; // saved Discord association AND verified Riot account
};
```

`src/lib/api/playerSummary.ts` maps every boundary. Absent presentation metadata
falls back to null/false for older responses. Only IDs enter roster writes.
All picker modes hide profile numbers and Discord snowflakes in their displayed
identity details; Discord context uses @handles. Nameless profiles display
`Unnamed player`. Internal IDs still identify selections, links, and write payloads.
The server chooses Discord/default avatars for Discord-linked profiles and a
cached representative Riot icon otherwise, using batched metadata. The browser
does not infer verification or fetch accounts for each autocomplete result.

`GET /profiles/search?q=...&identity=riot|discord` retains its array response,
adding the summary fields, nullable `handle`, nullable `primaryRiotId`, and
`matchedRiotIds: string[]`. Riot-mode results show the primary Riot ID beneath
the saved website name. Matching alternate accounts are labeled separately;
the first matching ID is never treated as the primary. Omit `identity` for
unrestricted profile mode. Filter before limits; Riot matching includes saved
verified-account IDs, never claims. The existing `conf` parameter remains
available to the separate accolade editor.

The sibling API now implements identity filtering, summary enrichment, and
`matchedRiotIds`, but still needs to add `primaryRiotId`. Choose it from batched
cached metadata for all result profiles (including Discord-linked profiles),
using the primary-account policy: highest known current rank, otherwise first
account with an icon, otherwise saved account order. Return that account's
canonical `GameName#TAG` or null if its name is unavailable. This is independent
of the query and the avatar's fallback account. The frontend does not issue
per-result account requests or infer a primary ID from a profile display name.

## Roster routes

All routes below require a session and roster permission for `conf` or site-admin
access. `conf` authorizes the request; results are global. Private responses must
be `no-store`. Frontend query keys include conference and signed-in profile ID;
private cached queries are removed when the authorization context closes or changes.

| Route under `/tournaments/:conf/teams` | Input | Response |
| --- | --- | --- |
| `POST /players/preview` | `{ gameName, tagLine }` | `{ account: LinkedAccount, profile: PlayerSummary \| null }` |
| `POST /players/resolve` | `{ profileId }` OR `{ gameName, tagLine, expectedPuuid, expectedProfileId }` | `PlayerSummary` |
| `GET /discord/search` | `?q=...` | Independent `website` and `guild` sources, below |
| `POST /discord/resolve` | `{ profileId }` OR `{ discordUserId: string }` | `PlayerSummary` |

The preview account is the existing wire detail shape (`puuid`, canonical
`riotId`, nullable `summonerLevel`/`profileIconUrl`, and `ranked`). `ranked: []`
means unranked; `null` means unavailable. Preview must establish account identity
without creating a profile or claim. Optional detail failures do not prevent
acceptance. `profile: null` must be explicit; an absent/malformed association is
an invalid preview. Existing-profile previews use `/profiles/:id/accounts` and
only its verified `accounts` collection.

Acceptance must revalidate the current PUUID and owning profile against both
expectations before writing, returning a conflict for changed identity. A null
`expectedProfileId` means the preview found no profile. Existing-profile acceptance
checks that it still has verified accounts. Preserve saved names, including null.
The frontend never sends the legacy expectation-free shape.

Discord search's exact source envelope is:

```ts
type Source<T> =
  | { status: "ok"; results: T[] }
  | { status: "unavailable"; error: string };
type DiscordSearch = {
  website: Source<PlayerSummary & { discordUserId: string; handle: string | null }>;
  guild: Source<{
    userId: string;
    displayName: string;
    username: string;
    avatar: string | null; // Discord avatar hash, as in GuildMemberCandidate
    profileId: number | null;
    profile: PlayerSummary | null; // saved website name, avatar and verification
  }>;
};
```

Wire summaries may use `id`; the shared mapper normalizes it to `profileId`.
The frontend calls the website group `profiles` internally and accepts the
original proposed `profiles` wire key for compatibility. A guild hit's nested
profile supplies its saved presentation when it has a website identity.

The server filters Discord-linked profiles before the 25-result cap, excludes
bots, limits guild hits to ten, and deduplicates sources by identity, preferring
the website profile's saved presentation. Preserve order. Source outages use
`unavailable`; authorization failures fail the whole request. The website retains
successful website results during a guild outage. Numeric snowflakes use exact
saved-identity/member lookup; the frontend offers an explicit action for 17–20
digit input and never converts it to a JavaScript number.

Profile acceptance rechecks its saved Discord association and can work when the
bot is down or the person left the server. Guild selection always submits its
snowflake to recheck current non-bot membership before the unique-snowflake
upsert. Resolution creates no invitation, message, or roster assignment.

## Verification after deployment

Run `pnpm build` manually; repository instructions reserve the toolchain for
humans. There is no test framework. In League Admin, check these cases:

- Name and linked-ID search; a claim-only profile is ineligible. Exact Riot
  lookup remains available beside matching website results.
- Existing-profile and exact-account previews; Back creates nothing; invalid
  identity prevents acceptance; unavailable optional metadata remains legible.
- Accept a custom/null saved name and a new account; conflict requires a fresh
  preview. Check double-clicks, cancellation, fast input, and context changes.
- Discord-linked profiles outside the league, guild-only people, missing cached
  handles, source outages, departed members, and bot exclusion.
- Badge/avatar consistency through results, slots, chips, collapsed cards, save,
  and reload; broken artwork; rank unavailable versus unranked.
- Draft selection/order preservation during refetches; presentation refresh
  alone is clean. Check duplicate playing slots, shared administrative roles,
  list caps, clearing, discard, keyboard focus, Escape, and narrow screens.
