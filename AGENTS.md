# Working in this repo

The CCS website: Vite + React 19 + TypeScript, TanStack Query v5, React Router v6 and Tailwind v4
(CSS-first theme in `src/index.css`). The API is the read-only sibling repo `../tournament-bot`; its
`docs/API.md` is the contract. Do not derive data the API already answers.

Do not run `pnpm`, `npm`, `node`, `npx` or `ts-node`. Humans run the toolchain — pnpm is the package
manager. After edits, you can ask the human to run `pnpm build` and paste the output. There is no test framework.

## Fast map

- `src/components/ui/color-picker.tsx`: shared shadcn-style color popover, re-exported as
  `ColorField` from `admin/adminUi.tsx` for team create/edit, applications, and admin imports.
  Uses `react-colorful` for the canvas, hue slider, and hex input. Only six-digit opaque hex values
  reach form state; three-digit shorthand expands on blur, and incomplete input resets on blur.
  Keep `intFromHex`'s pure-black nudge in the API layer and the live `TeamStylePreview` in the forms.
- `src/components/content/MarkdownEditor.tsx`: current shared controlled Markdown textarea for
  `content/ArticleEditor.tsx` (14 rows, article preview) and
  `league/applications/ApplicationsSection.tsx` (8 rows, notes preview). Write/Preview switches
  unmount the textarea; image insertion uses `ImageUploadButton` and the textarea's selection when
  upload completes. League Info still uses a separate textarea in `league/info/InfoSection.tsx`.
  The parent forms own saving; previews use the shared `Markdown` renderer.
- `src/components/Markdown.tsx`: shared renderer for articles, league Info and application notes,
  including editor previews. Images support `![Description](url "width=256")`: an exact title of
  `width=N` (1–9999 pixels) sets display width, capped by the container with automatic height.
  Ordinary titles remain tooltips; raw HTML stays disabled. This changes display size, not file size.
- `src/main.tsx`: providers and every route. Public player profiles are `/players/:profileId`; first-time
  identity setup is `/setup`. Routes are declared under three layout routes — `SiteLayout ticker`,
  `SiteLayout`, and `BareLayout` for the full-bleed pages (`/match`, `/game`, `/teams`, `/register`,
  `/login`) that draw no nav or footer. Every page but `Home` is a `lazy()` chunk.
- `src/components/layout/SiteLayout.tsx` + `PageShell.tsx`: the chrome, split in two. The layout owns
  the ticker, nav, footer, mobile bar and the lazy `<Suspense>` boundary, and stays mounted across
  navigations within its group; `PageShell` is the page-side wrapper that publishes the content column
  width and any extra bottom padding to it. A page never mounts `ScoreboardTicker` itself.
- `src/lib/api/`: defensive API boundary, exported through `index.ts`. Anonymous reads use `http.ts`;
  credentialed writes use `credentialed.ts`.
- `src/lib/api/profiles.ts`: profile presentation limits/write, full career profile read, Riot account
  cards and public targeted refresh. Keep `ranked: []` (unranked) distinct from `ranked: null`
  (Riot unavailable). `career.teams` carries full `TeamRecord`s mapped with `client.ts`'s
  `mapTeamRecord`, while opponents carry compact `TeamMetadata`; `opponent` is the object and
  `opponentCode` the string; `career.laneMatchups` is per conference and never merged, keyed
  `(conf, profileId)`; `accolades` is career-wide even when `?conf=` scopes the statistics.
- `src/lib/api/auth.ts`: `/auth/me` identity including nickname, pronouns, pronunciation and
  `setupRequired`.
- `src/lib/queries.ts`: every query key/options object. Profile documents and account reads share
  `queryRoots.profiles`; the document is fresh for one minute and account cards for ten.
- `src/lib/authContext.tsx`: cookie-session identity and Discord/Riot OAuth flows.
- `src/components/auth/UserMenu.tsx` + `AuthControl.tsx`: shared account actions for desktop and
  mobile. `useHasInvitations` in `src/hooks/useInvitations.ts` shows Team Invitations only when the
  signed-in profile's inbox is nonempty (answered invitations count). `queries.myInvitations` keys
  the private inbox by profile ID; the `/team-invitations` route remains available for direct links.
- `src/components/auth/SetupGate.tsx`: one route-tree hard gate for incomplete signed-in profiles.
- `src/pages/LeagueAdmin.tsx`: filters the League Admin section registry by the selected conf's
  effective scopes before passing it to `SettingsShell`. Info, Team Applications and Accolades require
  league `admin`; Teams requires `roster`; Schedule and Bracket require `schedule`. Site admins see all.
  Direct links to hidden sections redirect through the shell to the first visible section; a grant
  with no visible section shows a notice. `hasScope` preserves legacy behavior if `/auth/me` has no
  scope list. The sibling API currently allows `roster` on application review and should be aligned
  with the intended page permission before treating this UI filter as an authorization boundary.
- `src/components/profile/ProfilePresentationForm.tsx`: the only nickname/pronouns/pronunciation
  editor. Setup and Settings both use it; all three fields are website-required even though the API
  can represent nullable legacy pronouns/pronunciation.
- `src/components/profile/PlayerLink.tsx`: the only way to render a player name when a `profileId`
  exists. It owns `/players/` paths and falls back to plain content when identity is absent.
- `src/pages/PlayerProfile.tsx`: public cross-season profile — a rail (accounts, roles, champion
  pool, lane matchups, teams) beside a wide column (career tiles, personal bests, match history). It
  renders API-owned totals, bests, breakdowns, games and series in served order; `?conf=` scopes it.
  One request answers the page; the joins are map lookups over that payload, never extra fetches.
  Both grid columns carry `min-w-0`: the game grid is deliberately wider than a phone, and without
  it that width escapes to the document and horizontally scrolls the whole page out from under the
  sticky nav. Wide content scrolls inside its own `overflow-x-auto`, never at page level.
  Career tiles omit games/record/win-rate/KDA because the identity header already carries them.
- `src/components/profile/profileUi.tsx`: the profile's shared vocabulary — `RailCard`,
  `ProfileSection`, `TeamLogo`/`TeamChip`, `useConfLabel()` (conf slugs are never shown to readers),
  `metricText`, `kdaText` (KDA's `Infinity` reads "Perfect"), `avgKdaText`, and the
  `winRateTone`/`kdaTone` colour scales — the only colour-coded stats on the page. Every KDA goes
  through `kdaText`. Win/loss row tints match `MatchResultList`'s `/20` and `hover:/30`.
- `src/components/profile/MatchupCard.tsx`: lane opponents. Merges the API's per-conference rows by
  opponent — counts sum exactly, but `gd14` is an average with an unserved denominator and is shown
  only when one league contributed it.
- `src/components/profile/MatchHistory.tsx`: series and games as one list, joined through
  `matches[].gameIds`. Series order is the API's; games sort G1-first within a series. The series
  header is three separate targets (both teams, the score) rather than one wrapping link — team
  chips are `w-fit` so their hitboxes hug the name.
- `src/lib/gameAssets.ts` + `src/hooks/useGameAssets.ts`: Community Dragon item and spell lookups.
  Deliberately unimported — the build panel they were written for was cut, and they are kept for the
  next surface that shows a build. Not dead code.
- `src/lib/game/events.ts` + `src/components/game/timeline/EventText.tsx`: Riot emits
  `DRAGON_SOUL_GIVEN` both when the map becomes an elemental Rift (`teamId: 0`) and when a side
  claims the Soul (`teamId: 100` or `200`). The Rift event has no associated side.
- `src/components/players/`: reusable `PlayerPicker`, `PlayerSlot`, and `PlayerList` with required
  `profile`/`riot`/`discord` mode. External modes require typed adapters from `pickerTypes.ts`.
  `PlayerIdentity.tsx` owns player labels, API-served badges, avatar fallbacks and result rows; selected
  names use `PlayerLink`, while result buttons never nest links. Riot mode previews verified accounts
  before acceptance; complete IDs always offer explicit lookup alongside profile matches. Failed
  acceptance requires a fresh preview. Discord mode preserves independent source errors. No league
  membership checkbox/filter; the accolade editor's separate conference filter remains unchanged.
  Riot-mode search rows show the API's `primaryRiotId` beneath the website name and distinguish
  `matchedRiotIds` for alternate-account matches. All picker modes and the import picker hide profile
  numbers and Discord snowflakes in results/selected values; Discord context is the @handle only.
  Nameless profiles use `Unnamed player`, never an ID fallback. `mapGuildCandidate` falls back to the
  Discord username or `Unnamed Discord member`, never the snowflake. Never treat a match as the primary or load the
  accounts endpoint per search hit. The sibling API serves matched IDs; primary ID enrichment is
  still pending (see `docs/player-picker-api.md`).
- `src/components/league/teams/TeamsSection.tsx`: starters/subs use Riot mode, owner/contacts use
  Discord. `useRosterPlayerSources.ts` owns conference/session authorization, private query cleanup
  and resolver invalidation. `rosterInput` stays ID-only for writes and dirty checks; refreshed server
  summaries update presentation by matching ID without replacing unsaved identities/order. Existing
  legacy selections remain visible. On narrow screens the team logo/name have their own header row.
- `src/lib/api/teamAdmin.ts`: team writes and roster identity adapters. The sibling API now implements
  create/edit, Riot preview/acceptance (`routes/tournaments/teamPlayers.ts`), Discord lookup/resolution
  (`teamDiscord.ts`), and summary/search enrichment. Deployment remains unverified. Discord search's
  wire `website` group maps to frontend `profiles`; guild hits carry a nested `profile` for saved
  presentation. Contracts and remaining primary-Riot-ID enrichment are in `docs/player-picker-api.md`. Never fall back to
  expectation-free Riot resolution. Private lookups use no-store transport, viewer/conf query keys,
  zero retention and no automatic retry. Public profile-search keys include the identity filter.
- `src/components/admin/applications/PersonPicker.tsx`: application import's combined global profile
  and Discord guild search. It carries `PersonIdentity` until submission; import resolves snowflakes
  to profiles. Its site-admin guild route cannot serve league staff with only `roster` scope, and its
  profile results can include people without Discord. It shares identity/result UI with the roster
  picker, but still defers profile creation until import. Public search exposes no snowflake; a
  missing cached handle does not establish missing Discord.
- `../tournament-bot/docs/API.md` now links to `docs/api/reference/index.md` and feature references;
  follow those for current contracts rather than searching the former single-file reference.
- `src/components/profile/RiotAccountCards.tsx`: shared Riot identity/rank cards. The highest-ranked
  account (`primaryAccount`) renders tall with a single headline rank block; the rest render as one
  compact line each. Riot's ladder has no ordering in its own API — `rankScore` in
  `lib/api/profiles.ts` is where the tier list lives, and `tierLabel` drops the meaningless `I` Riot
  sends for the apex tiers. **Peak rank is not available** — Riot serves only current standing and
  nothing stores history; see §9.4 of the gap analysis.
  `RiotAccountCard` is exported for single-account metadata displays (Riot ID, icon, level, ranks).
  `queries.profileAccounts` separates verified `accounts` from self-reported `unverifiedAccounts`;
  claims cannot establish roster identity or verification. `lib/api/playerSummary.ts` shares
  `PlayerSummary` and its mapper across profile search, resolution and `client.ts`'s `mapRosterSlot`.
  API-selected avatar/source and verification survive save/reload; absent metadata maps to null/false,
  never an inferred badge. `profiles.ts` exports its account-detail mapper for Riot previews. The sibling API's
  `database/profiles/riotAccounts.ts` has `getSavedAccountDetailsMany()` for batched cached icons
  and ranks; avoid fetching live Riot details for every autocomplete result.
- `src/pages/Setup.tsx`: first-time public presentation setup.
- `src/components/settings/profile/AccountSection.tsx`: later edits to the same public presentation
  document plus read-only Discord identity.
- `src/components/settings/profile/ConnectionsSection.tsx`: signed-in linked Riot accounts.
- `src/components/settings/profile/UnverifiedAccounts.tsx` + `IconVerification.tsx`: claim a Riot
  account, then prove it by profile icon. Upstream's three limits (fifteen-minute challenge,
  ten-second cooldown, thirty checks) are held as wall-clock instants, never counters. Riot's copy of
  a profile lags the client by about two minutes, so a `pending` straight after the save is expected —
  the copy tells the player to wait before the first Check, and must keep saying so.
- `src/lib/riot/verificationIcons.ts`: English client search names for the API's verification icon
  pool (IDs 0–28), sourced from Community Dragon. Keep in sync with the API's pool; unknown IDs use
  artwork instructions. Known names remain usable when the verification artwork fails to load.

## Core conventions

- Import API values from `src/lib/api/index.ts`; one module per API area.
- Dates stay ISO strings through the API layer. Parse only at the render point.
- Render served row order unless a documented interactive table explicitly owns sorting.
- Every query key lives in `src/lib/queries.ts`. Mutations invalidate the owning root.
- Never call `fetch` from a component.
- A `profileId` is durable player identity. Names are presentation and must never be used as join keys.
  Any player name with a usable profile id uses `PlayerLink`; surfaces lacking the id remain plain text.
- Reuse `PageShell`, settings primitives, `ACTION*`, `LABEL_CLASS`/`CONTROL_CLASS`, `TeamLink`,
  `PlayerLink`, `ChampionIcon`, and the shared profile/account components before writing local copies.
- Tailwind utilities only, using theme tokens. No raw colors or inline color styles except data-driven
  branding/stat visualization values already established by the code.
- API errors render verbatim via `errorMessage`/`ErrorLine`.
- Real navigation uses `Link`; internal ordinals such as `seasonDay` are never reader-facing labels.
- Public profile account refresh keeps cached data visible, distinguishes every refresh status, and
  never converts unavailable rank into unranked.

## Maintaining this file

When code changes add or move a route, API module, query family, shared component, or non-obvious
behavioral rule, update this map in the same change. Prefer centralized components and helpers over
duplicating frontend behavior.
