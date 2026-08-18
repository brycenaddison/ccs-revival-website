# Working in this repo

The CCS website. Vite + React 18 + TypeScript, TanStack Query v5, react-router-dom v6,
Tailwind v4 (CSS-first — the theme lives in `@theme` in `src/index.css`, there is no
`tailwind.config`). `lucide-react` for icons, and **no component library**: everything on
screen is written here.

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
  the behaviour.

---

## Repo map

### Entry & providers

| File | What it is |
| --- | --- |
| `src/main.tsx` | Router, `QueryClient` (60s default staleTime, no retry on 4xx), provider nesting: `QueryClientProvider` → `BrowserRouter` → `AuthProvider` → `LeagueProvider`. Every route is declared here; there is no lazy loading. |
| `src/lib/authContext.tsx` | `AuthProvider`, `useAuth()`. Session identity, roles, `hasRole`, `logout`, `refresh`. |
| `src/lib/leagueContext.tsx` | `LeagueProvider`, `useLeague()`, `useSeasonLink()`. Owns the `?conf=` param (`CONF_PARAM`, `CURRENT`) and the tournament list. |
| `src/lib/tabs.ts` | `TABS` — the nav registry. Tabs without `standalone` all render `Home`; `tabForPathname` resolves the active one. |
| `src/assets/` | Build-bundled artwork. `ccs-logo.png` is the shared desktop/mobile brand mark rendered by `NavBar`. |
| `static/` | Vite's configured `publicDir`: favicon files, Apple touch icon, Android/PWA icons, and `site.webmanifest`. Assets here are served and copied to the build root. |

Routes: `/` + the non-standalone `TABS` paths → `Home`; `/scores`, `/schedule`, `/stats`, `/info`,
`/teams/:conf/:code`, `/match/:id`, `/game/:matchId`, `/players/:profileId`, `/register`, `/login`,
`/setup`, `/settings/:section?`, `/admin/:section?`, `/league/:conf/admin/:section?`, `*` →
`NotFound`. The whole tree sits inside `SetupGate`, which holds a signed-in user with an incomplete
profile on `/setup`.

The browser says `players` where the API says `profiles`: the public concept is a player, while
`profile` stays the server's durable identity model.

### API layer — `src/lib/api/`

Import from the barrel: `import { … } from "../lib/api"` (`index.ts` re-exports everything).

| File | Purpose |
| --- | --- |
| `http.ts` | **Anonymous** transport. `getList`, `getOne`, `post`, `ApiError`, `errorMessage`, `isAbort`, `API_BASE`. Never sends credentials — the public routes use a wildcard CORS origin, which a browser rejects on a credentialed request. |
| `credentialed.ts` | **Signed-in** transport. `credentialedRequest(path, {method, body})`, `SaveRejected`, `issuesOf`, `ValidationIssue`. Sends `credentials: "include"`; the JSON content type is the CSRF defence, not decoration. A `422` becomes `SaveRejected` carrying field-pointer issues. |
| `normalize.ts` | Boundary coercion: `num`, `numOrNull`, `ratio`, `fmtPct`, `fmtRatio`, `fmtSec`, `hexFromInt`, `lighten`, `httpsUrl`, `sortValue`, plus the role vocabulary (`ROLE_ORDER`, `normalizeRole`, `roleLabel`, `sortByRole`). |
| `client.ts` | Public reads: tournaments, teams, standings, stats, records, match data. |
| `feed.ts` | The public fixture feed + one series in full (`scheduleFeed`, `matchResult`). |
| `profiles.ts` | The player-profile surface. `GET /profiles/:id/accounts` is the only public read that hits Riot at request time, so entries degrade one at a time and `ranked: null` (Riot declined) is not `ranked: []` (unranked). `GET /profiles/:id?conf=` is the whole `/players/:id` page in one request. Three of its shapes are easy to get wrong: `career.teams` carries full `TeamRecord`s (mapped with `client.ts`'s `mapTeamRecord`, not a second mapper) while opponents carry compact `TeamMetadata`; `opponent` is the **object** and `opponentCode` the string, on games, series and personal bests alike; and `career.laneMatchups` is **per conference and never merged**, so `(conf, profileId)` identifies a row. `accolades` is career-wide *even when `?conf=` scopes the statistics*. |
| `info.ts` | League Info documents: public `GET /:conf/info`, draft-aware `GET /:conf/info/manage`, and complete-document `PUT /:conf/info`. Ordered quick links plus Markdown; writes require full admin access to that conf. |
| `seasonView.ts` | `GET /:conf/season` — the season **as rendered**. See below. |
| `season.ts` | `GET /:conf/phases` — the season's **structure**, site-admin only. See below. |
| `schedule.ts` | League-admin schedule surface: matches, forfeits, tournament codes, game linking. |
| `admin.ts` | Site-admin surface: `/admin/users`, `/admin/leagues`. The clearest small example of the write idiom — read it before adding a new mutating module. |
| `auth.ts` | `/auth/me`, login/logout, `SITE_ADMIN_ROLE`, `Identity`, `SessionProfile`, `AdminLeague`. |
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

- `layout/PageShell.tsx` — `<PageShell maxWidth={1280} ticker extraBottom>`. The page chrome
  every page mounts. Created because Home and Stats hand-rolled it and drifted; don't
  hand-roll it again.
- `auth/RequireAuth.tsx` — `<RequireAuth roles={[…]} allow={boolean|null}>`. `allow: null`
  means "still resolving" and holds the checking state. Also exports `NoticePanel`.
- `settings/SettingsShell.tsx` — the sidebar + mobile drill-down shell shared by all three
  settings areas.
- `settings/SettingsSection.tsx` — `SectionFrame`, `SettingsRow`, `ReadOnlyValue`,
  `ComingSoon({ needs })`. The vocabulary a settings/admin section is written in.
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
  `avgKdaText`, and the `winRateTone`/`kdaTone` colour scales. `PlayerLink.tsx` is the canonical
  player link used site-wide. The page builds two indexes from its single payload and passes them
  down — `TeamIndex` over `career.teams` for the player's own team, and `matchId → ProfileGame` for
  the personal-best cards and the series grouping. **Never fetch a team, a game or a season here**:
  one request answers the page, and the joins are map lookups over what it returned.
  Layout splits by shape of question, not importance: the rail is the lists that read fine at 320px
  (accounts, roles, champion pool, lane matchups, teams) and the wide column is the numbers and the
  game rows. `CareerTiles` deliberately omits games/record/win-rate/KDA — the header already shows
  them. `MatchupCard` is the one place the page sums across the API's rows; its header explains why
  that is safe.
- `gameAssets.ts` + `useGameAssets()` — Community Dragon item and summoner-spell lookups, built the
  same way as `championData.ts`/`useChampions()`. **The only place on the site items or spells
  appear**, because the API has no columns for either: they exist solely in the raw Riot payload
  behind `GET /m/:matchId`, which the profile's game rows fetch lazily on expand. Don't write a bare
  `<img>` for an item or a spell any more than for a champion.
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

League Admin → Info Page is `src/components/league/info/InfoSection.tsx`. There is exactly one
document per conf, so it uses a complete-document `PUT`; link order is editor-owned and must never
be sorted in the client. The reader is the standalone `/info` tab in `src/pages/Info.tsx`, mounts the
shared scoreboard ticker like the other public data tabs, and renders every conf when the `current`
selection resolves to concurrent leagues.

### Deliverables

Design docs for this project live in `C:\Users\baddison\Claude\ccs-revival-website\`, not in the
repo. `API-GAP-ANALYSIS.md` there tracks endpoints the site wants and the API doesn't serve yet.

---

## Season day is internal

`seasonDay` is a season-wide ordinal — day 1 of the season through day 16 — and the API
serves it on most reads, because it is what `series` groups on and what a tournament code is
minted against. It is a **join key, not a label**.

Do not put it on a reader-facing surface. It is not a date, it is not a week number a viewer
would recognise, and it collides with the numbering that *is* meaningful in context: a
bracket's rounds are numbered within their phase, so "Round 4" and "Day 14" on the same
heading read as a contradiction. Show the date instead — `fmtDay` and `fmtKickoff` in
`src/lib/utils.ts` — or show nothing.

Two exceptions already on the site, both deliberate: the admin screens name it outright
(`season day 14`), because an admin is working in the same coordinates the API is; and the
stats tables carry a `W14` / `Week` column, where it is a sortable value rather than a
caption.

## Two season reads, and they are not interchangeable

- `src/lib/api/seasonView.ts` — `GET /:conf/season`, the season **as rendered**. Public,
  anonymous, resolved values, unpublished phases absent. Everything a viewer sees.
- `src/lib/api/season.ts` — `GET /:conf/phases`, the season's **structure**. Site-admin only,
  credentialed, unresolved nulls that mean "inherit". Only the structure editor loads it.

Loading an editor from the rendering read pins every inherited value as an override. The
header comment on each file says so at more length; read it before adding a caller.

---

## Conventions

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
  header comment explaining the upstream behaviour it is compensating for.
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
  into a component. Unrecognised enum members are **dropped, not repaired**.
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
- Never call `fetch` from a component.

### UI

- Reach for `PageShell`, `SectionFrame`/`SettingsRow`, `LABEL_CLASS`/`CONTROL_CLASS` and the
  `ACTION*` strings before writing new markup. New shared primitives go in the nearest
  existing `*Ui.tsx`-style module, not inline.
- Tailwind utilities only, against the `@theme` tokens — no raw hex, no inline colour styles.
  Available: `bg`/`bg2`/`bg3`/`bg-input`, `border`/`border2`/`border3`,
  `text`/`text-bright`/`text-secondary`/`text-muted`/`text-dim`/`text-subtle`,
  `accent`/`accent-light`, `ccs-green`/`ccs-red`/`ccs-gold`/`ccs-blue`/`ccs-orange`/`ccs-purple`.
  Fonts: `font-display` (Bebas Neue), `font-heading` (Oswald), `font-body` (Source Sans 3),
  `font-mono` (JetBrains Mono). Both themes must work — that's what the tokens are for.
- Section headings are `font-display text-[22px] text-text-bright tracking-widest` with
  uppercase literal text. Nav/label surfaces are `font-heading text-sm tracking-wider uppercase`.
- Mobile breakpoint is `useWindowSize() < 768`, checked in JS rather than a `md:` variant where
  the two layouts genuinely differ.
- Errors from the API are shown **verbatim** (`ErrorLine`) — they are written to be read.
- Placeholders use `ComingSoon({ needs })` and must name the endpoint that unblocks them.
- Real navigation uses `<Link>` and `aria-current`, not `role="tablist"`.

### Comments

Comment the *why*, not the *what* — the existing headers are the house style and are worth
matching. A non-obvious workaround, an ordering guarantee, or a deliberate staleness choice
should say so; a line that restates the code should not exist.

---

## Running it

`npm run build` is `tsc --noEmit && vite build`, and the typecheck is doing real work — the
phase payload is a discriminated union on `kind`, so an unnarrowed `phase.groups` is a compile
error rather than a runtime `undefined`. There is no test framework.

**Brycen runs the toolchain.** Don't run `npm`/`node`/`npx` yourself — make the edits, then
tell him the exact command to run (e.g. `! npm run build`) and wait for the output.
