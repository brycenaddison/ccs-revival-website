/**
 * View-model shapes consumed by the site's components.
 *
 * These deliberately keep the field names the components already use, so the switch from
 * Supabase to the CCS API is a data-source change rather than a UI rewrite. Adapters in
 * `src/lib/leagueAdapters.ts` map API responses onto these shapes.
 */

export interface Team {
  id: string;
  name: string;
  abbreviation: string;
  color_primary: string;
  color_accent: string;
  logo_url?: string;
  /**
   * Group a team belongs to within the selected league. The API has no notion of divisions;
   * this is populated only when several confs are active at once, where each conf acts as
   * its own group.
   */
  divisions?: { name: string };
}

/**
 * A match *series* (best-of-N), not an individual game.
 *
 * `status` is only ever `"completed"` today: the API records games after the fact and has
 * no schedule, so nothing upcoming or live can be represented yet.
 */
export interface Match {
  id: string;
  split_id: string;
  team_blue_id: string;
  team_red_id: string;
  team_blue?: Team;
  team_red?: Team;
  status: "scheduled" | "live" | "completed";
  scheduled_at: string;
  completed_at?: string;
  match_format?: string;
  season_phase?: string;
  winner_team_id?: string;
  score_blue?: number;
  score_red?: number;
  splits?: { name: string };
}

/**
 * A team's record in the standings table.
 *
 * `wins`/`losses` are **series** results. Game-level records live on `Game[]` and are used
 * only as a tiebreaker — see `src/lib/tiebreakers.ts`.
 */
export interface Standing {
  id: string;
  team_id: string;
  split_id: string;
  wins: number;
  losses: number;
  streak?: string;
  teams?: Team & { divisions?: { name: string } };
  /**
   * True when the record was derived client-side from played games rather than served by a
   * standings endpoint. Derived records cannot see forfeits.
   */
  provisional?: boolean;
}

/** An individual game within a series. */
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

export interface Player {
  /**
   * Stable row identity. Stats are tracked per role, so a player who played two roles has
   * two entries here — that is intended, and this key keeps them distinct.
   */
  id: string;
  name: string;
  role?: string;
  team?: Team;
  is_captain?: boolean;
  gp: number;
  kills: number;
  deaths: number;
  assists: number;
  /** Pre-formatted, because it can legitimately be infinite. */
  kda: string;
  /** Per-minute rates — the API aggregates by minute and has no season totals for these. */
  csMin: number;
  damageMin: number;
  goldMin: number;
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
  players?: { id: string; display_name: string };
  teams?: Team;
  splits?: { name: string };
}

export interface Split {
  id: string;
  name: string;
  split_number: number;
  season_id: string;
  is_active: boolean;
  seasons?: { name: string };
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
  error: string | null;
  refresh: () => void;
}
