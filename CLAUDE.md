# Working in this repo

The CCS website. Vite + React 19 + TypeScript, TanStack Query v5, react-router-dom v6,
Tailwind v4 (CSS-first — the theme lives in `@theme` in `src/index.css`, there is no
`tailwind.config`). `lucide-react` for icons, and **shadcn/ui** for primitives — Radix under the
hood, copied into `src/components/ui/` rather than installed as a package. Everything above that
layer is written here. **pnpm** is the package manager — `pnpm-lock.yaml` is the committed
lockfile and CI installs with `--frozen-lockfile`.

The API is a separate repo, `tournament-bot` (sibling directory, `../tournament-bot`), whose
`docs/API.md` is the contract. Nothing here should re-derive something that file says the
server already answers.

---

## Read this file instead of exploring

This document is meant to replace a codebase survey. It is maintained to stay accurate — if
you find it wrong, fix it in the same change.

- **Do not spawn subagents** (`Agent`, `Task`, `Explore`, `Plan`) to look around this repo.
  Full-codebase exploration costs far more than it returns here; cost efficiency beats speed.
  Read the specific files named below with `Read`, and use `Grep`/`Glob` for anything else.
- Before writing a new helper, formatter, hook, or class string, **check the inventories
  below** — most of what you need already exists, and duplicating it is the failure mode this
  file exists to prevent.
- Don't `cat` whole large files to orient yourself. The map below tells you which file, and
  `grep -n "^export"` on it tells you what it offers.
- Every module in `src/lib/` opens with a header comment explaining *why* it is shaped the way
  it is. When a decision looks arbitrary, that comment is the answer — read it before changing
  the behavior.

---

## Repo map

### Entry & providers

| File | What it is |
| --- | --- |
| `src/main.tsx` | Router, `QueryClient` (60s default staleTime, no retry on 4xx), provider nesting: `QueryClientProvider` → `BrowserRouter` → `AuthProvider` → `LeagueProvider`. Every route is declared here, under one of three layout routes — `SiteLayout ticker`, `SiteLayout`, and `BareLayout` for the full-bleed pages that wear no chrome. `Home` is eager (it's the initial route); every other page is a `lazy()` chunk, and the `<Suspense>` they resolve against lives inside `SiteLayout` around the content column, not above `<Routes>`. |
| `src/lib/authContext.tsx` | `AuthProvider`, `useAuth()`. Session identity, roles, `hasRole`, `logout`, `refresh`, plus `verification` (which ownership proofs the deployment serves) and `canLinkRiot` (RSO, gated by the local `RIOT_LINKING_ENABLED` switch *and* the server). |
| `src/lib/leagueContext.tsx` | `LeagueProvider`, `useLeague()`, `useSeasonLink()`. Owns the `?conf=` param (`CONF_PARAM`, `CURRENT`) and the tournament list. Also `activeSource` — *which rule* decided the current season (`pinned` / `flagged` / `newest`). `GET /schedule`'s default is `tournaments.active` and nothing else, so `useFeedQuery` may leave the conf off only under `flagged`; under the env pin or the newest-season fallback it names `activeConfs` explicitly, or the ticker, Scores and Schedule go empty while every other tab shows the picker's season. |
| `src/lib/tabs.ts` | `TABS` — the nav registry. Tabs without `standalone` all render `Home`; `tabForPathname` resolves the active one. |
| `src/assets/` | Build-bundled artwork. `ccs-logo.png` is the shared desktop/mobile brand mark rendered by `NavBar`. |
| `static/` | Vite's configured `publicDir`: favicon files, Apple touch icon, Android/PWA icons, and `site.webmanifest`. Assets here are served and copied to the build root. |

Routes: `/` + the non-standalone `TABS` paths → `Home`; `/scores`, `/schedule`, `/stats`, `/info`,
`/teams/:conf/:code`, `/match/:id`, `/game/:matchId` and `/game/:matchId/:tab`, `/players/:profileId`, `/register`, `/login`,
`/setup`, `/team-invitations`, `/my-applications`, `/settings/:section?`, `/admin/:section?`,
`/league/:conf/admin/:section?`, `*` →
`NotFound`. The whole tree sits inside `SetupGate`, which holds a signed-in user with an incomplete
profile on `/setup` — and, since setup grew a second step, deliberately does **not** evict them the
instant the presentation write clears `setupRequired`. That write and the redirect out were the same
event, so anything after the save unmounted before it painted. The gate remembers that setup was
pending when this visit began and leaves the page to navigate itself; a completed profile that types
`/setup` later still goes to its player page.

`/team-invitations` is spelled that way because the **bot's invitation DM links to it literally** —
`tournament-bot/src/utils/teamInvitationDiscord.ts` builds `FRONTEND_URL + "/team-invitations"`.
Renaming it sends every invitation notification to the catch-all.

Three route groups, and the group is what decides a page's chrome:

- **`SiteLayout ticker`** — the non-standalone `TABS` paths, `/scores`, `/schedule`, `/stats`,
  `/info`, `/news`. Adding a public data tab means adding it here; a page never mounts
  `ScoreboardTicker` itself.
- **`SiteLayout`** — the same chrome without the strip: `/setup`, `/players/:profileId`,
  `/news/:slug`, `/register`, `/team-invitations`, `/my-applications`, `/settings`, `/admin`,
  `/league/:conf/admin`, `/content`, `/teams/:conf/:code`, `/match/:id`, `/game/:matchId` (+ `/:tab`),
  and `*`. The last three were full-bleed pages with their own header until 2026-09-02; they wear the
  nav now because a reader arriving from a Discord embed or a shared link had no way to the rest of the
  site. Each keeps a small back link (`useBackNavigation`) at the top of its content and declares its
  width through `PageShell`.
- **`BareLayout`** — `/login` only. It renders no nav and no footer; `BareLayout` exists to give its
  lazy chunk a `<Suspense>` boundary and nothing else.

`/game/:matchId` is the **match viewer** (`pages/GameDetail.tsx`), and its bare path is fixed twice
over: eight in-app links point at it and the bot's Discord embeds link `FRONTEND_URL/game/:matchId`.
Its four tabs (`lib/game/tabs.ts`: Scoreboard, Graphs, Builds, Timeline) are URL segments, because the
repo's tabs are `<Link>`s with `aria-current` and a tab's address should be shareable; the bare path
is the Scoreboard. The tab links navigate with `replace`, so flipping tabs adds no history and one
Back press leaves the viewer for wherever it was opened from. The page owns every fetch (`matchData`, `matchTimeline`, `gameContext`) and every
Community Dragon lookup, and hands them down through `components/game/GameView.tsx`
(`useGameView()`); the tabs never fetch, and three of them are lazy chunks because chart.js lives in
two. A `null` timeline is normal (Riot's retention window) and costs the Builds and Timeline tabs
their minute-by-minute data, never the page. A `null` context, which is every game until
`GET /m/:matchId/context` exists upstream (`API-GAP-ANALYSIS.md` §20), costs the team headers and the
profile links and nothing else.

The browser says `players` where the API says `profiles`: the public concept is a player, while
`profile` stays the server's durable identity model.

### API layer — `src/lib/api/`

Import from the barrel: `import { … } from "../lib/api"` (`index.ts` re-exports everything).

| File | Purpose |
| --- | --- |
| `http.ts` | **Anonymous** transport. `getList`, `getOne`, `post`, `ApiError`, `errorMessage`, `isAbort`, `API_BASE`. Never sends credentials — the public routes use a wildcard CORS origin, which a browser rejects on a credentialed request. |
| `credentialed.ts` | **Signed-in** transport. `credentialedRequest(path, {method, body})`, `SaveRejected`, `issuesOf`, `ValidationIssue`. Sends `credentials: "include"`; the JSON content type is the CSRF defense, not decoration. A `422` becomes `SaveRejected` carrying field-pointer issues. |
| `normalize.ts` | Boundary coercion: `num`, `numOrNull`, `ratio`, `fmtPct`, `fmtRatio`, `fmtSec`, `hexFromInt`/`intFromHex` (and its pure-black nudge), `colorSecondaryOf` (the optional-key spread every team mapper uses), `lighten`, `httpsUrl`, `sortValue`, plus the role vocabulary (`ROLE_ORDER`, `normalizeRole`, `roleLabel`, `sortByRole`). |
| `client.ts` | Public reads: tournaments, teams, standings, stats, records, match data. |
| `feed.ts` | The public fixture feed + one series in full (`scheduleFeed`, `matchResult`). **A conference with no phases is served from the `series` view**, so a `FeedMatch` can carry `scheduleMatchId: null` and null phase fields: no match page to link to, and `feedMatchKey` (fixture id, else the series key) is the identity every list keys and de-duplicates on. |
| `game.ts` | One game for the match viewer: `matchData` and `matchTimeline` are **pass-throughs** of Riot's documents (typed in `lib/riot/matchV5.ts`, envelope-checked by `isRenderableMatch`, never mapped), and `gameContext` is the league's context for them (conference, fixture, `TeamMetadata` per code, puuid → `profileId`). All three answer JSON `null` for a game that is not stored. **`/m/:matchId/context` does not exist upstream yet**; `getOne` resolves its `404` to `null` and the viewer degrades to Riot IDs and "Blue side" / "Red side". |
| `profiles.ts` | The player-profile surface. `GET /profiles/:id/accounts` is the only public read that hits Riot at request time, so entries degrade one at a time and `ranked: null` (Riot declined) is not `ranked: []` (unranked). `GET /profiles/:id?conf=` is the whole `/players/:id` page in one request. Three of its shapes are easy to get wrong: `career.teams` carries full `TeamRecord`s (mapped with `client.ts`'s `mapTeamRecord`, not a second mapper) while opponents carry compact `TeamMetadata`; `opponent` is the **object** and `opponentCode` the string, on games, series and personal bests alike; and `career.laneMatchups` is **per conference and never merged**, so `(conf, profileId)` identifies a row. `accolades` is career-wide *even when `?conf=` scopes the statistics*. It also owns the player-owned account writes: `unverifiedAccounts` are **claims, not identity** (display and the OP.GG link only — the same account may be claimed by several profiles until one proves it), and `checkIconVerification` returns upstream's `410`/`429`/`404` refusals **as values** rather than throwing, because those bodies carry a status and no readable message. It also owns `searchProfiles` — the **public** `GET /profiles/search`, whose optional `conf` narrows to profiles a published team in that conference references, and therefore *excludes* anyone unrostered rather than ranking them lower. |
| `uploads.ts` | `POST /uploads/images`. **The one write with its own `fetch`**, and it has to be: the route takes the raw file bytes as the body and reads the image type off `Content-Type`, which is exactly what `credentialed.ts` cannot do. Exports `uploadImage`, `UploadRejected` (every refusal already worded for a person — 5 MB, wrong type, 20/hour quota, storage unconfigured), and the type/size mirrors the picker filters against. |
| `info.ts` | League Info documents: public `GET /:conf/info`, draft-aware `GET /:conf/info/manage`, and complete-document `PUT /:conf/info`. Ordered quick links plus Markdown; writes require full admin access to that conf. **`rulebookUrl` is a required first-class field, not a quick link** — it cannot be identified by matching a label an editor can rename. The team application form does *not* read it from here: it comes off `GET /tournaments/applications/open`, which ignores publication (see `teamApplications.ts`). Upstream matches keys exactly, so `LeagueInfoInput` has to stay in lockstep with the server's `BODY_KEYS`. The document also stores **`applicationBody`**, the "before you apply" Markdown — the one key upstream treats as optional (absent reads as `null`), which is exactly why `LeagueInfoInput` makes it **required**: two editors write this document, and a `PUT` that omitted it would erase the other editor's field. |
| `seasonView.ts` | `GET /:conf/season` — the season **as rendered**. See below. |
| `season.ts` | `GET /:conf/phases` — the season's **structure**, site-admin only. See below. |
| `schedule.ts` | League-admin schedule surface: matches, forfeits, tournament codes, game linking. |
| `admin.ts` | Site-admin surface: `/admin/users`, `/admin/leagues`. The clearest small example of the write idiom — read it before adding a new mutating module. `GET /admin/leagues` is the **unfiltered** league list; `LeagueEdit.listed` is typed as the literal `false`, because upstream refuses `true` there. Also the season's two lifecycle switches, **site-admin only**: `setApplicationsOpen` (`PATCH /admin/leagues/:conf/applications`) and `listSeason` (`POST /admin/leagues/:conf/list`). They used to sit on `/tournaments` behind a conference `admin` grant; the old paths answer `404`. Their `409`s use the application surface's envelope, so `refusalOf` reads them. |
| `adminApplications.ts` | Site Admin → Import Applications: `importApplication` (`POST /admin/leagues/:conf/applications/import`, a draft owned by *another* profile with its roster staged as `pending`, un-DMed invitations), `sendApplicationInvitations` (`POST .../:id/invitations/send`, the DMs as a separate command), `discardApplication` (`DELETE .../:id`, because withdraw is the submitter's alone) and `searchGuild` (`GET /admin/guild/members/search`, the applicant's guild search without an application to scope it to). **None of the four exist upstream yet**; the contract is `admin-application-import-api-spec.md` (§22). Site-admin only, like the intake toggle: acting as somebody else is not one conference's data. People are named the way `InvitationInput` names them, exactly one of `discordUserId` or `profileId`. No read of its own: the list is `applicationQueue`, which a site admin passes. Reuses `mapApplication`, exported from `teamApplications.ts` for it. |
| `teamAdmin.ts` | League Admin → Teams writes: `POST /tournaments/:conf/teams` and `PATCH .../:id`, `roster` scope. **Neither route exists upstream yet** — the contract is `league-admin-teams-api-spec.md`, and the module is written ahead of it (§17). No read of its own: public `GET /teams/:conf` already carries every editable column, and both writes answer that same shape, so they reuse `mapTeamRecord`. Create is a complete strict document, edit is a partial patch — the two halves of that editor save on different schedules and a `PUT` would let a roster save clobber branding. |
| `teamApplications.ts` | The upcoming-season workflow: applicant drafts, Discord invitations, roster review, the publication command, and `applicationIntake` — the **`roster`-readable** `GET /tournaments/:conf/applications/intake` (`{conf, applicationsOpen, listed, teamsPublishedAt}`), which exists because the public tournament list cannot describe a hidden season and `/admin/leagues` would `403` a league admin. Everything here is `roster` scope; the intake and listing *switches* are `admin.ts`'s. Exports `refusalOf`, which lifts `issues` off a `409` — every refusal on this surface answers one shape, `{status, error, issues?}`, so `error` rides in `ApiError.detail` and there is nothing left to translate. `InvitationInput` takes **exactly one** of `discordUserId` (a new invitee, guild membership rechecked) or `profileId` (somebody already on the roster — the only way to change their position). `confName` is served flat because an application only exists while its conference is hidden. `ApplicationSeason` carries **`rulebookUrl`** and **`applicationBody`**, both copied off the Info document: the former is where the applicant form links its rules confirmation, the latter is the Markdown `pages/Register.tsx` renders above the form — the public Info read is published-only and intake routinely opens for a league whose Info page is still a draft. |
| `phaseRef.ts` | `PhaseRef`, its mapper, and `placementLabel` (the one rule for saying where a game sat: round number, then the operator's round name, then "Day n of m", then the week fallback). Its own module because both `profiles.ts` and `client.ts` (the team matchlist) need it and `profiles.ts` already imports `client.ts`. |
| `accolades.ts` | Reusable accolade definitions (site-wide or conf-owned) and the occurrences issued under them. Both write documents are exact-key, so there is no partial patch. A **team** award sends no profile list — the server expands that team's current roster. |
| `auth.ts` | `/auth/me`, login/logout, `SITE_ADMIN_ROLE`, `Identity`, `SessionProfile`, `AdminLeague`, `AccountVerificationMethods`. The last is configuration, not permission: a method whose settings are missing answers 404 or 503, so a control that starts one is rendered from these flags and absence reads as off. |
| `league.ts` | Conf helpers: `sortByRecency`, `recencyKey`, `resolveActive` (the set *and* the `ActiveSource` that produced it; `resolveActiveConfs` is the set alone), `forEachConf`. |
| `types.ts` | Shared payload types. |

### Query layer

`src/lib/queries.ts` — **every** query key and its options live here, never at the call site.
`queries.*` are option objects you spread into `useQuery`; `queryRoots.*` are key prefixes for
invalidation. Read its header and the per-entry comments before adding one: the staleness
choices are deliberate (public reads cache for a minute, editor reads use `staleTime: 0`, and
draft-backed editors also set `refetchOnWindowFocus: false`).

### Hooks — `src/hooks/`

`useLeagueData` (teams/standings for a conf selection, plus `findTeam`), `usePlayers`,
`useSeason`, `useScheduleFeed` / `useFeedQuery` (+ `MINUTE_MS`/`HOUR_MS`/`DAY_MS`),
`useChampions`, `useGameAssets` (items and spells), `useRunes`, `useChampionAbilities` (per champion,
Builds tab only), `useThemeColors` (the theme's tokens as strings, for a canvas), `useWindowSize`,
`useDebounced`, `useDragScroll`, `useGoBack`.
Match and game detail pages use `useBackNavigation(fallback)` so their button says Home on a
cold/direct arrival and Back when it can preserve useful in-app navigation.

### Components — `src/components/`

- `layout/SiteLayout.tsx` — the chrome (ticker, nav, content column, footer, mobile tab bar) as a
  react-router **layout route**, mounted once per route group rather than once per page. `ticker` is
  a boolean prop set in `main.tsx`, because which routes show the strip is a property of the group.
  Persisting it is the point: the ticker polls `GET /schedule` and scrolls itself to the live series,
  and a per-page copy was remounted and re-anchored on every click. It also owns the lazy-route
  `<Suspense>` boundary, so a downloading page chunk blanks the column and not the nav above it,
  and wraps it in `layout/RouteErrorBoundary.tsx` (keyed on the pathname) so a page that throws, or
  a chunk that fails to load, replaces the column with a Reload button rather than unmounting the
  site. Exports `BareLayout` alongside it — the same two boundaries with no chrome, for the
  full-bleed pages. **A chunk that fails to load is almost always a stale tab after a deploy**: the
  hashed filenames changed and the SPA fallback answered `index.html` as `text/html`.
  `lib/staleChunk.ts` listens for Vite's `vite:preloadError` and reloads once (guarded by URL and
  time in `sessionStorage`) before the boundary ever sees it, and `deploy.yml` keeps the previous
  build's `/assets/` on the server for seven days so an open tab rarely hits it at all.
  **The content scrolls, not the document.** The wrapper is `h-dvh`, the ticker and nav are fixed
  chrome, and the box under them is the scroll container, so its scrollbar never changes the nav's
  width; with document scrolling the nav's centered tabs and right-hand controls slid a few pixels on
  every navigation between a page that scrolled and one that fit, and `scrollbar-gutter: stable` left
  a visible strip beside the nav instead. The ticker therefore never scrolls away, and on mobile the
  nav is always in reach. Three consequences: nothing may assume the window is the scroller (there is
  no `window.scrollTo` anywhere today; keep it that way, or find the scroller); a page's own `sticky`
  element offsets itself from the top of the scroller, never by a nav height, because nothing scrolls
  under the nav; and `FullBleedScroller` measures its breakout against the nearest scrolling
  ancestor's `clientWidth`, not the document's, or it runs under the bar. The mobile browser's toolbar
  no longer collapses on scroll, which is the price; `h-dvh` is what keeps the wrapper the viewport's
  height when the toolbar changes it anyway.
- `layout/PageShell.tsx` — `<PageShell maxWidth={1280} extraBottom>`. Still the wrapper every page
  renders, but it draws nothing: it publishes the column width and extra bottom padding up to
  `SiteLayout` through `PageColumnContext` (a `useLayoutEffect`, so the column never paints at the
  previous page's width). Those two values are why the chrome wasn't a layout route before — Home is
  wider than Stats, and Stats' padding depends on its compare-dock selection. A page still adds the
  chrome by being routed under a `SiteLayout`; don't hand-roll either half.
- `layout/FullBleedScroller.tsx` — a horizontal scroller that breaks out to the window edges when its
  content is wider than the column, puts the page gutters back inside as padding, hides the native bar
  and draws `ScrollRail` in the column. The bracket's arrangement, lifted out; the scoreboard wears it.
  Anything wide enough to scroll sideways inside a page column should use it rather than an
  `overflow-x-auto` box, which clips at the column's right margin.
- `auth/RequireAuth.tsx` — `<RequireAuth roles={[…]} allow={boolean|null}>`. `allow: null`
  means "still resolving" and holds the checking state. Also exports `NoticePanel`.
- `settings/SettingsShell.tsx` — the sidebar + mobile drill-down shell shared by all three
  settings areas.
- `settings/SettingsSection.tsx` — `SectionFrame`, `SettingsRow`, `ReadOnlyValue`,
  `ComingSoon({ needs })`. The vocabulary a settings/admin section is written in.
- `settings/profile/UnverifiedAccounts.tsx` + `IconVerification.tsx` — claiming a Riot account by
  name and proving it by profile icon. The panel holds every one of upstream's three limits (a
  fifteen-minute challenge, a ten-second check cooldown, thirty checks) as **wall-clock instants**
  rather than counters, because a decremented counter stops when the tab is backgrounded — which is
  exactly when the player is in League changing the icon. **Riot's copy of a profile lags the client
  by about two minutes**, so a `pending` right after the save is the expected answer, not a failure:
  the instructions make the wait a numbered step before Check, and both the `pending` and `exhausted`
  notes name it. At a ten-second cooldown, twelve of the thirty checks fit inside that window, which
  is how a challenge reached `exhausted` before it could ever have succeeded. `exhausted` is the one dead end that must
  not offer "start again": the challenge is spent but unexpired, and starting returns *that same*
  challenge. Neither file keeps its own copy of the list; writes invalidate `queryRoots.profiles`.
  The panel is rendered in **two** places — Settings → Connections and step 2 of `/setup` — so a
  change to it is a change to first-time setup.
- `settings/profile/OpggImport.tsx` + `lib/riotId.ts` — claiming several accounts from a pasted OP.GG
  multisearch link. The parse is client-side because the link is already in the browser and each
  account still goes through the same one-at-a-time `POST /profiles/me/accounts`; there is no bulk
  route and this doesn't want one. `lib/riotId.ts` owns `splitRiotId`, which the single-account form
  uses too — one rule for where a tag starts. **The link is never parsed with `new URL`**: an
  unencoded `#` is a fragment delimiter, so `searchParams` returns the first account and silently
  drops the rest. Adds run sequentially and a failure doesn't abort the batch.
- `admin/adminUi.tsx` — button class strings (`ACTION`, `ACTION_PRIMARY`, `ACTION_DANGER`,
  the `_SM` variants, `ACTION_QUIET`), `ErrorLine`, `Pill`, `ColorField` — the swatch shared by
  the applicant's team form and League Admin → Teams, which set the same two columns — and
  `TeamStylePreview`, the live preview both of those forms show under the swatches — the Teams tab's
  card header, same markup, logo or initial on its well *inside* the gradient, so keep it in step with
  `views/TeamsView.tsx`. Also `stateNote`, the `· hidden · intake open · live` lifecycle caption every
  site-admin league picker appends to a league's name.
- `stats/FilterBar.tsx` — exports `LABEL_CLASS` and `CONTROL_CLASS`, the repo's de-facto form
  label and input tokens. Imported from outside `stats/` all over; that import path is ugly
  but it is the convention.
- `Toast.tsx`, `ThemeToggle.tsx`, `ScrollRail.tsx` — standalone primitives.
- `TeamBadge.tsx` + `lib/teamStyle.ts` — **the only way a team's colors reach the screen.** Every team
  surface (badge, team card header, leader avatar, team page banner) is one 135° gradient from
  `teamGradient`, whose second stop `accentHex` resolves: the team's `colorSecondary` when it has set
  one, otherwise the lightened primary the site always drew — so a team that never chose one looks
  exactly as it did before the column existed, and a team with no primary at all stays neutral gray
  rather than grading into a chosen accent. `toBadge` and `toTeamBase` in `lib/leagueAdapters.ts`
  go through it, `TeamStylePreview` draws it in the two color forms, and every team-shaped mapper
  spreads `colorSecondaryOf` so the field rides along (absent, not `null`, on a read that lacks it).
  `TeamBadge.tsx` also exports `TeamStyleHeader`, the Teams tab's card header as one component (the
  gradient, the logo or initial on its well, the name and tag in white). It takes the resolved CSS
  `background` rather than colors so the two-stop rule stays in `teamStyle.ts`; `TeamStylePreview`
  wraps it for the color forms, and `applyUi.tsx`'s `ApplicationTeamHeader` wraps it over an
  application's integer columns (through `teamGradientForInts`) for the applicant's card, the review
  queue and the invitation inbox. Prefer it to a fresh copy of that markup wherever a team is
  introduced by name; the two-swatch strips it replaced are gone from the application surfaces.
  The stat bars are the one surface with a different fallback: `BarLeaderboardRow.colorEnd` takes
  `secondaryHex` — the chosen secondary only, never the derived stop — so a team without one keeps
  the primary-to-transparent fade it always had, and `StatBars` clears it in `colorBy="value"` mode.
  Don't write a bare `linear-gradient` for a team.
- `ChampionIcon.tsx` — **the only way a champion's square icon reaches the screen.** Its `tile` prop
  is the clipped, lifted, 20%-zoomed treatment that hides the border Riot bakes into the square; every
  champion drawn as a standalone tile (game rows, ban strips, leaderboard rows, highlight chips, the
  stat table heads, the timeline's player picker) uses it, and only an icon inline in a sentence does
  not. The radius and the lift scale with the size through `lib/tile.ts`, which `game/RiotIcons.tsx`
  shares, so a 16px ban chip and a 48px item well never carry the same shadow. **Never put
  `overflow-hidden` on the wrapper of a tile**: it clips the lift, which is how the team page's game
  rows came to have none. Takes either an
  API-served URL (`src`) or an id/name plus the `useChampions()` lookup; both resolve to the same
  Community Dragon URL, which is the point. Pass `championId` even when `src` is available: Riot's
  `-1` means "no ban", and the component uses that id to override the broken normal-champion URL with
  Community Dragon's dedicated no-ban icon. Ban renderers must preserve every `-1` entry rather than
  filtering it out. Don't write a bare `<img>` for a champion.
- `profile/` — everything `/players/:profileId` is made of. `profileUi.tsx` is its vocabulary:
  `RailCard`, `ProfileSection`, `TeamLogo`/`TeamChip`, the `useConfLabel()` conf→league-name
  resolver, and the number formatting the whole page has to agree on — `metricText`, `kdaText`
  (**KDA's `Infinity` reads "Perfect", not `∞`** — the rest of the site keeps `fmtRatio`'s `∞`),
  `avgKdaText`, and the `winRateTone`/`kdaTone` color scales — the only two stats color-coded
  anywhere on the page, both bold at every tier. `PlayerLink.tsx` is the canonical
  player link used site-wide. The page builds two indexes from its single payload and passes them
  down — `TeamIndex` over `career.teams` for the player's own team, and `matchId → ProfileGame` for
  the personal-best cards and the series grouping. **Never fetch a team, a game or a season here**:
  one request answers the page, and the joins are map lookups over what it returned.
  Layout splits by shape of question, not importance: the rail is the lists that read fine at 320px
  (accounts, roles, champion pool, lane matchups, teams) and the wide column is the numbers and the
  game rows. `CareerTiles` deliberately omits games/record/win-rate/KDA — the header already shows
  them. `MatchupCard` is the one place the page sums across the API's rows; its header explains why
  that is safe.
  `ProfileHeader` is two rows, not two columns: identity and the league selector above, then the
  trophies and the four headline numbers sharing a row beneath — `AccoladeStrip` takes `flex-1` from
  the left, the numbers `ml-auto` to the right, and the row is `items-end` so the pills and the
  captions share a baseline. Both were previously boxed into 220px columns that made four of
  anything wrap. `AccoladeStrip` takes its positioning as a `className` and renders nothing when
  empty, which is why the numbers use `ml-auto` rather than the row using `justify-between`. Below
  `md` that row stacks (trophies above, numbers beneath), and a pill is always one line: its name
  never breaks and its detail ellipsizes. The series headers in `MatchHistory.tsx` are one
  non-wrapping row each, and the list is a CSS grid with every card, header and content row a
  `grid-cols-subgrid` of it (`HEADER_COLUMNS`), so the four columns are sized once across all cards
  and the scorelines line up down the page. The player's team and the meta are content-sized and
  capped; the opponent is the only column that flexes, so it is the one name that truncates.
  Its game rows are one dense line each, with the captions carried once by `GameRowHeader` above the
  list rather than repeated per row — the two-row version wasted its top row on whitespace and shrank
  the numbers past legibility. `GAME_GRID` is shared by the header and the rows; change one, change
  both.
- `game/` — the match viewer. `RiotIcons.tsx` is **the only way an item, summoner spell, rune, lane or
  ability icon reaches the screen**, over the lookups in `lib/gameAssets.ts` (items, spells),
  `lib/runeData.ts` and `lib/championAbilities.ts`, all Community Dragon `latest` through
  `lib/riot/cdragon.ts`; don't write a bare `<img>` for any of them any more than for a champion.
  **Two Community Dragon hosts, and which one is not a choice**: the routed `cdn.` host answers by id
  (champion squares, centered splashes, ability icons, profile icons) and is preferred wherever it has a
  route; the `raw.` tree is for the things it has no route for (the champion manifest, items, summoner
  spells, runes, lane icons, ranked crests), each with an `iconPath` rewrite. `cdragon.ts` names both.
  `RiotText.tsx` renders Riot's description markup (`<attention>`, `<passive>`, `<br>`) as React spans
  by tokenizing it; nothing here uses `dangerouslySetInnerHTML`. `lib/game/participants.ts` is the one
  place the Riot-ID fallback for a name is decided, so a linked and an unlinked player read alike on
  every tab. `scoreboard/density.ts` is the one table of sizes for the three scoreboard densities
  **and owns the board's grid template**: from `md` up every row, header and footer is a
  `grid-cols-subgrid` child of one seven-track grid, which is what puts the two column switchers over
  the columns they drive. Do not rebuild a row out of flex cells. One layout at every width: below
  `md` the icons and type shrink (`DENSITY.sm`) and the name track, the grid's one flexible track,
  gives way down to a floor; then the three stat tracks (`minmax(max-content, colPx)`) give up the
  space around their content, and only then does the board scroll. That order depends on the grid
  being `min-w-min` and the scroller's wrapper being `w-min`; a max-content floor on either pins the
  stat tracks at full width and buys a scrollbar instead. A block's numbers (K/D/A, gold, objectives,
  bans) are its `TeamFooter`, beneath the rows, not its header. Champion splashes (`ChampionSplashArt.tsx`) come from
  the routed CDN by id and have **no icon fallback**; an id the CDN lacks is an empty tile. The
  Timeline tab's state (graph, stat, selected and hovered players, hidden event types, focused
  minute) is one context in `timeline/TimelineTab.tsx`. **Map sides are colored with `side-blue` and
  `side-red` and nothing else** (`text-side-blue`, `bg-side-red/20`, `ring-side-blue`); `ccs-red` is
  the brand and is wrong for "red side". The two charts read those tokens as strings through
  `useThemeColors` because a canvas cannot take a class.
- `Markdown.tsx` — the shared safe renderer for native article bodies, league Info pages and
  application notes. It uses `remark-gfm` for pipe tables, autolinks, task lists and strikethrough; raw
  HTML stays disabled. Styling is the typeset (`src/typeset.css`, presets in `index.css`), chosen by
  the `preset` prop; the renderer overrides only links (new tab), images (lazy) and tables, which keep
  the site's own full-width ruled treatment with a filled bold header row because typeset's bare table
  read as loose prose. Do not introduce a second Markdown policy in a feature folder.
- `match/SeriesTotals.tsx` — series totals and player leaders reduced from the loaded game box scores.
  Rate and efficiency leaders (including damage per gold) use aggregate player totals, not averages of
  per-game rates.
- `match/BanIcons.tsx` — renders every ban slot a payload supplies and deliberately preserves champion
  `-1`, which `ChampionIcon` turns into the no-ban artwork. Both the season-result payload behind
  `/match/:id` and the team matchlist preserve skipped-ban entries.
- `match/TeamMatchHistory.tsx` — a team's matchlist grouped into series cards in the profile page's
  shape: score chip, "vs", opponent chip with logo and full name, placement and date; the team's own
  name is not repeated on its own page. The header links to the series page and names the phase and
  round. Every matchlist row serves `scheduleMatchId` and `phase` (§21 of `API-GAP-ANALYSIS.md`,
  resolved 2026-09-02), so a series is keyed on its fixture id and labeled from its phase with no
  second read; both are `null` on a legacy season's rows and the grouping then falls back to
  `(seasonDay, opponent)`. The component used to rebuild both by joining the rows to
  `GET /tournaments/:conf/schedule`; don't bring that back, since only the server can reach a bracket
  round. Each game is one dense row and one anchor (`TeamGameRow`): draft, K/D/A, gold
  difference at 14, objectives, duration, side. `MatchResultList` remains the row for the series
  preview's recent games.
- `match/SeriesGameCard.tsx` — one game of a best-of on `/match/:id`. Its header is the link to the
  viewer ("View match details"); the sides are captioned by team and a large Victory / Defeat, never by
  blue and red. Every champion in it is a `ChampionIcon` tile.
- `match/MatchResultList.tsx` — the shared team-perspective game row used by a match's Preview tab:
  result, opponent, picks, bans, K/D/A, duration, date and side. Callers own ordering and truncation. Its draft strip is a fixed-column grid; narrow rows abbreviate Picks/Bans and
  hide objectives before falling back to scrolling. Do not reintroduce wrapping: the side and objective
  columns must align across results. The list is a Tailwind `@container`: at `@4xl` its existing elements
  collapse into one dense row, which keeps the full-width team history from looking stretched while the
  half-width match-preview cards retain two independent rows: flexible left/right alignment above and a
  fixed draft grid below. At `@4xl`, only those two non-semantic row wrappers become `contents`, promoting
  nine individual cells into equal 140px Picks/Bans tracks plus separate centered K/D/A, time, date,
  objectives and side tracks. The opponent `TeamLink` is `justify-self-start` so its click target hugs
  the name instead of filling the flexible column. Readable metadata uses `text-text-secondary`, not the
  dim tokens.
- `home/`, `league/`, `match/`, `season/`, `stats/`, `views/` — feature areas.
- `src/_disabled/` — the dead Supabase-era dashboard, kept for reference only. **Never import
  from it.** It shows what a screen used to do, not how to build one now.

### Settings & admin areas

All three (`/settings`, `/admin`, `/league/:conf/admin`) render the same `SettingsShell` from a
section registry. **Adding a section is appending one entry to the `AREA` array** in the
relevant page — the sidebar, links, mobile drill-down and active state all follow.

`src/pages/SiteAdmin.tsx` is the exemplar: read it in full before adding an area or section.
`src/lib/settingsAreas.ts` defines `SettingsSection` / `SettingsArea` / `sectionForSlug`.
`src/lib/adminAccess.ts` — `useAdminAccess()` composes role + resource: `isSiteAdmin`,
`leagues`, `canAdminLeague(conf)`, `ready`.

League Admin → **Team Applications** is `src/components/league/applications/ApplicationsSection.tsx`:
the review queue and publication on one screen, because they are one job in two stages, and both are
`roster` — the scope the page is gated on. **Intake and listing are not controls there.** Opening or
closing applications and making the season public are site-admin commands on Site Admin → Leagues
(`admin/LeaguesSection.tsx`), because each changes what the whole site offers; the section's
`SeasonPanel` reads `queries.applicationIntake(conf)` to show their state (open/closed, listed/hidden,
when teams were first published) and nothing more. **The League Admin portal never names the site-admin
portal**, not in a hint and not as a link: a league admin cannot reach it, so the reference is a door
they are not allowed through. It must not read `/admin/leagues`, which would `403` the league admin
the page is for, and it no longer derives the flags from the open-season list or the public tournament
list. The one control gated
narrower than the page is the application-notes editor, which writes the Info document and so needs
conference `admin`. There is **no `withdrawn` state anywhere on the client**: withdrawing deletes the
application upstream (§19 of `API-GAP-ANALYSIS.md`), so `APPLICATION_STATUSES` omits it and no pill
or status note exists for it. The one filter left is at the API boundary: the three list reads in
`teamApplications.ts` drop a leftover row still carrying it (`isServed`) so the mapper's `draft`
fallback cannot resurrect a team its captain gave up. The Withdraw button stays; what it produces is
an absence.

It also edits the **application notes** (`applicationBody`) — the "read this before you apply"
Markdown an applicant sees on `/register` — even though the field is stored on the league's Info
document. It is intake copy, never rendered on the Info page, so it sits with the intake controls.
`ApplicationCopyPanel` saves through the Info document's whole-document `PUT`, sending every other
field back exactly as stored, and invalidates `queryRoots.applications` as well as `queryRoots.info`
because applicants read the copy off `GET /tournaments/applications/open`. The Info editor, in turn,
carries `applicationBody` through untouched on its own saves — leave either half out and one editor
erases the other's field.

Site Admin → **Import Applications** is `src/components/admin/applications/ImportApplicationsSection.tsx`,
and it is **not a second review queue**. It exists because the league ran one season's intake on an
external form: every applicant route gates on the caller being the submitter, so nobody could enter
those answers on a captain's behalf. `ImportApplicationForm.tsx` takes the captain, the same strict
application document `ApplicationForm` writes (same caps, same `ColorField`, `TeamStylePreview` and
`RolePicker`, the last exported from `apply/InviteMember.tsx` with an `ownerNote` prop because its
default text speaks to the captain) and the roster in one document, and the result is a **`draft`
owned by the submitter**: it appears on their `/my-applications`, and only they can edit, submit or
withdraw it. Two rules the page is built around. **Import and Send invites are separate commands**:
import stages every member as a `pending` invitation that is visible in their inbox on the site at once
and has **not** been DMed, and the per-card Send invites button (a `ConfirmButton`, because it messages
people) reaches only pending members whose `dmStatus` is not `sent`. There is no `staged` invitation
state anywhere; the trade-off was chosen on 2026-09-03. And **people are picked from two sources under
one input**, `PersonPicker.tsx`: the site-admin guild search for somebody who has never visited the
site, and the unfiltered profile search for somebody who has. It carries a `PersonIdentity`
discriminated union and builds the wire `PersonRef` at send time, so the one-of-two rule is a type,
not a runtime check. The list under the form is `queries.applicationQueue`, League Admin's own read;
Delete is offered on `draft` and `rejected` regardless of origin, since an imported application is
indistinguishable from one a captain started, and the dialog says so. The league picker reads
`/admin/leagues` like every site-admin picker, defaults to the first hidden season, and warns on a
listed one, which the import route refuses.

League Admin → **Teams** is `src/components/league/teams/TeamsSection.tsx`, and it is **one section
where the sidebar used to promise two**: `teams` and `rosters` were separate `ComingSoon` stubs over
the same database row, and a roster slot *is* a team column. Rosters lead and branding sits behind a
button, because a roster moves weekly while a name and a tag are chosen once a season. It reads the
public `GET /teams/:conf` — that read already carries every editable column, and a team only exists
after publication — and writes through `lib/api/teamAdmin.ts`, **whose two routes do not exist
upstream yet**; until they do, every save answers `404`. Scope is `roster`, narrower than the page's
own gate, so a viewer without it sees the same rosters read-only. `PlayerPicker.tsx` beside it is
the profile autocomplete, **unfiltered by default** — `?conf=` narrows to players a published team
already references, which excludes the new signing a roster editor is usually looking for.

Accolades are two sections over one shared document: Site Admin → Accolades
(`src/components/admin/accolades/GlobalAccoladesSection.tsx`) owns the site-wide definitions, and
League Admin → Accolades (`src/components/league/accolades/AccoladesSection.tsx`) shows those
read-only alongside the conference's own and does the issuing. `admin/accolades/accoladeUi.tsx` holds
the one `DefinitionForm` both use. **Every accolade write invalidates `queryRoots.profiles` as well
as `queryRoots.accolades`** — the public profile page carries its own copy of the list and nothing
else would refresh it.

### The applicant side — `src/components/apply/`

Two pages, and they are two halves of one workflow: `/register` (`pages/Register.tsx`) is where a
captain builds a team, and `/team-invitations` (`pages/TeamInvitations.tsx`) is where the people they
invited answer. Neither works without the other, so change them together. A third,
`/my-applications` (`pages/MyApplications.tsx`), is the captain's way back: every team they have
submitted across every open league, one section per league with the league's application notes and
rulebook folded into a `<details>` disclosure at the top, and **no form to start a new one**. It
renders the same `ApplicationCard` as `/register`, so a change to the card is a change to both pages.
It fans `myApplications` out per open season with `useQueries`, because there is no cross-conference
read; a league the member has nothing in is left out rather than shown empty.

- `applyUi.tsx` is the vocabulary: `ROLE_LABEL`, `STARTER_ROLES`, `roleSummary`,
  `ApplicationStatusPill` / `InvitationStatusPill`, `ApplicationTeamHeader` (the card header every
  application surface opens with; the card needs `overflow-hidden`), `ApplicationDetailsBlock`,
  `MemberAvatar`, `memberLabel`. Labels that sit beside a value in the details block use its local
  `INLINE_LABEL`, not `LABEL_CLASS`, whose `block` and bottom margin lift a label above the text it
  names, and those rows align on `items-baseline`, not `items-center`: a small all-caps label
  centered against mixed-case text still reads high, and an icon in the row is `self-center` so it
  does not supply the baseline. **The wording is
  the player's, not the API's** — `sup` is "Support", `submitted` is "Waiting on staff", and
  `rejected` is "Changes needed" because upstream lets a rejected application be edited and
  resubmitted. A substitute is "Substitute", never "Substitute 3": **the sub `ordinal` is invisible
  to the applicant.** It is a bench order with no uniqueness upstream (roles are keyed on `(member,
  role)` and `publicationIssues` only counts subs), so `InviteMember`'s `nextSubOrdinal` assigns the
  lowest one no live sub holds and nothing ever shows or asks for it. Also `useApplicationConfName`,
  which exists because `profileUi`'s `useConfLabel` resolves against the listed-only tournament list
  and therefore cannot name the hidden conference somebody is applying to.
- `ApplicationForm.tsx` is one form for create **and** replace, because upstream takes one strict
  seven-key document for both and `PUT` is a whole-document replacement — anything the form omits is
  erased, which is why `applicationMetadata` is passed straight back through.
- `ApplicationCard.tsx` owns the roster panel, the readiness checklist and submit/withdraw. Its
  checklist duplicates the server's `publicationIssues` **deliberately**: it is form guidance over
  members already loaded, it decides nothing, and the `409` from Submit stays the authority. Without
  it, Submit fails with a list of surprises. It diverges in exactly one place, on purpose: **there
  is no owner blocker** (§16). `owner` is a label the league records, not authority and not a
  requirement — control of an application follows `submittedByProfileId`, so nothing on the
  applicant side may say the submitter is, becomes, or has to find an owner. Two rules it does
  mirror and that are easy to soften by accident: **two** points of contact, and **a verified Riot
  account for everyone in the playing lineup** — starters and bench, never an owner or contact who
  does not play. Two blockers are the client's own and the server knows nothing of them: the
  **rules acknowledgement** and the **Discord ticket confirmation**, both checkboxes on
  `ApplicationForm`, stored in `applicationMetadata` (`rulesAcknowledged`, `ticketOpened`) through
  `readApplicationDetails`/`writeApplicationDetails`, and shown to reviewers by
  `ApplicationDetailsBlock`. The ticket one is the applicant's word — nothing on the site can see
  Discord — so it is an instruction as much as a confirmation, and its copy says where to go.
- `applyUi.tsx`'s `RankChip` is the one renderer for a member's Riot standing, and it is shared
  with the review queue. Four states, and collapsing any two of them lies: `Unverified` (red — it is
  what is blocking Submit), `Rank pending` (verified, never fetched), `Unranked` (fetched, no solo
  games) and the rank itself. **The chips come from a cache upstream, never a live lookup**, so a
  player who linked an account a minute ago reads `Rank pending` until somebody presses Refresh
  ranks.
- `InviteMember.tsx` is guild search plus a role picker. Position is single-choice, matching the
  server's one-playing-role rule. It is also the roles editor: a member already on the roster is
  re-sent by `profileId` (§10.8 of `API-GAP-ANALYSIS.md`), which is the one way to change a position.
- `ApplicationCard.tsx` **hides `revoked` members** from the applicant's roster. Upstream keeps
  serving them for the reviewer's benefit, but a "Removed" row that outlives every refresh clogged the
  captain's own page, and re-inviting the person is an upsert that needs no row on screen. Declined
  members stay, because that is an answer the captain has to see. The review queue still shows both.

The APPLY NOW button lives in `auth/AuthControl.tsx`, in the same slot the signed-out JOIN CCS
button occupies. It is gated on `isAuthenticated` because `GET /tournaments/applications/open` is
`401` for anonymous callers — which also means the nav cannot offer it to a signed-out visitor at
all (§10.10). The account menu's "Team invitations" row is unconditional, because an invitation can
arrive long after intake closes and the Discord DM is best-effort. Its **"My applications"** row is
not: `hooks/useMyApplications.ts`'s `useHasLiveApplication` offers it only while the member is
running an application in a season still taking them, reading `myApplications` once per
open conference (there is no cross-conference route), and it links to `/my-applications`, not to
`/register`. That read is `LEAGUE_STALE` rather than `0` for exactly this reason: it runs from the
nav on every page, and every applicant write invalidates `queryRoots.applications` anyway.

League Admin → Info Page is `src/components/league/info/InfoSection.tsx`. There is exactly one
document per conf, so it uses a complete-document `PUT`; link order is editor-owned and must never
be sorted in the client. The reader is the standalone `/info` tab in `src/pages/Info.tsx`, sits in the
ticker route group like the other public data tabs, and renders every conf when the `current`
selection resolves to concurrent leagues.

`rulebookUrl` is its own **required** field rather than an entry in `links`, because a quick link is
identified by a label an editor can rename. The application form does **not** read this document for
it — `GET /tournaments/applications/open` carries the same value and ignores publication, which is
the only way it reaches an applicant while the Info page is still a draft (§15).

That means the reader has to place it explicitly, and it **prepends it as the first quick link** —
otherwise the one document a reader most wants would appear nowhere on the page. Prepending is not
sorting: `links` keeps the order it was given, and the rulebook goes in front of it.

`applicationBody` rides on the same document and the same open-seasons read, but the Info reader
**never renders it** — it is application copy, shown only on `/register`, and edited from League
Admin → Team Applications rather than here.

### Deliverables

Design docs for this project live in `C:\Users\baddison\Claude\ccs-revival-website\`, not in the
repo. `API-GAP-ANALYSIS.md` there tracks endpoints the site wants and the API doesn't serve yet;
`league-admin-teams-api-spec.md` is the full contract for the two team writes §17 proposes.

---

## Season day is internal

`seasonDay` is a season-wide ordinal — day 1 of the season through day 16 — and the API
serves it on most reads, because it is what `series` groups on and what a tournament code is
minted against. It is a **join key, not a label**.

Do not put it on a reader-facing surface. It is not a date, it is not a week number a viewer
would recognize, and it collides with the numbering that *is* meaningful in context: a
bracket's rounds are numbered within their phase, so "Round 4" and "Day 14" on the same
heading read as a contradiction. Show the date instead — `fmtDay` and `fmtKickoff` in
`src/lib/utils.ts` — or show nothing.

Two exceptions, both deliberate: the admin screens name it outright (`season day 14`), because an
admin is working in the same coordinates the API is; and the stats tables and records boards carry a
`W14` / `Week` column, where it is a sortable value rather than a caption.

**Use `phase`, not `seasonDay`, to say where a game sits.** `PhaseRef` is served on every profile
game, series and personal best, and carries the phase name, its 1-based `matchDay` *within* the phase,
`matchDays`, and for brackets a `round` plus the node's verbatim `roundName`. So a profile's series
card reads "Playoffs · Round 2" or "Groups · Day 2 of 4" — `placementLabel` in `MatchHistory.tsx`
— and falls back to `Week {seasonDay}` only where `phase` is `null`, which is a legacy conference
predating the phase list. In a bracket the **round number leads** and `roundName` is only the
fallback: operators label nodes as matches ("Match 3"), which places a game in a draw sheet the
viewer cannot see, while a round number places it in time.

Two things never to derive: a **phase** from a season day (phases are keyed by length rather than
start day, so it would take one season read per conference a career spans plus arithmetic that goes
stale the moment structure is edited), and a **round name** from `round` ("Round 2" is the served
ordinal and fine; "Semifinals" invented from depth is wrong for a third-place match and for every
loser's bracket).

## `listed`, `applicationsOpen` and `active` are three different questions

A conference carries all three and conflating any two of them breaks something:

| Field | Question it answers |
| --- | --- |
| `listed` | Does this appear in ordinary site selectors? |
| `applicationsOpen` | May signed-in members submit a team for it? |
| `active` | Does it take part in the default cross-league schedule feed? |

A season being prepared is unlisted, closed and inactive. **Publishing teams and publishing a season
are two separate commands, held by two different audiences**, and the ordering is the admin's:

- `POST /tournaments/:conf/applications/publish` (and `.../:id/publish` for one) creates `teams`
  rows and stamps `teamsPublishedAt`. **`roster` scope**, on League Admin → Team Applications. It
  runs while intake is open and while other applications still await review, it takes whatever is
  approved *now*, and it can be run again later. It touches none of the three flags.
- `POST /admin/leagues/:conf/list` sets `listed` and `active` and closes intake, in one write —
  the database refuses open intake on a listed conference and the constraint is not deferred. It
  creates no teams and refuses `no_teams` on an empty field, `already_listed` on a second call.
  **Site-admin only**, on Site Admin → Leagues, and so is the intake toggle beside it,
  `PATCH /admin/leagues/:conf/applications` (`409 season_listed` on a public season). Both changed
  what the whole site offers, where a league grant governs one conference's data, which is why they
  left `/tournaments`; the old paths answer `404`.

Roster staff read the resulting state — `applicationsOpen`, `listed`, `teamsPublishedAt` — from
`GET /tournaments/:conf/applications/intake`, and can change none of it.

Approval on its own still writes no team rows. What changed is that an approved team can leave the
review queue and become editable in League Admin → Teams weeks before anybody hears about the
league.

Two consequences for this repo:

- **Public `GET /tournaments` is listed-only.** `LeagueProvider` reads it, so a hidden conference is
  absent from every public selector by construction — never infer listing from teams, schedules,
  dates or `active`.
- **The public data reads hide an unlisted conference too**, now that its teams exist before it does.
  `GET /teams`, `/teams/:conf`, `/teams/:conf/:code`, `/standings/:conf`, `/matches/:conf`, the
  conf-scoped `/stats` routes and `GET /profiles/search?conf=` serve one only to a site admin or a
  holder of a grant on it, and answer everyone else the same plain-text `400` an unknown conf gets.
  They read the session cookie to decide, so they are credentialed reads even though they are
  public.
- **Every admin surface reads `GET /admin/leagues` instead**, because that is the only read that can
  see a hidden draft. `admin/LeaguesSection.tsx`, the grant picker in `admin/RolesSection.tsx` and
  the site-admin branch of `lib/adminAccess.ts` all do. Public navigation must not; a site admin who
  created a hidden league would otherwise find it missing from their own editor.

  The grant picker is the sharpest case: a league needs its admins *before* it is public, because
  opening intake and reviewing applications are things only a grantee can do on a season nobody can
  see yet. The write never disagreed — `PUT /admin/users/:profileId/leagues/:conf` guards with plain
  `requireConf`, which validates against the whole `tournaments` table — so this was only ever the
  picker refusing to offer what the server would have accepted.

  Three site-admin pickers now read it — the league editor, the grant picker under Roles, and the
  Announcements form — and so does Season Structure, which is the one that would have bitten
  hardest: a season's phases are drawn up while it is still hidden.

`listed: true` is refused by `PATCH /admin/leagues/:conf` on purpose — `POST /admin/leagues/:conf/list`
is the only path to public, so there is one owner for the flag. `false` is available there as an
emergency hide, which is why `LeagueEdit.listed` is typed as the literal `false`. In
`admin/LeaguesSection.tsx` the two are different controls: the hide is a checkbox saved with the
form's `PATCH`, and "Make season public" is a `ConfirmButton` firing its own mutation.

## Two season reads, and they are not interchangeable

- `src/lib/api/seasonView.ts` — `GET /:conf/season`, the season **as rendered**. Public,
  anonymous, resolved values, unpublished phases absent. Everything a viewer sees.
- `src/lib/api/season.ts` — `GET /:conf/phases`, the season's **structure**. Site-admin only,
  credentialed, unresolved nulls that mean "inherit". Only the structure editor loads it.

Loading an editor from the rendering read pins every inherited value as an override. The
header comment on each file says so at more length; read it before adding a caller.

---

## Conventions

### Language — US English, everywhere

**American spelling throughout**: UI copy, comments, identifiers, docs, this file. `color` not
`colour`, `center` not `centre`, `organization`, `behavior`, `normalize`, `catalog`, `license`,
`gray`, `defense`, `canceled`, `labeled`, and `-ize`/`-ization` over `-ise`/`-isation`.

It applies to comments and local identifiers as much as to anything a visitor reads. That is not
pedantry: the API already speaks US English in every field name it serves (`color`, `colorSecondary`,
`normalizeRole`), so a file whose prose says "colour" while its code says `color` reads as though the
two disagree about the same value. One convention means no one has to decide.

The obvious exception: **never "correct" a string that crosses a boundary.** A wire field name, a
query key, a CSS keyword, an external URL and a third-party API's vocabulary are all values, not
prose. If in doubt, ask whether changing it would change what the code *does*.

### No em dashes in anything you write

**Do not use the em dash (`—`) in new text**: UI copy, `hint` and `description` strings, section
notes, toasts, dialog copy, code comments, commit messages, and additions to this file. It is the
single most overused mark in generated prose, and a page full of them reads as generated. Use a
period and start a new sentence, a comma, a colon, or parentheses instead. The en dash in a numeric
range (`1–3`) is fine. Existing em dashes in code you are not otherwise touching can stay; when you
rewrite a sentence that has one, take it out.

### Data

- **Dates stay ISO strings** through the whole API layer (`strOrNull`). `new Date()` happens
  at the point of use, never in a mapper.
- **Rows are rendered in the order served.** Standings are never re-sorted or renumbered by
  row index — the ranking resolves head-to-head, which nothing on this page could reconstruct,
  and teams level on every tiebreaker legitimately share a rank.
- **Don't compute in the client what the API should answer.** One load plus a trivial
  reduction is fine; anything heavier is a missing endpoint — name it and stop.
- **Concurrent conferences are told apart by `codename`, never `shortname`.** A conference carries
  two short labels: `shortname` is the *season* ("Summer '26", edited as Season Name) and sibling
  divisions deliberately share it; `codename` is the *division* ("Apollo", edited as Division Name)
  and is what every selector strip shows. `groupLabels` in `lib/leagueAdapters.ts` is the one place
  the rule lives — codename, else full `name`, else the conf — and Standings, Stats, Teams and the Home
  standings panel all label from it. Feed rows get the same field flat (`FeedMatch.codename`) and
  caption `codename ?? shortname ?? league`. Naming a *historical* conf on a profile is a different
  question and keeps the full name.
- The API repo is read-only from here. Never edit `../tournament-bot`.

### The API layer

- One module per API area, exported through `src/lib/api/index.ts`. Every module opens with a
  header comment explaining the upstream behavior it is compensating for.
- Public reads go through `http.ts`; anything signed-in or mutating goes through
  `credentialedRequest`.
- **Every response is mapped defensively.** The local idiom, copied per module:
  ```ts
  type Raw = Record<string, unknown>;
  const asRaw = (v: unknown): Raw => (v && typeof v === "object" ? (v as Raw) : {});
  const strOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
  const int = (v: unknown, fallback = 0): number =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;
  ```
  A field the deployed API doesn't serve yet must read as absent, never `undefined` leaking
  into a component. Unrecognized enum members are **dropped, not repaired**.
- Mirror upstream's constraints as constants next to the type (`CONF_PATTERN`, `NAME_MAX`,
  `PHASE_NAME_MAX`) so a field can cap its own input.
- Absence is not failure: `getList` resolves a missing route or null body to `[]`, `getOne` to
  `null`. Only throw for real errors.

### Queries and mutations

- Add the key to `src/lib/queries.ts`, with a comment justifying its `staleTime`. Put it under
  an existing root when an existing invalidation should already refresh it — a separate root
  is a root an editor will forget.
- Mutations are `useMutation` + `qc.invalidateQueries({ queryKey: queryRoots.x })` in
  `onSuccess`. `await` the invalidation when the next step reads the list you just changed.
  `LeaguesSection.tsx:141` is the reference.
- **Never fire a mutation from a mount effect.** `MutationObserver.onUnsubscribe` detaches the
  observer from its running mutation when the last listener goes away, and nothing re-attaches
  it — `#currentMutation` is only bound inside `mutate()`. StrictMode unsubscribes between its
  two effect passes, so a mutation launched by a mounting component's effect completes into a
  cache nobody is listening to: the request succeeds and the component sits on `isPending`
  forever. Fire from a user event, in a component that outlives the call, and pass the result
  down — `settings/profile/UnverifiedAccounts.tsx` starts the verification challenge on behalf
  of the panel that displays it for exactly this reason. A mount-time *read* is `useQuery`.
- Never call `fetch` from a component.

### UI

- Reach for `PageShell`, `SectionFrame`/`SettingsRow`, `LABEL_CLASS`/`CONTROL_CLASS` and the
  `ACTION*` strings before writing new markup. New shared primitives go in the nearest
  existing `*Ui.tsx`-style module, not inline.
- **Anything modal, layered or focus-trapped is a shadcn primitive in `components/ui/`** — never
  `window.confirm`, `window.alert`, or a hand-rolled overlay. Radix carries focus trap and restore,
  `Escape`, scroll lock, `aria-modal` and portalling, and a dialog opened inside an `overflow-hidden`
  card is clipped without the portal. A destructive confirmation is `ConfirmButton`, which composes
  `ui/alert-dialog` so a call site stays one element.
- **Prefer a stylized shadcn/ui primitive over hand-written markup, and add the primitive when it
  doesn't exist yet.** `src/components/ui/` is deliberately thin — today `button.tsx`,
  `alert-dialog.tsx`, `tooltip.tsx`, `checkbox.tsx`, `popover.tsx`, `select.tsx` and `sheet.tsx` — but
  that is a gap, not a policy. When a control has a shadcn template that
  fits (dialog, dropdown-menu, select, tabs, tooltip, popover, checkbox, switch, input, table,
  sheet, accordion, badge, skeleton, …), copy that template into `components/ui/` and use it rather
  than assembling the same behavior out of `<div>`s and class strings. The registry versions carry
  the keyboard interaction, ARIA wiring and focus management a hand-rolled control silently omits,
  and they land already dressed in CCS colors because shadcn's tokens are aliases onto ours. Two
  rules when adding one: keep the file as close to the upstream template as possible, so the next
  update is a diff and not an archaeology exercise, and restyle **through the tokens below** — a
  variant reaching for a raw hex, or re-inventing what `ACTION_PRIMARY` already says, defeats the
  point. Anything above the primitive layer — a settings row, a match card, a section frame —
  stays written here.
- **Two token vocabularies, and they overlap in one dangerous place.** The CCS tokens
  (`bg`/`bg2`/`bg3`, `text-bright`/`text-secondary`/`text-dim`, `brand`, `ccs-*`) dress the app;
  shadcn's (`background`/`foreground`, `card`, `primary`, `muted-foreground`, `input`, `ring`,
  `accent`) are **aliases onto those same values** in `index.css`, so a component copied from
  shadcn's docs renders in CCS colors unedited. The trap: **`accent` is shadcn's hover surface, not
  the brand.** The CCS red is `brand` (`bg-brand`, `text-brand`) — it was renamed off `accent`
  precisely to free that name. A `bg-accent` you see means "hovered". And `primary` and `destructive`
  are the *same red*, because `--brand` and `--red` are both `#d20708`; the `ui/button` variants
  separate them by fill versus outline, so nothing may distinguish them by hue alone.
- Tailwind utilities only, against the `@theme` tokens — no raw hex, no inline color styles.
  Available: `bg`/`bg2`/`bg3`/`bg-input`, `border`/`border2`/`border3`,
  `text`/`text-bright`/`text-secondary`/`text-muted`/`text-dim`/`text-subtle`,
  `accent`/`accent-light`, `ccs-green`/`ccs-red`/`ccs-gold`/`ccs-blue`/`ccs-orange`/`ccs-purple`, and
  `side-blue`/`side-red` for the two sides of the map (a place, not a semantic; `ccs-red` is the brand).
  Fonts: **Geist everywhere, Geist Mono for numbers and ids**, self-hosted through
  `@fontsource-variable/geist` and `@fontsource-variable/geist-mono`, imported at the top of
  `index.css` (families `'Geist Variable'`, `'Geist Mono Variable'`). The four role tokens are
  unchanged and still mean what they did: `font-display` is a section heading, `font-heading` a nav
  label or caption, `font-body` prose, `font-mono` a number. The two heading roles carry their default
  weight (650 and 500) and tracking in an `@layer components` block near the foot of `index.css`, so an
  explicit `font-bold` on an element still wins; never pin a weight with `font-variation-settings`,
  which would not let it. Never write a family name in a component; a canvas reads the stack through
  `useThemeColors().fontBody`. Body text is grayscale-antialiased in `index.css`. Both themes must
  work — that's what the tokens are for. `shadow-tile` is the lift under every game-asset icon.
- **Rendered Markdown is styled by shadcn's typeset**, `src/typeset.css`, imported after Tailwind and
  kept unedited. `components/Markdown.tsx` renders plain elements inside `typeset typeset-<preset>`;
  the two presets (`article` for news, `notes` for Info pages and application copy) are defined at the
  end of `index.css` and are the only place rhythm is set. Don't add per-element classes back to the
  renderer, and don't wrap a component in `.typeset` that isn't Markdown output; `not-typeset` opts an
  element out. `MarkdownEditor` previews with the same renderer and the same preset.
- Section headings are `font-display text-[22px] text-text-bright`, in **sentence case**. Nav/label
  surfaces are `font-heading text-sm` (add `font-medium` where a label needs to lead). **No caps
  treatment anywhere**: no `uppercase` utility, no literal caps, no `.toUpperCase()`. The two roles own
  their weight (`--font-display--font-variation-settings`) and tracking (the two rules at the foot of
  `index.css`), so a heading never carries `tracking-*` of its own. Acronyms (KDA, CS, TBD, CCS) are
  written as acronyms; everything else is a sentence.
- Mobile breakpoint is `useWindowSize() < 768`, checked in JS rather than a `md:` variant where
  the two layouts genuinely differ. One custom breakpoint, `nav:` (1460px, `--breakpoint-nav` in
  `index.css`), is the width from which the desktop nav fits on a single row; below it the tab strip
  takes a second row. It is the nav's and nothing else's — a content column has no business keying
  off it.
- **Images go through `components/ImageUpload.tsx`.** `ImageUpload` owns one URL (a team logo, an
  article header); `ImageUploadButton` produces a URL and hands it back for a caller that is inserting
  into something else. Never write a second file picker: the 5 MB limit, the accepted types and the
  `429`/`503` copy all live in `lib/api/uploads.ts` and would drift immediately. **The stored value is
  always a URL** — uploading produces one, it is not a different kind of value — which is what keeps
  every form working on a deployment with no storage configured, where the route answers `503` and the
  paste field is the whole feature.
- A Markdown body field is `content/MarkdownEditor.tsx`, not a bare `<textarea>`: it carries the image
  inserter, which writes the tag at the cursor rather than appending.
- Errors from the API are shown **verbatim** (`ErrorLine`) — they are written to be read, `409`s on the application surface included. There is no longer any place in the API layer that rewrites a server message.
- A per-conf control the viewer may not be able to use is hidden with `hasScope(league, scope)` rather than offered and left to `403`. **An empty scope list means "cannot tell", not "no access"** — an older server sends none, and reading it as refusal hides every control from everybody mid-rollout.
- Placeholders use `ComingSoon({ needs })` and must name the endpoint that unblocks them.
- Real navigation uses `<Link>` and `aria-current`, not `role="tablist"`.

### Comments

Comment the *why*, not the *what* — the existing headers are the house style and are worth
matching. A non-obvious workaround, an ordering guarantee, or a deliberate staleness choice
should say so; a line that restates the code should not exist.

---

## Running it

`pnpm build` is `tsc --noEmit && vite build`, and the typecheck is doing real work — the
phase payload is a discriminated union on `kind`, so an unnarrowed `phase.groups` is a compile
error rather than a runtime `undefined`. There is no test framework.

pnpm is the package manager: `pnpm install` (CI uses `--frozen-lockfile`), `pnpm-lock.yaml` is
committed, and `package.json`'s `packageManager` field is what pins the version for both Corepack
and `pnpm/action-setup` in the workflows. `pnpm-workspace.yaml` carries pnpm settings only — there
is no workspace; this is a single package.

**Brycen runs the toolchain.** Don't run `pnpm`/`npm`/`node`/`npx` yourself — make the edits, then
tell him the exact command to run (e.g. `! pnpm build`) and wait for the output.
