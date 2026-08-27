import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ApiError } from './lib/api'
import Home from './pages/Home'
import { LeagueProvider } from './lib/leagueContext'
import { AuthProvider } from './lib/authContext'
import { SetupGate } from './components/auth/SetupGate'
import { PageShell } from './components/layout/PageShell'
import { TABS } from './lib/tabs'
import './index.css'

// The public home is the initial route, so it stays eager. Every other page is fetched only when its
// route is visited; this keeps settings and admin editors out of the first public page download.
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
const PlayerProfile = lazy(() => import('./pages/PlayerProfile'))
const NotFound = lazy(() => import('./pages/NotFound'))

function RouteLoading() {
  return (
    <PageShell>
      <div className="py-16 text-center text-text-subtle">Loading…</div>
    </PageShell>
  )
}

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
              <Suspense fallback={<RouteLoading />}>
                <Routes>
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
              <Route path="/teams/:conf/:code" element={<TeamPage />} />
              {/* `:id` is a `schedule_match` id. The old form took a synthesised series key
                  (`4:w1:ANE_vs_XSV`) because there was no endpoint that answered "this fixture" —
                  `GET /tournaments/schedule/:id/result` is that endpoint. */}
              <Route path="/match/:id" element={<MatchDetail />} />
              <Route path="/game/:matchId" element={<GameDetail />} />
              <Route path="/register" element={<Register />} />
              <Route path="/login" element={<Login />} />
              <Route path="/setup" element={<Setup />} />
              <Route path="/players/:profileId" element={<PlayerProfile />} />
              {/* News is a tab (see `lib/tabs.ts`) but standalone, because it reads `/articles`
                  alone and none of the league data `Home` loads. `/news/:slug` renders a native
                  article; a link article's cards go straight to their source, so this route only
                  sees one when a URL was shared. */}
              <Route path="/news" element={<News />} />
              <Route path="/news/:slug" element={<Article />} />
              <Route path="/info" element={<Info />} />
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
              {/* The catch-all, and it has to exist because of the nginx SPA fallback: every unmatched
                  URL is served `index.html` so a refresh on `/schedule` works, so a typo arrives here
                  rather than at the server's own 404. Without it `Routes` rendered nothing and a bad
                  URL was a blank page. Position is cosmetic — React Router ranks routes by specificity,
                  not source order, and `*` scores last by construction. */}
              <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </SetupGate>
          </LeagueProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
)
