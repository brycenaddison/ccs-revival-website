import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ApiError } from './lib/api'
import Home from './pages/Home'
import MatchDetail from './pages/MatchDetail'
import GameDetail from './pages/GameDetail'
import TeamPage from './pages/TeamPage'
import Stats from './pages/Stats'
import Register from './pages/Register'
import Login from './pages/Login'
import { LeagueProvider } from './lib/leagueContext'
import { AuthProvider } from './lib/authContext'
import { TABS } from './lib/tabs'
import './index.css'

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

// `/admin` is intentionally absent: the admin dashboard wrote directly to Supabase and has
// no equivalent on the CCS API yet. The UI is preserved in src/_disabled/ — see the gap
// analysis for the endpoints and auth needed to restore it.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <LeagueProvider>
            <Routes>
              {/* Every tab is its own URL. The sections of `Home` all mount the same element, which
                  React reconciles in place — switching between them is not a remount, so the league
                  data loads once rather than on every click. Tabs marked `standalone` are their own
                  page and declare their route below. */}
              {TABS.filter(t => !t.standalone).map(t => (
                <Route key={t.path} path={t.path} element={<Home />} />
              ))}
              <Route path="/stats" element={<Stats />} />
              <Route path="/teams/:conf/:code" element={<TeamPage />} />
              <Route path="/match/:seriesId" element={<MatchDetail />} />
              <Route path="/game/:matchId" element={<GameDetail />} />
              <Route path="/register" element={<Register />} />
              <Route path="/login" element={<Login />} />
            </Routes>
          </LeagueProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
)
