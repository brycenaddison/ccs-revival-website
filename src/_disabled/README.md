# Disabled: Supabase-era code

Everything in this folder was wired directly to Supabase (PostgREST for data, GoTrue for
admin auth, Storage for uploads). The site now reads from the tournament-bot CCS API, which
is read-only and has no equivalent for any of it, so this code is parked here rather than
deleted.

It is **excluded from `tsconfig.json`**, so it is not type-checked and not bundled — Vite only
includes what's reachable from `src/main.tsx`. Expect the imports in these files to be stale.

| File | What it did | Blocked on |
|---|---|---|
| `supabase.ts` | `db()` PostgREST wrapper, `Auth` (email/password), `uploadFile()` | Auth endpoints + file uploads |
| `Admin.tsx`, `admin/` | 11-tab admin dashboard (teams, players, rosters, schedule, articles, applications, draft board, socials, divisions, seasons) | Admin CRUD endpoints + real authorization |
| `RegisterForm.tsx` | Public team application form + logo upload | `POST /applications`, upload endpoint, transactional approval |
| `DraftBoard.tsx` | Public draft-board listings (read + write) | Draft listing endpoints, plus resolving the two conflicting column shapes it and the admin tab used |

See `C:\Users\baddison\Claude\ccs-revival-website\API-GAP-ANALYSIS.md` for the endpoints,
schema changes, and auth design needed to bring these back.

**Note:** the Supabase project's anon key was previously hardcoded in `public/stats.html`, a
publicly served asset. That file has been deleted, but the key should be rotated and the
project paused.
