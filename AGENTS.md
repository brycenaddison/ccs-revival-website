# Working in this repo

The CCS website: Vite + React 19 + TypeScript, TanStack Query v5, React Router v6 and Tailwind v4
(CSS-first theme in `src/index.css`). The API is the read-only sibling repo `../tournament-bot`; its
`docs/API.md` is the contract. Do not derive data the API already answers.

Do not run `pnpm`, `npm`, `node`, `npx` or `ts-node`. Humans run the toolchain — pnpm is the package
manager. After edits, you can ask the human to run `pnpm build` and paste the output. There is no test framework.

## Fast map

- `components.json`: shadcn/ui CLI configuration (Radix/new-york, Tailwind v4, existing CCS theme).
  The local `shadcn` dev dependency generates components with `pnpm exec shadcn add <component>`;
  humans run that command. `@/` resolves to `src/` in TypeScript and Vite, and the shared `cn` helper
  is `src/lib/cn.ts`. Generated imports must use `@/lib/cn`, never the unrelated npm package `cn`.
  Preserve the site's theme mappings when adapting generated components.
- `src/components/ui/color-picker.tsx`: shared shadcn-style color popover, re-exported as
  `ColorField` from `admin/adminUi.tsx` for team create/edit, applications, and admin imports.
  Uses `react-colorful` for the canvas, hue slider, and hex input. Only six-digit opaque hex values
  reach form state; three-digit shorthand expands on blur, and incomplete input resets on blur.
  Keep `intFromHex`'s pure-black nudge in the API layer and the live `TeamStylePreview` in the forms.
- `src/components/content/ArticlesSection.tsx`: Content Admin switches between the filtered article
  list and `ArticleEditor`, like Season Structure. Opening or leaving a form focuses its heading
  without scrolling, then reveals only an offscreen header with `block: "nearest"`. Never align the
  full form to the top: that jumps down when the header is already visible. Back/Cancel preserves
  the list's status filter.
  The open record is independent of that list; saves return the API's full record so publishing or
  unpublishing under a status filter keeps the editor open. Key forms by identity, never list refreshes.
- `src/components/content/MarkdownEditor.tsx`: shared CodeMirror editor for article bodies and league
  Info (`size="document"`, preferred 420 px), and application notes (`size="notes"`, 320 px).
  It owns Write/Preview, accessible vertical resizing and a Radix full-screen dialog; Split is offered
  at 960 px of editor width and falls back to Write on narrow screens. Parents still own saving and
  preview presets (`article` for articles, `notes` for both league fields). No editor save requests.
  Article previews share `index.css`'s `--container-article` (760 px) with `pages/Article.tsx` and
  match SiteLayout's side padding (12 px mobile, 32 px desktop). Cap the entire rendered body,
  including images and tables, in every preview mode; the paragraph-only 75ch cap is for notes.
- `src/components/content/markdown/useMarkdownSession.ts`: one state/history/selection session across
  view remounts and mode changes. Parent echoes preserve history; external replacements and explicit
  `resetKey` changes clear history and insertion bookmarks. Keep record/conference forms keyed.
  Presentation changes wait for IME composition. Image bookmarks map through intervening edits and
  collapse when their selected text changes; reset/unmount invalidates late upload completion.
  Images insert inline without adding whitespace, leaving the caret in the description brackets.
  Tables and links also use insertion bookmarks; table dimensions count the header as the first row.
  `ImageUpload.tsx` exports the shared `useImagePicker`; capture `openForInsertion`'s callback before
  opening the native picker, and keep this hook mounted across editor presentation changes.
- `src/components/content/markdown/commands.ts`: the single command registry for the toolbar, keyboard
  shortcuts and context menu. Formatting transactions are isolated undo steps; inline formatting is
  per paragraph, line commands preserve indentation, and existing code blocks disable formatting.
  `MarkdownContextMenu.tsx` forwards mouse/keyboard invocation to an inert Radix trigger: never wrap
  the source in a Radix trigger, whose touch handler suppresses native mobile text selection. Shift +
  right-click bypasses the custom menu. Use shadcn/ui's `ui/context-menu.tsx` for right-click and
  `ui/dropdown-menu.tsx` for Heading, Lists and More; menu selection runs after close so focus can
  return to the source or Link popup. Image opens directly in the user gesture for mobile pickers.
  `MarkdownToolbar.tsx` keeps its primary actions visible and wraps on narrow screens. More contains
  only inline code, block quote, code block, table and horizontal rule; never duplicate toolbar
  actions there. Heading options use uniform styling in both the dropdown and context menu.
  `TableSizePicker.tsx` provides the shared 8×8 pointer/keyboard grid inside the shadcn Popover.
  Table uses that picker from either menu; `commands.ts` owns dimensions and Markdown generation.
  Other shared Radix wrappers live in `ui/dialog.tsx` and `ui/toolbar.tsx`. CodeMirror styling stays
  in scoped Tailwind utilities; overrides of its unlayered default styles need the important suffix.
  Keep editor imports lazy.
- `src/components/Markdown.tsx`: shared renderer for articles, league Info and application notes,
  including editor previews. Images support `![Description](url "width=256")`: an exact title of
  `width=N` (1–9999 pixels) sets display width, capped by the container with automatic height.
  Ordinary titles remain tooltips; raw HTML stays disabled. This changes display size, not file size.
- `src/pages/Article.tsx` + `src/components/news/ArticleLink.tsx`: native articles render public API
  Markdown at `/news/:slug`; link articles send readers off-site and their local route has no full
  body. `src/lib/api/articles.ts` owns both reads and content writes; published detail includes
  title, subtitle, author, image, publishedAt and updatedAt for future shared SEO metadata.
  `src/pages/News.tsx` currently increases `limit` for Load more, but the API caps it at 50; use
  offset pagination and crawlable page links when fixing archive discovery.
- SEO baseline: `index.html` is an empty app shell with one shared title; `src/main.tsx` uses
  `createRoot`, and `.github/workflows/deploy.yml` publishes static Vite output. No prerendering,
  shared page metadata, sitemap or robots.txt is generated here. `SetupGate` waits for the session
  before public pages mount. Only `NotFound.tsx` currently adds `noindex`; missing article slugs
  render their own notice without it. Any static article generation must refresh on publish,
  edit, unpublish and delete, and enumerate public posts across conferences with API pagination.
- `src/main.tsx`: providers and every route. Public player profiles are `/players/:profileId`; first-time
  identity setup is `/setup`. Routes are declared under three layout routes — `SiteLayout ticker`,
  `SiteLayout`, and `BareLayout` for the full-bleed pages (`/match`, `/game`, `/teams`, `/register`,
  `/login`) that draw no nav or footer. Every page but `Home` is a `lazy()` chunk.
- `src/components/layout/SiteLayout.tsx` + `PageShell.tsx`: the chrome, split in two. The layout owns
  the ticker, nav, footer, mobile bar and the lazy `<Suspense>` boundary, and stays mounted across
  navigations within its group; `PageShell` is the page-side wrapper that publishes the content column
  width and any extra bottom padding to it. A page never mounts `ScoreboardTicker` itself.
  The content scroller must stay `relative`: hidden absolute inputs and menu triggers otherwise escape
  its overflow boundary, enlarging the document and adding an outer scrollbar with empty space.
- `src/lib/api/`: defensive API boundary, exported through `index.ts`. Anonymous reads use `http.ts`;
  credentialed writes use `credentialed.ts`.
- `src/pages/MatchDetail.tsx` + `components/match/TournamentCodes.tsx`: show API-supplied tournament
  codes prominently below the match header, in served game order. `feed.ts`'s result read sends the
  session and uses `no-store`; `queries.matchResult` includes the viewer profile ID and has zero
  retention. The API decides visibility; omitted codes render nothing. `schedule.ts`'s `mapMatchCode`
  is shared with the admin read, and `components/CopyAction.tsx` owns clipboard feedback for both.
- `src/components/home/UpcomingSchedule.tsx`: the five upcoming fixtures also supply the signed-in
  viewer's "Your upcoming match" card above the list. Reuse `queries.teamsForConf` for the feed's conferences,
  match membership by profile ID and teams by `(conf, code)`, and take the first match in served order.
  `lib/roster.ts`'s `teamMembers` includes starters, substitutes, contacts and owners; delivery reports
  reuse it for player labels. Anonymous viewers and viewers without a matching team get no extra card.
  Remove the featured fixture from Upcoming by `feedMatchKey`; hide the list when none remain.
  `UpcomingMatchCard.tsx` renders large team badges/names and phase, phase-relative match day and best-of.
  Only that card reads the viewer-scoped match result to check tournament-code availability.
  The current match API has no draft-link field; do not infer a draft URL from a tournament code.
- `src/components/league/schedule/CodeDeliveryControl.tsx`: shared day/match Discord delivery action
  and recipient report. `sendDayCodes`/`sendMatchCodes` in `lib/api/schedule.ts` POST an empty object;
  they do not mint codes. A 409 `not_ready` means nothing was sent and lists readiness issues.
  HTTP 200 can include partial failures: preserve every recipient status. Explicit retries skip
  successful recipients; `unknown` and `in_progress` require inspection, never automatic retry.
  Delivery changes no read model. Key `DayPanel` by conference/day so reports cannot follow selection.
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
