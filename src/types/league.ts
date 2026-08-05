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

/*
 * There was a `Match` here, and a `Game`, both shaped for Supabase's schedule tables and both
 * permanently empty — the API had no read that answered "every fixture, with its result and its
 * kickoff". `GET /schedule` and `GET /tournaments/schedule/:id/result` do, and they are served through
 * `lib/api/feed.ts` as `FeedMatch` and `SeriesDetail`. Nothing translates them into this file: these
 * shapes exist to keep the Supabase-era components compiling, and the fixture surfaces were rewritten
 * rather than adapted.
 */

/**
 * A team's record in the standings table.
 *
 * `wins`/`losses` are **series** results, which is what a table ranks on. The game record below is
 * a tiebreaker input, not a ranking: a 2-1 series win is one series win and three games.
 *
 * Ranking itself is the API's job — `rank`/`place` arrive resolved, ties included.
 */
export interface Standing {
  id: string;
  team_id: string;
  split_id: string;
  wins: number;
  losses: number;
  /**
   * Individual game record, as served alongside the series record. A tiebreaker input only —
   * ranking is on `wins`/`losses`, which are series. Absent when nothing supplied it.
   */
  gameWins?: number;
  gameLosses?: number;
  /** 0–1. The first tiebreaker, shown so a table can explain a separation. */
  gameWinPct?: number | null;
  /**
   * Position as ranked by the API, and that rank as displayed (`"T-2"` for a tie).
   *
   * Set only on standings from `/standings/:conf`. Teams level on every tiebreaker legitimately
   * share a rank, and a shared rank consumes the positions it covers — do not renumber rows by
   * their index.
   */
  rank?: number;
  place?: string;
  /** Current run of series results. Set only on standings from `/standings/:conf`. */
  streak?: string;
  teams?: Team & { divisions?: { name: string } };
  /**
   * True when the record was derived client-side from played games rather than served by a
   * standings endpoint. Derived records cannot see forfeits.
   */
  provisional?: boolean;
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

/**
 * What the shared league loader provides. Player leaderboards, the season document and the fixture feed
 * are not here: each needs its own request, so they load through `usePlayers`, `useSeason` and
 * `useScheduleFeed` only where they are shown.
 */
export interface LeagueData {
  teams: Team[];
  standings: Standing[];
  rosters: Roster[];
  articles: Article[];
  splits: Split[];
  twitterFeeds: TwitterFeed[];
  twitchEmbeds: TwitchEmbed[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}
