const ARCHIVE_API_BASE = "https://api.brycenaddison.com";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${ARCHIVE_API_BASE}${path}`);
  if (!res.ok) throw new Error(`Archive API ${path} failed: ${res.status}`);
  return res.json();
}

async function getList<T>(path: string): Promise<T[]> {
  const data = await get<T[] | null>(path);
  return Array.isArray(data) ? data : [];
}

export interface ArchiveTournament {
  conf: string;
  name: string;
  shortname: string;
  layout: { bestOf: number; startingWeek: number }[];
}

export interface ArchiveTeamSummary {
  id: number;
  code: string;
  name: string;
  logo: string;
  conf: string;
  color: number;
  top?: string;
  jg?: string;
  mid?: string;
  bot?: string;
  sup?: string;
  subs?: string[];
}

export interface ArchiveChamp {
  name: string;
  img: string;
  splash?: string;
  champid: number;
  picks?: number;
}

export interface ArchiveBanEntry {
  championId: number;
  bans: number;
  name: string;
  img: string;
}

export interface ArchiveMatchBan {
  pickTurn: number;
  championId: number;
  name: string;
  icon: string;
}

export interface ArchiveMatchPlayer {
  name?: string;
  champion?: string;
  kills?: number;
  deaths?: number;
  assists?: number;
  championIcon?: string;
  [key: string]: unknown;
}

export interface ArchiveMatchlistEntry {
  matchId: string;
  conf: string;
  week: number;
  team: string;
  opponent: string;
  game: number;
  win: boolean;
  bans: ArchiveMatchBan[];
  bansAgainst: ArchiveMatchBan[];
  time: number;
  startTime: string;
  blueside: boolean;
  kills: number;
  deaths: number;
  assists: number;
  gd14?: number;
  topDmg?: number;
  gold?: number;
  towers?: number;
  barons?: number;
  dragons?: number;
  heralds?: number;
  top?: ArchiveMatchPlayer;
  jg?: ArchiveMatchPlayer;
  mid?: ArchiveMatchPlayer;
  bot?: ArchiveMatchPlayer;
  sup?: ArchiveMatchPlayer;
}

export interface ArchivePlayerStats {
  name: string;
  id: number;
  team: string;
  logo: string;
  role: string;
  conf: string;
  games: number;
  wins: number;
  losses: number;
  winPercent: string;
  kda: string;
  kills: number;
  deaths: number;
  assists: number;
  avgKills: string;
  avgDeaths: string;
  avgAssists: string;
  csMin: string;
  goldMin: string;
  goldPercent: string;
  killParticipation: string;
  damagePercent: string;
  damagePerGold: string;
  damageMin: string;
  xpMin: string;
  visionScoreMin: string;
  wardsMin: string;
  controlWardsMin: string;
  wardsClearedMin: string;
  visionScorePercent: string;
  firstBloodPercent: string;
  soloKills: number;
  doubleKills: number;
  tripleKills: number;
  quadraKills: number;
  pentaKills: number;
  champs: ArchiveChamp[];
  [key: string]: unknown;
}

export interface ArchiveTeamStats {
  id: number;
  code: string;
  name: string;
  logo: string;
  color: number;
  conf: string;
  games: number;
  wins: number;
  losses: number;
  winrate: string;
  avgTime: string;
  bluesideWins: number;
  bluesideWinrate: string;
  redsideWins: number;
  redsideWinrate: string;
  killDeathRatio: string;
  avgKills: string;
  avgAssists: string;
  avgDeaths: string;
  firstBloodPercent: string;
  damageMin: string;
  goldMin: string;
  goldDiffAt14: string;
  csMin: string;
  visionScoreMin: string;
  firstTowerPercent: string;
  avgTowersTaken: string;
  avgTowersGiven: string;
  firstDragonPercent: string;
  avgDragonsTaken: string;
  firstBaronPercent: string;
  avgBaronsTaken: string;
  [key: string]: unknown;
}

export interface ArchiveTeamDetail extends ArchiveTeamStats {
  players: ArchivePlayerStats[];
  bannedAgainst: ArchiveBanEntry[];
  bannedBy: ArchiveBanEntry[];
  matchlist: ArchiveMatchlistEntry[];
}

export interface ArchiveChampionStats {
  name: string;
  img: string;
  champid: number;
  conf: string;
  total: number;
  games: number;
  bans: number;
  pickRate: string;
  banRate: string;
  presence: string;
  avgBanTurn: string;
  wins: number;
  losses: number;
  winPercent: string;
  kda: string;
  avgKills: string;
  avgDeaths: string;
  avgAssists: string;
  damageMin: string;
  bestPlayerName?: string;
  bestPlayerTeam?: string;
  bestPlayerLogo?: string;
  bestPlayerGames?: number;
  bestPlayerKda?: string;
  bestPlayerWinrate?: string;
  [key: string]: unknown;
}

export const archiveApi = {
  tournaments: () => getList<ArchiveTournament>("/tournaments"),
  teamsForConf: (conf: string) => getList<ArchiveTeamSummary>(`/teams/${conf}`),
  teamDetail: (conf: string, code: string) => get<ArchiveTeamDetail>(`/teams/${conf}/${code}`),
  playerStats: (conf: string) => getList<ArchivePlayerStats>(`/stats/players/${conf}`),
  teamStats: (conf: string) => getList<ArchiveTeamStats>(`/stats/teams/${conf}`),
  championStats: (conf: string) => getList<ArchiveChampionStats>(`/stats/champions/${conf}`),
  championStatsByRole: (conf: string, role: string) => getList<ArchiveChampionStats>(`/stats/champions/${conf}/${role}`),
  matchData: (matchId: string) => get<unknown>(`/m/${matchId}`),
};

export function hexFromInt(color: number): string {
  return "#" + color.toString(16).padStart(6, "0");
}

export function fmtSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function fmtPct(s?: string | null): string {
  if (s === null || s === undefined || s === "") return "—";
  const n = parseFloat(s);
  if (isNaN(n)) return "—";
  return `${(n * 100).toFixed(0)}%`;
}

export const ROLE_ORDER = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];

export function sortByRole<T extends { role: string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => {
    const ai = ROLE_ORDER.indexOf(a.role);
    const bi = ROLE_ORDER.indexOf(b.role);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}
