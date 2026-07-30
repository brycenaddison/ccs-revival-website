import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useWindowSize } from "../hooks/useWindowSize";
import { useLeagueData } from "../hooks/useLeagueData";
import { usePlayers } from "../hooks/usePlayers";
import { useStandings } from "../hooks/useStandings";
import { PageShell } from "../components/layout/PageShell";
import { ScoreboardTicker } from "../components/home/ScoreboardTicker";
import { HeroArticle } from "../components/home/HeroArticle";
import { NewsFeed } from "../components/home/NewsFeed";
import { StandingsWidget } from "../components/home/StandingsWidget";
import { PlayerLeaders } from "../components/home/PlayerLeaders";
import { UpcomingSchedule } from "../components/home/UpcomingSchedule";
import { SocialLinks } from "../components/home/SocialLinks";
import { TwitchStreams } from "../components/home/TwitchStreams";
import { ScoresView } from "../components/views/ScoresView";
import { ScheduleView } from "../components/views/ScheduleView";
import { StandingsView } from "../components/views/StandingsView";
import { TeamsView } from "../components/views/TeamsView";
import { useLeague } from "../lib/leagueContext";
import { tabForPathname } from "../lib/tabs";

export default function Home() {
  // Which section is showing comes from the URL — every tab has its own, and this component is
  // mounted at all of them. See `lib/tabs.ts`. The coalesce is unreachable in practice: this only
  // mounts on a tab route, so `tabForPathname` always matches one.
  const tab = tabForPathname(useLocation().pathname) ?? "Home";
  const w = useWindowSize();
  const isMobile = w < 768;
  const isTablet = w >= 768 && w < 1024;
  const { tournaments, selectedConfs, loading: leagueLoading } = useLeague();
  const { teams, matches, standings, rosters, articles, splits, twitterFeeds, twitchEmbeds, loading: dataLoading, error, refresh } =
    useLeagueData({ confs: selectedConfs, tournaments });

  // `useLeagueData` is one call per conf and covers every section. Two things need their own
  // request, so each is loaded only by the sections that render it — passing no confs is how a
  // section opts out. Ranked standings carry the rank and streak that `/teams`' record does not;
  // player leaderboards need `/stats/players`, which the roster no longer does.
  const showsStandings = tab === "Home" || tab === "Standings";
  const { standings: ranked, loading: standingsLoading } = useStandings({
    confs: showsStandings ? selectedConfs : [],
    teams,
    tournaments,
  });
  const { players } = usePlayers({ confs: tab === "Home" ? selectedConfs : [], teams });
  const loading = leagueLoading || dataLoading;
  const hasLive = matches.some(m => m.status === "live");
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
    <PageShell maxWidth={1440} ticker={<ScoreboardTicker matches={matches} isMobile={isMobile} />}>
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
          {tab === "Scores" ? <ScoresView matches={matches} isMobile={isMobile} />
          : tab === "Schedule" ? <ScheduleView matches={matches} isMobile={isMobile} />
          : tab === "Standings" ? <StandingsView standings={ranked} isMobile={isMobile} />
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
                <UpcomingSchedule matches={matches} isMobile={isMobile} />
              </div>

              {/* RIGHT COLUMN — Standings + Stats */}
              <div className="flex flex-col gap-5">
                <StandingsWidget standings={ranked} teams={teams} loading={standingsLoading} />
                <PlayerLeaders players={players} isMobile={isMobile} />
              </div>
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}
