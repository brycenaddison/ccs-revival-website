# Working in this repo

The CCS website. Vite + React 19 + TypeScript, TanStack Query v5, react-router-dom v6,
Tailwind v4 (CSS-first — the theme lives in `@theme` in `src/index.css`, there is no
`tailwind.config`). `lucide-react` for icons, and **no component library**: everything on
screen is written here. **pnpm** is the package manager — `pnpm-lock.yaml` is the committed
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
| `src/lib/leagueContext.tsx` | `LeagueProvider`, `useLeague()`, `useSeasonLink()`. Owns the `?conf=` param (`CONF_PARAM`, `CURRENT`) and the tournament list. |
| `src/lib/tabs.ts` | `TABS` — the nav registry. Tabs without `standalone` all render `Home`; `tabForPathname` resolves the active one. |
| `src/assets/` | Build-bundled artwork. `ccs-logo.png` is the shared desktop/mobile brand mark rendered by `NavBar`. |
| `static/` | Vite's configured `publicDir`: favicon files, Apple touch icon, Android/PWA icons, and `site.webmanifest`. Assets here are served and copied to the build root. |

Routes: `/` + the non-standalone `TABS` paths → `Home`; `/scores`, `/schedule`, `/stats`, `/info`,
`/teams/:conf/:code`, `/match/:id`, `/game/:matchId`, `/players/:profileId`, `/register`, `/login`,
`/setup`, `/team-invitations`, `/settings/:section?`, `/admin/:section?`,
`/league/:conf/admin/:section?`, `*` →
`NotFound`. The whole tree sits inside `SetupGate`, which holds a signed-in user with an incomplete
profile on `/setup`.

`/team-invitations` is spelled that way because the **bot's invitation DM links to it literally** —
`tournament-bot/src/utils/teamInvitationDiscord.ts` builds `FRONTEND_URL + "/team-invitations"`.
Renaming it sends every invitation notification to the catch-all.

Three route groups, and the group is what decides a page's chrome:

- **`SiteLayout ticker`** — the non-standalone `TABS` paths, `/scores`, `/schedule`, `/stats`,
  `/info`, `/news`. Adding a public data tab means adding it here; a page never mounts
  `ScoreboardTicker` itself.
- **`SiteLayout`** — the same chrome without the strip: `/setup`, `/players/:profileId`,
  `/news/:slug`, `/register`, `/team-invitations`, `/settings`, `/admin`, `/league/:conf/admin`,
  `/content`, and `*`. `/register` moved here from `BareLayout` when it stopped being a signpost and
  became the application form: it is reached from a nav button now, and a page you arrive at from the
  nav should not delete the nav.
- **`BareLayout`** — `/match/:id`, `/game/:matchId`, `/teams/:conf/:code`, `/login`.
  These render no nav and no footer at all — each draws its own header with a back button
  (`useBackNavigation`) — so they must **not** be moved under `SiteLayout`, which would give them a
  second header and a content column they don't want. `BareLayout` exists to give their lazy chunks
  a `<Suspense>` boundary and nothing else.

The browser says `players` where the API says `profiles`: the public concept is a player, while
`profile` stays the server's durable identity model.

### API layer — `src/lib/api/`

Import from the barrel: `import { … } from "../lib/api"` (`index.ts` re-exports everything).

| File | Purpose |
| --- | --- |
| `http.ts` | **Anonymous** transport. `getList`, `getOne`, `post`, `ApiError`, `errorMessage`, `isAbort`, `API_BASE`. Never sends credentials — the public routes use a wildcard CORS origin, which a browser rejects on a credentialed request. |
| `credentialed.ts` | **Signed-in** transport. `credentialedRequest(path, {method, body})`, `SaveRejected`, `issuesOf`, `ValidationIssue`. Sends `credentials: "include"`; the JSON content type is the CSRF defense, not decoration. A `422` becomes `SaveRejected` carrying field-pointer issues. |
| `normalize.ts` | Boundary coercion: `num`, `numOrNull`, `ratio`, `fmtPct`, `fmtRatio`, `fmtSec`, `hexFromInt`, `lighten`, `httpsUrl`, `sortValue`, plus the role vocabulary (`ROLE_ORDER`, `normalizeRole`, `roleLabel`, `sortByRole`). |
| `client.ts` | Public reads: tournaments, teams, standings, stats, records, match data. |
| `feed.ts` | The public fixture feed + one series in full (`scheduleFeed`, `matchResult`). |
| `profiles.ts` | The player-profile surface. `GET /profiles/:id/accounts` is the only public read that hits Riot at request time, so entries degrade one at a time and `ranked: null` (Riot declined) is not `ranked: []` (unranked). `GET /profiles/:id?conf=` is the whole `/players/:id` page in one request. Three of its shapes are easy to get wrong: `career.teams` carries full `TeamRecord`s (mapped with `client.ts`'s `mapTeamRecord`, not a second mapper) while opponents carry compact `TeamMetadata`; `opponent` is the **object** and `opponentCode` the string, on games, series and personal bests alike; and `career.laneMatchups` is **per conference and never merged**, so `(conf, profileId)` identifies a row. `accolades` is career-wide *even when `?conf=` scopes the statistics*. It also owns the player-owned account writes: `unverifiedAccounts` are **claims, not identity** (display and the OP.GG link only — the same account may be claimed by several profiles until one proves it), and `checkIconVerification` returns upstream's `410`/`429`/`404` refusals **as values** rather than throwing, because those bodies carry a status and no readable message. It also owns `searchProfiles` — the **public** `GET /profiles/search`, whose optional `conf` narrows to profiles a published team in that conference references, and therefore *excludes* anyone unrostered rather than ranking them lower. |
| `uploads.ts` | `POST /uploads/images`. **The one write with its own `fetch`**, and it has to be: the route takes the raw file bytes as the body and reads the image type off `Content-Type`, which is exactly what `credentialed.ts` cannot do. Exports `uploadImage`, `UploadRejected` (every refusal already worded for a person — 5 MB, wrong type, 20/hour quota, storage unconfigured), and the type/size mirrors the picker filters against. |
| `info.ts` | League Info documents: public `GET /:conf/info`, draft-aware `GET /:conf/info/manage`, and complete-document `PUT /:conf/info`. Ordered quick links plus Markdown; writes require full admin access to that conf. **`rulebookUrl` is a required first-class field, not a quick link** — the team application form reads it directly, so it cannot be identified by matching a label an editor can rename. Upstream matches keys exactly, so `LeagueInfoInput` has to stay in lockstep with the server's `BODY_KEYS`. |
| `seasonView.ts` | `GET /:conf/season` — the season **as rendered**. See below. |
| `season.ts` | `GET /:conf/phases` — the season's **structure**, site-admin only. See below. |
| `schedule.ts` | League-admin schedule surface: matches, forfeits, tournament codes, game linking. |
| `admin.ts` | Site-admin surface: `/admin/users`, `/admin/leagues`. The clearest small example of the write idiom — read it before adding a new mutating module. `GET /admin/leagues` is the **unfiltered** league list; `LeagueEdit.listed` is typed as the literal `false`, because upstream refuses `true` there. |
| `teamApplications.ts` | The upcoming-season workflow: intake, applicant drafts, Discord invitations, roster review, and the publication command. Exports `refusalOf`, which lifts `issues` off a `409` — every refusal on this surface answers one shape, `{status, error, issues?}`, so `error` rides in `ApiError.detail` and there is nothing left to translate. `InvitationInput` takes **exactly one** of `discordUserId` (a new invitee, guild membership rechecked) or `profileId` (somebody already on the roster — the only way to change their position). `confName` is served flat because an application only exists while its conference is hidden. |
| `accolades.ts` | Reusable accolade definitions (site-wide or conf-owned) and the occurrences issued under them. Both write documents are exact-key, so there is no partial patch. A **team** award sends no profile list — the server expands that team's current roster. |
| `auth.ts` | `/auth/me`, login/logout, `SITE_ADMIN_ROLE`, `Identity`, `SessionProfile`, `AdminLeague`, `AccountVerificationMethods`. The last is configuration, not permission: a method whose settings are missing answers 404 or 503, so a control that starts one is rendered from these flags and absence reads as off. |
| `league.ts` | Conf helpers: `sortByRecency`, `recencyKey`, `resolveActiveConfs`, `forEachConf`. |
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
`useChampions`, `useWindowSize`, `useDebounced`, `useDragScroll`, `useGoBack`.
Match and game detail pages use `useBackNavigation(fallback)` so their button says Home on a
cold/direct arrival and Back when it can preserve useful in-app navigation.

### Components — `src/components/`

- `layout/SiteLayout.tsx` — the chrome (ticker, nav, content column, footer, mobile tab bar) as a
  react-router **layout route**, mounted once per route group rather than once per page. `ticker` is
  a boolean prop set in `main.tsx`, because which routes show the strip is a property of the group.
  Persisting it is the point: the ticker polls `GET /schedule` and scrolls itself to the live series,
  and a per-page copy was remounted and re-anchored on every click. It also owns the lazy-route
  `<Suspense>` boundary, so a downloading page chunk blanks the column and not the nav above it.
  Exports `BareLayout` alongside it — the same boundary with no chrome, for the full-bleed pages.
- `layout/PageShell.tsx` — `<PageShell maxWidth={1280} extraBottom>`. Still the wrapper every page
  renders, but it draws nothing: it publishes the column width and extra bottom padding up to
  `SiteLayout` through `PageColumnContext` (a `useLayoutEffect`, so the column never paints at the
  previous page's width). Those two values are why the chrome wasn't a layout route before — Home is
  wider than Stats, and Stats' padding depends on its compare-dock selection. A page still adds the
  chrome by being routed under a `SiteLayout`; don't hand-roll either half.
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
- `admin/adminUi.tsx` — button class strings (`ACTION`, `ACTION_PRIMARY`, `ACTION_DANGER`,
  the `_SM` variants, `ACTION_QUIET`), `ErrorLine`, `Pill`.
- `stats/FilterBar.tsx` — exports `LABEL_CLASS` and `CONTROL_CLASS`, the repo's de-facto form
  label and input tokens. Imported from outside `stats/` all over; that import path is ugly
  but it is the convention.
- `Toast.tsx`, `ThemeToggle.tsx`, `TeamBadge.tsx`, `ScrollRail.tsx` — standalone primitives.
- `ChampionIcon.tsx` — **the only way a champion's square icon reaches the screen.** Takes either an
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
  empty, which is why the numbers use `ml-auto` rather than the row using `justify-between`.
  Its game rows are one dense line each, with the captions carried once by `GameRowHeader` above the
  list rather than repeated per row — the two-row version wasted its top row on whitespace and shrank
  the numbers past legibility. `GAME_GRID` is shared by the header and the rows; change one, change
  both.
- `gameAssets.ts` + `useGameAssets()` — Community Dragon item and summoner-spell lookups, built the
  same way as `championData.ts`/`useChampions()`. **Deliberately unused right now**: nothing on the
  site shows a build, because the API has no item or spell columns and the only source is the raw
  Riot payload behind `GET /m/:matchId`. Kept for when one is shown again — don't delete them as
  dead code, and don't write a bare `<img>` for an item or a spell any more than for a champion.
- `Markdown.tsx` — the shared safe renderer for native article bodies and league Info pages. It uses
  `remark-gfm` for pipe tables, autolinks, task lists and strikethrough; raw HTML stays disabled. Do
  not introduce a second Markdown policy in a feature folder.
- `match/SeriesTotals.tsx` — series totals and player leaders reduced from the loaded game box scores.
  Rate and efficiency leaders (including damage per gold) use aggregate player totals, not averages of
  per-game rates.
- `match/BanIcons.tsx` — renders every ban slot a payload supplies and deliberately preserves champion
  `-1`, which `ChampionIcon` turns into the no-ban artwork. Both the season-result payload behind
  `/match/:id` and the team matchlist preserve skipped-ban entries.
- `match/MatchResultList.tsx` — the shared team-perspective game row used by a match's Preview tab and a
  team page's Match History: result, opponent, picks, bans, K/D/A, duration, date and side. Callers own
  ordering and truncation. Its draft strip is a fixed-column grid; narrow rows abbreviate Picks/Bans and
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
intake, the review queue and publication on one screen, because they are one job in three stages.
Two scopes live there and the page gate is the wider of them — review is `roster`, intake and publish
are conference `admin` — and `/auth/me` carries no per-grant scope, so a `roster`-only grantee sees
those two controls and gets a verbatim `403`. Same compromise as the Schedule section's `schedule`
scope. It derives intake state from `/tournaments/applications/open` and listing from the public
tournament list rather than from `/admin/leagues`, which is site-admin only and would `403` for the
league admin this page is for.

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
invited answer. Neither works without the other, so change them together.

- `applyUi.tsx` is the vocabulary: `ROLE_LABEL`, `STARTER_ROLES`, `roleSummary`,
  `ApplicationStatusPill` / `InvitationStatusPill`, `MemberAvatar`, `memberLabel`. **The wording is
  the player's, not the API's** — `sup` is "Support", `submitted` is "Waiting on staff", and
  `rejected` is "Changes needed" because upstream lets a rejected application be edited and
  resubmitted. Also `useApplicationConfName`, which exists because `profileUi`'s `useConfLabel`
  resolves against the listed-only tournament list and therefore cannot name the hidden conference
  somebody is applying to.
- `ApplicationForm.tsx` is one form for create **and** replace, because upstream takes one strict
  seven-key document for both and `PUT` is a whole-document replacement — anything the form omits is
  erased, which is why `applicationMetadata` is passed straight back through.
- `ApplicationCard.tsx` owns the roster panel, the readiness checklist and submit/withdraw. Its
  checklist duplicates the server's `publicationIssues` **deliberately**: it is form guidance over
  members already loaded, it decides nothing, and the `409` from Submit stays the authority. Without
  it, Submit fails with a list of surprises.
- `InviteMember.tsx` is guild search plus a role picker. Position is single-choice, matching the
  server's one-playing-role rule. There is no roles-only edit: the invitation route identifies people
  by Discord snowflake and a member row carries none, so changing a position means remove-and-reinvite
  — see §10.8 of `API-GAP-ANALYSIS.md`.

The APPLY NOW button lives in `auth/AuthControl.tsx`, in the same slot the signed-out JOIN CCS
button occupies. It is gated on `isAuthenticated` because `GET /tournaments/applications/open` is
`401` for anonymous callers — which also means the nav cannot offer it to a signed-out visitor at
all (§10.10). The account menu's "Team invitations" row is unconditional, because an invitation can
arrive long after intake closes and the Discord DM is best-effort.

League Admin → Info Page is `src/components/league/info/InfoSection.tsx`. There is exactly one
document per conf, so it uses a complete-document `PUT`; link order is editor-owned and must never
be sorted in the client. The reader is the standalone `/info` tab in `src/pages/Info.tsx`, sits in the
ticker route group like the other public data tabs, and renders every conf when the `current`
selection resolves to concurrent leagues.

`rulebookUrl` is its own **required** field rather than an entry in `links`, because the team
application form reads it directly and a quick link is identified by a label an editor can rename.
That means the reader has to place it explicitly, and it **prepends it as the first quick link** —
otherwise the one document a reader most wants would appear nowhere on the page. Prepending is not
sorting: `links` keeps the order it was given, and the rulebook goes in front of it.

### Deliverables

Design docs for this project live in `C:\Users\baddison\Claude\ccs-revival-website\`, not in the
repo. `API-GAP-ANALYSIS.md` there tracks endpoints the site wants and the API doesn't serve yet.

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
card reads "Playoffs · Semifinals" or "Groups · Day 2 of 4" — `placementLabel` in `MatchHistory.tsx`
— and falls back to `Week {seasonDay}` only where `phase` is `null`, which is a legacy conference
predating the phase list.

Two things never to derive: a **phase** from a season day (phases are keyed by length rather than
start day, so it would take one season read per conference a career spans plus arithmetic that goes
stale the moment structure is edited), and a **round name** from `round` (naming rounds by depth is
wrong for a third-place match and for every loser's bracket).

## `listed`, `applicationsOpen` and `active` are three different questions

A conference carries all three and conflating any two of them breaks something:

| Field | Question it answers |
| --- | --- |
| `listed` | Does this appear in ordinary site selectors? |
| `applicationsOpen` | May signed-in members submit a team for it? |
| `active` | Does it take part in the default cross-league schedule feed? |

A season being prepared is unlisted, closed and inactive. **Publication is one server transaction**:
it inserts every approved team and sets `listed`, `active` and `teamsPublishedAt` together, so there
is no state in which half a field of teams exists. Approval on its own writes no team rows. The
database also refuses open intake on a listed conference, which is what keeps recruiting a
pre-publication operation.

Two consequences for this repo:

- **Public `GET /tournaments` is listed-only.** `LeagueProvider` reads it, so a hidden conference is
  absent from every public selector by construction — never infer listing from teams, schedules,
  dates or `active`.
- **Every admin surface reads `GET /admin/leagues` instead**, because that is the only read that can
  see a hidden draft. `admin/LeaguesSection.tsx` and the site-admin branch of `lib/adminAccess.ts`
  both do. Public navigation must not; a site admin who created a hidden league would otherwise find
  it missing from their own editor.

`listed: true` is refused by `PATCH /admin/leagues/:conf` on purpose — publication is the only path
to public. `false` is available there as an emergency hide, which is why `LeagueEdit.listed` is
typed as the literal `false`.

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

### Data

- **Dates stay ISO strings** through the whole API layer (`strOrNull`). `new Date()` happens
  at the point of use, never in a mapper.
- **Rows are rendered in the order served.** Standings are never re-sorted or renumbered by
  row index — the ranking resolves head-to-head, which nothing on this page could reconstruct,
  and teams level on every tiebreaker legitimately share a rank.
- **Don't compute in the client what the API should answer.** One load plus a trivial
  reduction is fine; anything heavier is a missing endpoint — name it and stop.
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
- Tailwind utilities only, against the `@theme` tokens — no raw hex, no inline color styles.
  Available: `bg`/`bg2`/`bg3`/`bg-input`, `border`/`border2`/`border3`,
  `text`/`text-bright`/`text-secondary`/`text-muted`/`text-dim`/`text-subtle`,
  `accent`/`accent-light`, `ccs-green`/`ccs-red`/`ccs-gold`/`ccs-blue`/`ccs-orange`/`ccs-purple`.
  Fonts: `font-display` (Bebas Neue), `font-heading` (Oswald), `font-body` (Source Sans 3),
  `font-mono` (JetBrains Mono). Both themes must work — that's what the tokens are for.
- Section headings are `font-display text-[22px] text-text-bright tracking-widest` with
  uppercase literal text. Nav/label surfaces are `font-heading text-sm tracking-wider uppercase`.
- Mobile breakpoint is `useWindowSize() < 768`, checked in JS rather than a `md:` variant where
  the two layouts genuinely differ.
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
