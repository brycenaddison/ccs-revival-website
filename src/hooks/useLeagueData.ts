import { useState, useEffect, useCallback } from "react";
import { db } from "../lib/supabase";

export interface Team {
  id: string;
  name: string;
  abbreviation: string;
  color_primary: string;
  color_accent: string;
  logo_url?: string;
  division_id?: string;
  season_id?: string;
  is_active?: boolean;
  divisions?: { name: string };
}

export interface Match {
  id: string;
  split_id: string;
  team_blue_id: string;
  team_red_id: string;
  team_blue?: Team;
  team_red?: Team;
  status: string;
  scheduled_at: string;
  completed_at?: string;
  match_format?: string;
  season_phase?: string;
  winner_team_id?: string;
  score_blue?: number;
  score_red?: number;
  splits?: { name: string };
}

export interface Standing {
  id: string;
  team_id: string;
  split_id: string;
  wins: number;
  losses: number;
  streak?: string;
  teams?: Team & { divisions?: { name: string } };
}

export interface Article {
  id: string;
  title: string;
  subtitle?: string;
  body?: string;
  tag?: string;
  article_type?: string;
  author?: string;
  published_at?: string;
  is_published?: boolean;
  image_url?: string;
}

export interface Split {
  id: string;
  name: string;
  split_number: number;
  season_id: string;
  is_active: boolean;
  seasons?: { name: string };
}

export interface Player {
  id: string;
  name: string;
  riot_name?: string;
  riot_tag?: string;
  role?: string;
  team?: Team;
  is_captain?: boolean;
  gp: number;
  kills: number;
  deaths: number;
  assists: number;
  kda: string;
  cs: number;
  mvps: number;
  damage: number;
  gold: number;
  winRate: number;
}

export interface Roster {
  id: string;
  player_id: string;
  team_id: string;
  split_id: string;
  role?: string;
  is_captain: boolean;
  is_starter: boolean;
  left_at?: string;
  players?: { id: string; display_name: string; riot_game_name?: string; riot_tag_line?: string };
  teams?: Team;
  splits?: { name: string };
}

export interface Game {
  id: string;
  match_id?: string;
  riot_match_id?: string;
  blue_team_id: string;
  red_team_id: string;
  winner_team_id?: string;
  game_duration?: number;
  game_started_at?: string;
}

export interface TwitterFeed {
  id: string;
  feed_type: "timeline" | "tweet";
  handle?: string;
  tweet_url?: string;
  title?: string;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
}

export interface TwitchEmbed {
  id: string;
  embed_type: "channel" | "clip" | "youtube";
  channel_name?: string;
  clip_url?: string;
  title?: string;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
}

export interface LeagueData {
  teams: Team[];
  matches: Match[];
  standings: Standing[];
  players: Player[];
  rosters: Roster[];
  articles: Article[];
  splits: Split[];
  games: Game[];
  twitterFeeds: TwitterFeed[];
  twitchEmbeds: TwitchEmbed[];
  loading: boolean;
  refresh: () => void;
}

type LeagueDataState = Omit<LeagueData, "refresh">;

export function useLeagueData(): LeagueData {
  const [data, setData] = useState<LeagueDataState>({
    teams: [], matches: [], standings: [], players: [], rosters: [],
    articles: [], splits: [], games: [], twitterFeeds: [], twitchEmbeds: [],
    loading: true,
  });

  const load = useCallback(async () => {
    try {
      const [teams, matches, standings, articles, splits] = await Promise.all([
        db("teams", { query: "?select=*,divisions(name)&is_active=eq.true&order=name" }),
        db("matches", { query: "?select=*,team_blue:teams!matches_team_blue_id_fkey(id,name,abbreviation,color_primary,color_accent,logo_url),team_red:teams!matches_team_red_id_fkey(id,name,abbreviation,color_primary,color_accent,logo_url)&order=scheduled_at.desc.nullslast&limit=50" }),
        db("standings", { query: "?select=*,teams(id,name,abbreviation,color_primary,color_accent,logo_url,divisions(name))&order=wins.desc" }),
        db("articles", { query: "?select=*&is_published=eq.true&order=published_at.desc.nullslast&limit=10" }),
        db("splits", { query: "?select=*,seasons(name)&is_active=eq.true&limit=1" }),
      ]);

      let players: Player[] = [];
      let rosters: Roster[] = [];
      let games: Game[] = [];
      let twitterFeeds: TwitterFeed[] = [];
      let twitchEmbeds: TwitchEmbed[] = [];

      try {
        const [roster, stats, gamesData, twFeeds, twEmbeds] = await Promise.all([
          db("rosters", { query: "?select=*,players(id,display_name,riot_game_name,riot_tag_line),teams(id,name,abbreviation,color_primary,color_accent,logo_url)&left_at=is.null" }),
          db("player_game_stats", { query: "?select=player_id,kills,deaths,assists,total_minions_killed,neutral_minions_killed,vision_score,total_damage_dealt_to_champions,gold_earned,win,is_mvp" }),
          db("games", { query: "?select=id,match_id,riot_match_id,blue_team_id,red_team_id,winner_team_id,game_duration,game_started_at&order=game_started_at.desc.nullslast&limit=50" }),
          db("twitter_feeds", { query: "?select=*&is_active=eq.true&order=sort_order,created_at.desc" }),
          db("twitch_embeds", { query: "?select=*&is_active=eq.true&order=sort_order,created_at.desc" }),
        ]);
        rosters = roster || [];
        games = gamesData || [];
        twitterFeeds = twFeeds || [];
        twitchEmbeds = twEmbeds || [];

        const agg: Record<string, { gp: number; kills: number; deaths: number; assists: number; cs: number; wins: number; mvps: number; damage: number; gold: number }> = {};
        (stats || []).forEach((s: Record<string, number | boolean>) => {
          const pid = s.player_id as unknown as string;
          if (!agg[pid]) agg[pid] = { gp: 0, kills: 0, deaths: 0, assists: 0, cs: 0, wins: 0, mvps: 0, damage: 0, gold: 0 };
          const a = agg[pid];
          a.gp++; a.kills += (s.kills as number); a.deaths += (s.deaths as number); a.assists += (s.assists as number);
          a.cs += ((s.total_minions_killed as number) || 0) + ((s.neutral_minions_killed as number) || 0);
          a.damage += (s.total_damage_dealt_to_champions as number) || 0;
          a.gold += (s.gold_earned as number) || 0;
          if (s.win) a.wins++;
          if (s.is_mvp) a.mvps++;
        });

        players = rosters.filter((r: Roster) => r.is_starter).map((r: Roster) => {
          const s = agg[r.players?.id || ""] || { gp: 0, kills: 0, deaths: 0, assists: 0, cs: 0, wins: 0, mvps: 0, damage: 0, gold: 0 };
          const kda = s.deaths === 0 ? (s.kills + s.assists) : ((s.kills + s.assists) / s.deaths);
          return {
            id: r.players?.id || "",
            name: r.players?.display_name || "Unknown",
            riot_name: r.players?.riot_game_name,
            riot_tag: r.players?.riot_tag_line,
            role: r.role,
            team: r.teams,
            is_captain: r.is_captain,
            gp: s.gp, kills: s.kills, deaths: s.deaths, assists: s.assists,
            kda: kda.toFixed(1),
            cs: s.gp > 0 ? Math.round(s.cs / s.gp) : 0,
            mvps: s.mvps,
            damage: s.gp > 0 ? Math.round(s.damage / s.gp) : 0,
            gold: s.gp > 0 ? Math.round(s.gold / s.gp) : 0,
            winRate: s.gp > 0 ? Math.round((s.wins / s.gp) * 100) : 0,
          };
        });
      } catch { /* stats tables may not exist yet */ }

      setData({
        teams: teams || [], matches: matches || [], standings: standings || [],
        players, rosters, articles: articles || [], splits: splits || [],
        games: games || [], twitterFeeds, twitchEmbeds, loading: false,
      });
    } catch (e) {
      console.error(e);
      setData(d => ({ ...d, loading: false }));
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  return { ...data, refresh: load };
}
