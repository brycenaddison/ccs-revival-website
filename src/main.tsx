import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import MatchDetail from './pages/MatchDetail'
import GameDetail from './pages/GameDetail'
import TeamPage from './pages/TeamPage'
import Register from './pages/Register'
import { LeagueProvider } from './lib/leagueContext'
import { AuthProvider } from './lib/authContext'
import './index.css'

// `/admin` is intentionally absent: the admin dashboard wrote directly to Supabase and has
// no equivalent on the CCS API yet. The UI is preserved in src/_disabled/ — see the gap
// analysis for the endpoints and auth needed to restore it.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <LeagueProvider>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/teams/:conf/:code" element={<TeamPage />} />
            <Route path="/match/:seriesId" element={<MatchDetail />} />
            <Route path="/game/:matchId" element={<GameDetail />} />
            <Route path="/register" element={<Register />} />
          </Routes>
        </LeagueProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
