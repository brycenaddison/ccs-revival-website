import React, { lazy } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ApiError } from './lib/api'
import Home from './pages/Home'
import { LeagueProvider } from './lib/leagueContext'
import { AuthProvider } from './lib/authContext'
import { SetupGate } from './components/auth/SetupGate'
import { BareLayout, SiteLayout } from './components/layout/SiteLayout'
import { TABS } from './lib/tabs'
import { installStaleChunkReload } from './lib/staleChunk'
import './index.css'

// Before anything renders: a lazy route whose chunk a deploy has since renamed reloads the page
// once instead of unmounting the tree. See the header of `lib/staleChunk.ts`.
installStaleChunkReload()

// The public home is the initial route, so it stays eager. Every other page is fetched only when its
// route is visited; this keeps settings and admin editors out of the first public page download.
// The `<Suspense>` these resolve against is inside `SiteLayout`, wrapping the content column — so a
// chunk still downloading blanks the column and not the nav and ticker above it.
const Scores = lazy(() => import('./pages/Scores'))
const Schedule = lazy(() => import('./pages/Schedule'))
const MatchDetail = lazy(() => import('./pages/MatchDetail'))
const GameDetail = lazy(() => import('./pages/GameDetail'))
const TeamPage = lazy(() => import('./pages/TeamPage'))
const Stats = lazy(() => import('./pages/Stats'))
const Register = lazy(() => import('./pages/Register'))
const Login = lazy(() => import('./pages/Login'))
const Settings = lazy(() => import('./pages/Settings'))
const SiteAdmin = lazy(() => import('./pages/SiteAdmin'))
const LeagueAdmin = lazy(() => import('./pages/LeagueAdmin'))
const ContentPortal = lazy(() => import('./pages/ContentPortal'))
const News = lazy(() => import('./pages/News'))
const Article = lazy(() => import('./pages/Article'))
const Info = lazy(() => import('./pages/Info'))
const Setup = lazy(() => import('./pages/Setup'))
const TeamInvitations = lazy(() => import('./pages/TeamInvitations'))
const MyApplications = lazy(() => import('./pages/MyApplications'))
const PlayerProfile = lazy(() => import('./pages/PlayerProfile'))
const NotFound = lazy(() => import('./pages/NotFound'))

/**
 * One cache for the whole app. Per-query staleness lives in `lib/queries.ts`; this sets the floor.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: (attempt, error) => {
        // A 4xx is a bad request, not a blip — an unknown conf will still be unknown on the third
        // try. Absence never reaches here: the client resolves a 404 to empty rather than throwing.
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return attempt < 2;
      },
    },
  },
})

// The settings areas (`/settings`, `/admin`, `/league/:conf/admin`) all render the same shell from a
// section registry — see `lib/settingsAreas.ts`. The shell, the routing and the permission gates are
// live; most *sections* are placeholders, because the CCS API is read-only and the admin CRUD
// surface doesn't exist yet. The Supabase-era dashboard those sections replace is preserved in
// src/_disabled/ — see the gap analysis for the endpoints each one needs.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <LeagueProvider>
            <SetupGate>
              <Routes>
                {/* Three layout routes, and the split is which chrome the group wears: the public
                    data tabs carry the scoreboard ticker, the rest of the shell-wearing pages don't,
                    and the full-bleed pages wear none. Grouping them this way is what makes the
                    chrome persistent — one `SiteLayout` instance stays mounted across every page
                    inside its group, so the ticker keeps polling and keeps the position it scrolled
                    itself to instead of being remounted on every click. Each page still declares its
                    own content width through `PageShell`. */}
                <Route element={<SiteLayout ticker />}>
                  {/* Every tab is its own URL. The sections of `Home` all mount the same element, which
                      React reconciles in place — switching between them is not a remount, so the league
                      data loads once rather than on every click. Tabs marked `standalone` are their own
                      page and declare their route below. */}
                  {TABS.filter(t => !t.standalone).map(t => (
                    <Route key={t.path} path={t.path} element={<Home />} />
                  ))}
                  <Route path="/scores" element={<Scores />} />
                  <Route path="/schedule" element={<Schedule />} />
                  <Route path="/stats" element={<Stats />} />
                  <Route path="/info" element={<Info />} />
                  {/* News is a tab (see `lib/tabs.ts`) but standalone, because it reads `/articles`
                      alone and none of the league data `Home` loads. */}
                  <Route path="/news" element={<News />} />
                </Route>

                <Route element={<SiteLayout />}>
                  <Route path="/setup" element={<Setup />} />
                  <Route path="/players/:profileId" element={<PlayerProfile />} />
                  {/* `/news/:slug` renders a native article; a link article's cards go straight to
                      their source, so this route only sees one when a URL was shared. */}
                  <Route path="/news/:slug" element={<Article />} />
                  {/* The two applicant pages. `/register` moved out of `BareLayout` when it became a
                      real form: it is reached from a nav button now, and a page you arrive at from
                      the nav should not delete the nav. Its old hand-rolled header went with it.
                      `/team-invitations`' path is fixed by the bot rather than chosen here — its
                      invitation DM links there, so this route is what stops every one of those
                      notifications landing on the catch-all below. */}
                  <Route path="/register" element={<Register />} />
                  <Route path="/team-invitations" element={<TeamInvitations />} />
                  {/* The account menu's "My applications": every team the member has submitted, across
                      every open league, with nowhere to start a new one. Starting stays on `/register`. */}
                  <Route path="/my-applications" element={<MyApplications />} />
                  {/* Each settings area is two routes rather than one optional `:section?` segment.
                      The no-slug form is a real state — it's the mobile section list, and on desktop it
                      redirects to the first section — so spelling both out keeps that explicit. */}
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/settings/:section" element={<Settings />} />
                  <Route path="/admin" element={<SiteAdmin />} />
                  <Route path="/admin/:section" element={<SiteAdmin />} />
                  <Route path="/league/:conf/admin" element={<LeagueAdmin />} />
                  <Route path="/league/:conf/admin/:section" element={<LeagueAdmin />} />
                  <Route path="/content" element={<ContentPortal />} />
                  <Route path="/content/:section" element={<ContentPortal />} />
                  {/* The three data pages that used to be full-bleed. They wear the nav now, because a
                      reader who arrives from a Discord embed or a shared link has no other way to the
                      rest of the site; each still carries a small back link at the top of its content.
                      `:id` on `/match` is a `schedule_match` id. The viewer's tabs are URL segments
                      (`lib/game/tabs.ts`); its bare path is fixed by the bot's embeds and eight in-app
                      links. */}
                  <Route path="/teams/:conf/:code" element={<TeamPage />} />
                  <Route path="/match/:id" element={<MatchDetail />} />
                  <Route path="/game/:matchId" element={<GameDetail />} />
                  <Route path="/game/:matchId/:tab" element={<GameDetail />} />
                  {/* The catch-all, and it has to exist because of the nginx SPA fallback: every unmatched
                      URL is served `index.html` so a refresh on `/schedule` works, so a typo arrives here
                      rather than at the server's own 404. Without it `Routes` rendered nothing and a bad
                      URL was a blank page. Position is cosmetic — React Router ranks routes by specificity,
                      not source order, and `*` scores last by construction. */}
                  <Route path="*" element={<NotFound />} />
                </Route>

                {/* No chrome: the sign-in bounce draws nothing but its own notice. `BareLayout` is
                    here only to give its lazy chunk a `<Suspense>` boundary — see its header. */}
                <Route element={<BareLayout />}>
                  <Route path="/login" element={<Login />} />
                </Route>
              </Routes>
            </SetupGate>
          </LeagueProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
)
