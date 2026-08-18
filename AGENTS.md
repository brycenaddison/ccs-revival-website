# Working in this repo

The CCS website: Vite + React 18 + TypeScript, TanStack Query v5, React Router v6 and Tailwind v4
(CSS-first theme in `src/index.css`). The API is the read-only sibling repo `../tournament-bot`; its
`docs/API.md` is the contract. Do not derive data the API already answers.

Do not run `npm`, `node`, `npx` or `ts-node`. Brycen runs the toolchain. After edits, ask him to run
`! npm run build` and paste the output. There is no test framework.

## Fast map

- `src/main.tsx`: providers and every route. Public player profiles are `/players/:profileId`; first-time
  identity setup is `/setup`.
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
- `src/components/profile/RiotAccountCards.tsx`: shared Riot identity/rank cards for Settings and
  public profiles.
- `src/pages/PlayerProfile.tsx`: public cross-season profile — a rail (accounts, roles, champion
  pool, lane matchups, teams) beside a wide column (career tiles, personal bests, match history). It
  renders API-owned totals, bests, breakdowns, games and series in served order; `?conf=` scopes it.
  One request answers the page; the joins are map lookups over that payload, never extra fetches.
  Career tiles omit games/record/win-rate/KDA because the identity header already carries them.
- `src/components/profile/profileUi.tsx`: the profile's shared vocabulary — `RailCard`,
  `ProfileSection`, `TeamLogo`/`TeamChip`, `useConfLabel()` (conf slugs are never shown to readers),
  `metricText`, `kdaText` (KDA's `Infinity` reads "Perfect"), `avgKdaText`, and the
  `winRateTone`/`kdaTone` colour scales. Every KDA on the page goes through `kdaText`.
- `src/components/profile/MatchHistory.tsx`: series and games as one list, joined through
  `matches[].gameIds`. Series order is the API's; games sort G1-first within a series.
- `src/lib/gameAssets.ts` + `src/hooks/useGameAssets.ts`: Community Dragon item and summoner-spell
  lookups, the only source of either on the site. Fetched lazily by an expanded game row.
- `src/pages/Setup.tsx`: first-time public presentation setup.
- `src/components/settings/profile/AccountSection.tsx`: later edits to the same public presentation
  document plus read-only Discord identity.
- `src/components/settings/profile/ConnectionsSection.tsx`: signed-in linked Riot accounts.

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
