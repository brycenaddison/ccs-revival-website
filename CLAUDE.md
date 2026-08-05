# Working in this repo

The CCS website. Vite + React 18 + TypeScript, TanStack Query v5, react-router-dom v6,
Tailwind v4 (CSS-first — the theme lives in `@theme` in `src/index.css`, there is no
`tailwind.config`). `lucide-react` for icons, and **no component library**: everything on
screen is written here.

The API is a separate repo, `tournament-bot`, whose `docs/API.md` is the contract. Nothing
here should re-derive something that file says the server already answers.

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

## Conventions

- **Dates stay ISO strings** through the whole API layer (`strOrNull`). `new Date()` happens
  at the point of use, never in a mapper.
- **Rows are rendered in the order served.** Standings are never re-sorted or renumbered by
  row index — the ranking resolves head-to-head, which nothing on this page could reconstruct,
  and teams level on every tiebreaker legitimately share a rank.
- Query keys and their invalidation roots live in one place, `src/lib/queries.ts`.

## Running it

`npm run build` is `tsc --noEmit && vite build`, and the typecheck is doing real work — the
phase payload is a discriminated union on `kind`, so an unnarrowed `phase.groups` is a compile
error rather than a runtime `undefined`. There is no test framework.
