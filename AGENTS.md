# Working in this repo

The CCS website: Vite + React 19 + TypeScript, TanStack Query v5, React Router v6 and Tailwind v4
(CSS-first theme in `src/index.css`). The API is the read-only sibling repo `../tournament-bot`; its
`docs/API.md` is the contract. Do not derive data the API already answers.

Do not run `pnpm`, `npm`, `node`, `npx` or `ts-node`. Humans run the toolchain — pnpm is the package
manager. After edits, you can ask the human to run `pnpm build` and paste the output. There is no test framework.

## Fast map

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
- `src/components/auth/SetupGate.tsx`: one route-tree hard gate for incomplete signed-in profiles.
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
- `src/components/profile/RiotAccountCards.tsx`: shared Riot identity/rank cards. The highest-ranked
  account (`primaryAccount`) renders tall with a single headline rank block; the rest render as one
  compact line each. Riot's ladder has no ordering in its own API — `rankScore` in
  `lib/api/profiles.ts` is where the tier list lives, and `tierLabel` drops the meaningless `I` Riot
  sends for the apex tiers. **Peak rank is not available** — Riot serves only current standing and
  nothing stores history; see §9.4 of the gap analysis.
- `src/pages/Setup.tsx`: first-time public presentation setup.
- `src/components/settings/profile/AccountSection.tsx`: later edits to the same public presentation
  document plus read-only Discord identity.
- `src/components/settings/profile/ConnectionsSection.tsx`: signed-in linked Riot accounts.
- `src/components/settings/profile/UnverifiedAccounts.tsx` + `IconVerification.tsx`: claim a Riot
  account, then prove it by profile icon. Upstream's three limits (fifteen-minute challenge,
  ten-second cooldown, thirty checks) are held as wall-clock instants, never counters. Riot's copy of
  a profile lags the client by about two minutes, so a `pending` straight after the save is expected —
  the copy tells the player to wait before the first Check, and must keep saying so.

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
