import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useWindowSize } from "../hooks/useWindowSize";
import { useScheduleFeed } from "../hooks/useScheduleFeed";
import { useLeagueData } from "../hooks/useLeagueData";
import { usePlayers } from "../hooks/usePlayers";
import { useSeason } from "../hooks/useSeason";
import { PageShell } from "../components/layout/PageShell";
import { ScoreboardTicker, TICKER_WINDOW } from "../components/home/ScoreboardTicker";
import { HeroArticle } from "../components/home/HeroArticle";
import { NewsFeed } from "../components/home/NewsFeed";
import { StandingsWidget } from "../components/home/StandingsWidget";
import { PlayerLeaders } from "../components/home/PlayerLeaders";
import { UpcomingSchedule } from "../components/home/UpcomingSchedule";
import { SocialLinks } from "../components/home/SocialLinks";
import { TwitchStreams } from "../components/home/TwitchStreams";
import { StandingsView } from "../components/views/StandingsView";
import { TeamsView } from "../components/views/TeamsView";
import { useLeague } from "../lib/leagueContext";
import { tabForPathname } from "../lib/tabs";

export default function Home() {
  // Which section is showing comes from the URL. This mounts at Home, Standings and Teams; Scores,
  // Schedule and Stats are their own pages, because none of them reads the league data loaded below.
  // See `lib/tabs.ts`. The coalesce is unreachable in practice: this only mounts on a tab route, so
  // `tabForPathname` always matches one.
  const tab = tabForPathname(useLocation().pathname) ?? "Home";
  const w = useWindowSize();
  const isMobile = w < 768;
  const isTablet = w >= 768 && w < 1024;
  const { tournaments, selectedConfs, loading: leagueLoading } = useLeague();
  const { teams, standings, rosters, articles, splits, twitterFeeds, twitchEmbeds, loading: dataLoading, error, refresh } =
    useLeagueData({ confs: selectedConfs, tournaments });

  // `useLeagueData` is one call per conf and covers every section. Two things need their own
  // request, so each is loaded only by the sections that render it — passing nothing is how a
  // section opts out. Player leaderboards need `/stats/players`, which the roster no longer does.
  //
  // The season document is loaded here only for the Home sidebar widget. The Standings tab calls
  // `useSeason` itself — it owns the conference strip, so it is the only thing that knows which conf
  // is on screen — and both land on the same query key, so visiting one warms the other.
  const { season, loading: seasonLoading } = useSeason(tab === "Home" ? selectedConfs[0] ?? null : null);
  const { players } = usePlayers({ confs: tab === "Home" ? selectedConfs : [], teams });
  const loading = leagueLoading || dataLoading;

  // The ticker's own window, read through the same query key — so this shares its request rather than
  // opening a second one. It is here for one reason: a live series is ingesting games, which moves the
  // standings and the records that every section below is showing, and nothing else would say so.
  const ticker = useScheduleFeed(TICKER_WINDOW);
  const hasLive = (ticker.data?.matches ?? []).some(m => m.status === "live");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (hasLive) {
      intervalRef.current = setInterval(() => { refresh(); }, 30000);
    }
    return () => {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    };
  }, [hasLive, refresh]);

  const parentDomain = window.location.hostname;
  const split = splits[0];
  const hero = articles.find(a => a.article_type === "hero");
  const rest = articles.filter(a => a.id !== hero?.id);

  return (
    <PageShell maxWidth={1440} ticker={<ScoreboardTicker />}>
      {loading ? (
        <div className="py-16 text-center text-text-subtle">Loading...</div>
      ) : error ? (
        <div className="max-w-[500px] mx-auto mt-16 text-center px-5">
          <h2 className="font-display text-[24px] text-text-bright tracking-widest mb-2">COULDN'T LOAD THE LEAGUE</h2>
          <p className="text-sm text-text-muted leading-relaxed mb-6">{error}</p>
          <button
            onClick={refresh}
            className="bg-accent text-white border-none rounded-md py-3 px-7 text-sm font-heading font-medium tracking-wider uppercase cursor-pointer"
          >
            Try again
          </button>
        </div>
      ) : !teams.length ? (
        <div className="max-w-[500px] mx-auto mt-16 text-center px-5">
          <span className="text-5xl block mb-4">⚔️</span>
          <h2 className="font-display text-[28px] text-text-bright tracking-widest mb-2">CCS IS BEING SET UP</h2>
          <p className="text-sm text-text-muted leading-relaxed">No teams registered for this season yet.</p>
        </div>
      ) : (
        <>
          {tab === "Standings" ? <StandingsView isMobile={isMobile} />
          : tab === "Teams" ? <TeamsView teams={teams} standings={standings} rosters={rosters} isMobile={isMobile} />
          : (
            <div className={`grid ${isMobile ? "grid-cols-1" : isTablet ? "grid-cols-1" : "grid-cols-[280px_1fr_280px]"}`} style={{ gap: isMobile ? 16 : 24 }}>
              {/* LEFT COLUMN — Articles + Twitter */}
              <div className="flex flex-col gap-5">
                {hero && <HeroArticle article={hero} isMobile={isMobile} />}
                {rest.length > 0 && (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="font-display text-text-bright tracking-widest" style={{ fontSize: isMobile ? 16 : 18 }}>TOP STORIES</span>
                    </div>
                    <NewsFeed articles={rest} isMobile={isMobile} />
                  </>
                )}
                {!articles.length && (
                  <div className="bg-bg2 rounded-md border border-border p-6 text-center">
                    <span className="text-text-dim text-[13px]">No news yet.</span>
                  </div>
                )}
                <SocialLinks feeds={twitterFeeds} />
              </div>

              {/* MIDDLE COLUMN — Welcome banner + Streams/VODs */}
              <div className="flex flex-col gap-5">
                {!hero && (
                  <div className="rounded-lg relative overflow-hidden" style={{ background: "linear-gradient(135deg, var(--accent), var(--dark-red, #3f0008))", padding: isMobile ? "14px 12px" : "16px 20px" }}>
                    <div className="relative flex items-center gap-3">
                      <span className="text-lg">⚔️</span>
                      <div>
                        <h2 className="font-display text-white tracking-wider" style={{ fontSize: isMobile ? 16 : 18 }}>WELCOME TO CCS</h2>
                        <p className="text-white/70 text-xs">{teams.length} teams · {split?.name || "Season starting soon"}</p>
                      </div>
                    </div>
                  </div>
                )}
                <TwitchStreams embeds={twitchEmbeds} parentDomain={parentDomain} />
                <UpcomingSchedule isMobile={isMobile} />
              </div>

              {/* RIGHT COLUMN — Standings + Stats */}
              <div className="flex flex-col gap-5">
                <StandingsWidget
                  season={season}
                  conf={selectedConfs[0] ?? null}
                  teams={teams}
                  loading={seasonLoading}
                />
                <PlayerLeaders players={players} isMobile={isMobile} />
              </div>
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}
