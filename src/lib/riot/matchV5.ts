/**
 * Riot Match-V5 shapes, as `GET /m/:matchId` and `GET /m/:matchId/timeline` pass them through.
 *
 * These are the two payloads the API stores verbatim and serves unmapped, which makes them the one
 * place in the client where a type describes a *third party's* document rather than our server's.
 * The rules that follow from that:
 *
 *  - **Nothing here is mapped.** The match viewer reads dozens of numeric columns off a participant
 *    and a defensive mapper for every one of them would be a second copy of Riot's schema that drifts.
 *    Instead the page checks the envelope once (`info.participants` is ten rows) and trusts the rest.
 *  - **Fields Riot added after match-v5 launched are optional.** `riotIdGameName`/`riotIdTagline`
 *    arrived in 2023, `challenges` in 2022, and `summonerName` has been served empty since 2024. The
 *    numeric stat columns have been stable since 2021 and are required. Every stored row is
 *    match-v5; the envelope check below is for a truncated or malformed write, not an older schema.
 *  - **`gameDuration` changed units mid-2021.** Before patch 11.20 it was milliseconds; after, seconds,
 *    and `gameEndTimestamp` appeared at the same time. `gameDurationSeconds` is the one place that
 *    rule lives.
 *
 * `RiotMatch`, `RiotParticipant` and `RiotTeam` keep the names `lib/api/types.ts` gave them, and that
 * module re-exports them so the existing importers stay put.
 */

export type RiotTeamId = 100 | 200;

/** `teamPosition` as Riot serves it. Empty on the rare game Riot could not assign a lane. */
export type RiotPosition = "TOP" | "JUNGLE" | "MIDDLE" | "BOTTOM" | "UTILITY" | "";

export interface RiotMatch {
  metadata?: RiotMatchMetadata;
  info?: RiotMatchInfo;
}

export interface RiotMatchMetadata {
  dataVersion?: string;
  matchId?: string;
  /** Puuids, in participant order. */
  participants?: string[];
}

export interface RiotMatchInfo {
  gameCreation?: number;
  /** Seconds since patch 11.20, milliseconds before. Read it through `gameDurationSeconds`. */
  gameDuration?: number;
  gameStartTimestamp?: number;
  gameEndTimestamp?: number;
  gameId?: number;
  gameMode?: string;
  gameName?: string;
  gameType?: string;
  /** `"14.4.560.1234"`; the first two segments are the patch. See `patchOf`. */
  gameVersion?: string;
  mapId?: number;
  platformId?: string;
  queueId?: number;
  tournamentCode?: string;
  participants?: RiotParticipant[];
  teams?: RiotTeam[];
}

export interface RiotParticipant {
  participantId: number;
  puuid: string;
  teamId: RiotTeamId;
  teamPosition?: RiotPosition;
  individualPosition?: RiotPosition | "Invalid";
  lane?: string;
  role?: string;
  championId: number;
  championName: string;
  championTransform?: number;
  champLevel: number;
  champExperience?: number;
  /** Riot ID, served since late 2023. Absent on older payloads. */
  riotIdGameName?: string;
  riotIdTagline?: string;
  /** Empty string on anything played since 2024; the Riot ID is the name now. */
  summonerName?: string;
  summonerId?: string;
  summonerLevel?: number;
  profileIcon?: number;
  win: boolean;

  kills: number;
  deaths: number;
  assists: number;
  doubleKills: number;
  tripleKills: number;
  quadraKills: number;
  pentaKills: number;
  unrealKills?: number;
  killingSprees: number;
  largestKillingSpree: number;
  largestMultiKill: number;
  largestCriticalStrike: number;
  firstBloodKill: boolean;
  firstBloodAssist: boolean;
  firstTowerKill: boolean;
  firstTowerAssist: boolean;
  longestTimeSpentLiving: number;
  totalTimeSpentDead: number;
  timePlayed: number;

  totalDamageDealt: number;
  totalDamageDealtToChampions: number;
  physicalDamageDealt: number;
  physicalDamageDealtToChampions: number;
  magicDamageDealt: number;
  magicDamageDealtToChampions: number;
  trueDamageDealt: number;
  trueDamageDealtToChampions: number;
  damageDealtToBuildings: number;
  damageDealtToObjectives: number;
  damageDealtToTurrets: number;
  totalDamageTaken: number;
  physicalDamageTaken: number;
  magicDamageTaken: number;
  trueDamageTaken: number;
  damageSelfMitigated: number;
  totalHeal: number;
  totalHealsOnTeammates?: number;
  totalDamageShieldedOnTeammates?: number;
  totalUnitsHealed: number;
  timeCCingOthers: number;
  totalTimeCCDealt: number;

  goldEarned: number;
  goldSpent: number;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  consumablesPurchased?: number;
  itemsPurchased: number;
  item0: number;
  item1: number;
  item2: number;
  item3: number;
  item4: number;
  item5: number;
  item6: number;

  visionScore: number;
  wardsPlaced: number;
  wardsKilled: number;
  visionWardsBoughtInGame: number;
  sightWardsBoughtInGame: number;
  detectorWardsPlaced: number;

  turretKills: number;
  turretTakedowns: number;
  turretsLost?: number;
  inhibitorKills: number;
  inhibitorTakedowns: number;
  inhibitorsLost?: number;
  nexusKills: number;
  nexusTakedowns?: number;
  nexusLost?: number;
  baronKills: number;
  dragonKills: number;
  objectivesStolen: number;
  objectivesStolenAssists: number;

  summoner1Id: number;
  summoner2Id: number;
  summoner1Casts: number;
  summoner2Casts: number;
  spell1Casts: number;
  spell2Casts: number;
  spell3Casts: number;
  spell4Casts: number;

  perks: RiotPerks;
  /** Riot's derived-metrics bag, 2022 onward. Keys vary by patch; nothing here reads it by name. */
  challenges?: Record<string, number | number[] | undefined>;

  gameEndedInEarlySurrender: boolean;
  gameEndedInSurrender: boolean;
  teamEarlySurrendered: boolean;
}

export interface RiotPerks {
  statPerks: { defense: number; flex: number; offense: number };
  /** `[0]` is the primary tree with four selections, `[1]` the secondary with two. */
  styles: RiotPerkStyle[];
}

export interface RiotPerkStyle {
  description: "primaryStyle" | "subStyle" | string;
  selections: { perk: number; var1: number; var2: number; var3: number }[];
  style: number;
}

export interface RiotTeam {
  teamId: RiotTeamId;
  win: boolean;
  /** Every ban slot, `championId: -1` for a declined ban. Renderers must keep the -1 entries. */
  bans: RiotBan[];
  objectives: RiotObjectives;
}

export interface RiotBan {
  championId: number;
  pickTurn: number;
}

export interface RiotObjective {
  first: boolean;
  kills: number;
}

/**
 * Named for the ones every season has, indexed for the ones Riot adds (`horde` in 2024, `atakhan`
 * in 2025). A caller reading a named key gets a type; one reading a new key gets `undefined` to check.
 */
export interface RiotObjectives {
  baron?: RiotObjective;
  champion?: RiotObjective;
  dragon?: RiotObjective;
  inhibitor?: RiotObjective;
  riftHerald?: RiotObjective;
  tower?: RiotObjective;
  horde?: RiotObjective;
  [key: string]: RiotObjective | undefined;
}

// --------------------------------------------------------------------------------------- timeline

export interface RiotTimeline {
  metadata?: RiotMatchMetadata;
  info?: RiotTimelineInfo;
}

export interface RiotTimelineInfo {
  /** Milliseconds between frames; 60000 on every tournament game. */
  frameInterval: number;
  frames: RiotFrame[];
  gameId?: number;
  participants: { participantId: number; puuid: string }[];
}

export interface RiotFrame {
  events: RiotTimelineEvent[];
  /** Keyed by participant id as a string, which is how JSON object keys arrive. */
  participantFrames: Record<string, RiotParticipantFrame>;
  timestamp: number;
}

export interface RiotPosition2D {
  x: number;
  y: number;
}

export interface RiotParticipantFrame {
  championStats: RiotChampionStats;
  currentGold: number;
  damageStats: RiotDamageStats;
  goldPerSecond: number;
  jungleMinionsKilled: number;
  level: number;
  minionsKilled: number;
  participantId: number;
  position: RiotPosition2D;
  timeEnemySpentControlled: number;
  totalGold: number;
  xp: number;
}

export interface RiotChampionStats {
  abilityHaste: number;
  abilityPower: number;
  armor: number;
  armorPen: number;
  armorPenPercent: number;
  attackDamage: number;
  attackSpeed: number;
  bonusArmorPenPercent: number;
  bonusMagicPenPercent: number;
  ccReduction: number;
  cooldownReduction: number;
  health: number;
  healthMax: number;
  healthRegen: number;
  lifesteal: number;
  magicPen: number;
  magicPenPercent: number;
  magicResist: number;
  movementSpeed: number;
  omnivamp: number;
  physicalVamp: number;
  power: number;
  powerMax: number;
  powerRegen: number;
  spellVamp: number;
}

export interface RiotDamageStats {
  magicDamageDone: number;
  magicDamageDoneToChampions: number;
  magicDamageTaken: number;
  physicalDamageDone: number;
  physicalDamageDoneToChampions: number;
  physicalDamageTaken: number;
  totalDamageDone: number;
  totalDamageDoneToChampions: number;
  totalDamageTaken: number;
  trueDamageDone: number;
  trueDamageDoneToChampions: number;
  trueDamageTaken: number;
}

export type RiotLaneType = "BOT_LANE" | "MID_LANE" | "TOP_LANE";

export type RiotWardType =
  | "YELLOW_TRINKET"
  | "CONTROL_WARD"
  | "SIGHT_WARD"
  | "BLUE_TRINKET"
  | "TEEMO_MUSHROOM"
  | "UNDEFINED";

export type RiotDragonType =
  | "EARTH_DRAGON"
  | "FIRE_DRAGON"
  | "WATER_DRAGON"
  | "AIR_DRAGON"
  | "CHEMTECH_DRAGON"
  | "HEXTECH_DRAGON"
  | "ELDER_DRAGON";

export type RiotDragonSoul = "Chemtech" | "Hextech" | "Mountain" | "Cloud" | "Ocean" | "Infernal";

export type RiotTowerType = "OUTER_TURRET" | "INNER_TURRET" | "BASE_TURRET" | "NEXUS_TURRET";

export interface RiotDeathRecapSpell {
  basic: boolean;
  magicDamage: number;
  name: string;
  participantId: number;
  physicalDamage: number;
  spellName: string;
  spellSlot: number;
  trueDamage: number;
  type: string;
}

/**
 * The event union, discriminated on `type`. Only the types the viewer reads are spelled out; an
 * event Riot adds later still arrives (as `{ type: string; timestamp }`) and falls through every
 * `switch` to its default branch rather than being dropped at the boundary.
 */
export type RiotTimelineEvent<T extends string = string> = { timestamp: number; type: T } & (
  | { type: "PAUSE_START"; realTimestamp: number }
  | { type: "PAUSE_END"; realTimestamp: number }
  | { type: "ITEM_PURCHASED"; participantId: number; itemId: number }
  | { type: "ITEM_SOLD"; participantId: number; itemId: number }
  | { type: "ITEM_DESTROYED"; participantId: number; itemId: number }
  | { type: "ITEM_UNDO"; participantId: number; beforeId: number; afterId: number; goldGain: number }
  | { type: "SKILL_LEVEL_UP"; participantId: number; levelUpType: "NORMAL" | "EVOLVE"; skillSlot: number }
  | { type: "LEVEL_UP"; participantId: number; level: number }
  | { type: "WARD_PLACED"; creatorId: number; wardType: RiotWardType }
  | { type: "WARD_KILL"; killerId: number; wardType: RiotWardType }
  | {
      type: "ELITE_MONSTER_KILL";
      monsterType: "HORDE" | "RIFTHERALD" | "BARON_NASHOR" | "ATAKHAN";
      killerTeamId: RiotTeamId;
      killerId: number;
      bounty: number;
      assistingParticipantIds?: number[];
      position: RiotPosition2D;
    }
  | {
      type: "ELITE_MONSTER_KILL";
      monsterType: "DRAGON";
      monsterSubType: RiotDragonType;
      killerTeamId: RiotTeamId;
      killerId: number;
      bounty: number;
      assistingParticipantIds?: number[];
      position: RiotPosition2D;
    }
  | {
      type: "TURRET_PLATE_DESTROYED";
      killerId: number;
      laneType: RiotLaneType;
      position: RiotPosition2D;
      teamId: RiotTeamId;
    }
  | {
      type: "CHAMPION_KILL";
      /** Absent, or 0, when a minion, monster or turret got the kill. */
      killerId?: number;
      killStreakLength: number;
      bounty: number;
      shutdownBounty: number;
      assistingParticipantIds?: number[];
      position: RiotPosition2D;
      victimDamageDealt?: RiotDeathRecapSpell[];
      victimDamageReceived?: RiotDeathRecapSpell[];
      victimId: number;
    }
  | {
      type: "CHAMPION_SPECIAL_KILL";
      killType: "KILL_MULTI";
      killerId: number;
      multiKillLength: number;
      position: RiotPosition2D;
    }
  | {
      type: "CHAMPION_SPECIAL_KILL";
      killType: "KILL_ACE" | "KILL_FIRST_BLOOD";
      killerId: number;
      position: RiotPosition2D;
    }
  | {
      type: "BUILDING_KILL";
      buildingType: "TOWER_BUILDING";
      towerType: RiotTowerType;
      laneType: RiotLaneType;
      assistingParticipantIds?: number[];
      bounty: number;
      killerId: number;
      position: RiotPosition2D;
      /** The team that *lost* the building. */
      teamId: RiotTeamId;
    }
  | {
      type: "BUILDING_KILL";
      buildingType: "INHIBITOR_BUILDING";
      laneType: RiotLaneType;
      assistingParticipantIds?: number[];
      bounty: number;
      killerId: number;
      position: RiotPosition2D;
      teamId: RiotTeamId;
    }
  | { type: "GAME_END"; realTimestamp: number; gameId: number; winningTeam: RiotTeamId }
  | { type: "OBJECTIVE_BOUNTY_PRESTART"; actualStartTime: number; teamId: RiotTeamId }
  | { type: "OBJECTIVE_BOUNTY_FINISH"; teamId: RiotTeamId }
  | { type: "DRAGON_SOUL_GIVEN"; teamId: RiotTeamId; name: RiotDragonSoul }
  | { type: "FEAT_UPDATE"; teamId: RiotTeamId; featType: number; featValue: number }
);

export type RiotEventType = RiotTimelineEvent["type"];

// ---------------------------------------------------------------------------------------- helpers

/**
 * The game's length in seconds, whichever unit the payload used.
 *
 * Riot documents the rule as "if `gameEndTimestamp` is present, seconds, else milliseconds". Some
 * re-served payloads carry both the new field and a seconds value, so the magnitude is checked as
 * well: no game runs 100,000 seconds.
 */
export function gameDurationSeconds(info: RiotMatchInfo | undefined): number | null {
  const raw = info?.gameDuration;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  if (info?.gameEndTimestamp === undefined && raw > 100_000) return Math.round(raw / 1000);
  return raw > 100_000 ? Math.round(raw / 1000) : raw;
}

/** `"14.4"` from `"14.4.560.1234"`, or null when the version is missing. */
export function patchOf(info: RiotMatchInfo | undefined): string | null {
  const v = info?.gameVersion;
  if (typeof v !== "string") return null;
  const parts = v.split(".");
  return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : null;
}

/** A payload that passed `isRenderableMatch`: the viewer's components take this, never a bare `RiotMatch`. */
export type RenderableMatch = RiotMatch & {
  info: RiotMatchInfo & { participants: RiotParticipant[]; teams: RiotTeam[] };
};

export type RenderableTimeline = RiotTimeline & { info: RiotTimelineInfo };

/**
 * Whether a stored payload is a Match-V5 document the viewer can draw.
 *
 * Ten participants and two teams is the envelope; a truncated write or a malformed body fails it,
 * and the page shows its "unreadable" card rather than a tab that throws.
 */
export function isRenderableMatch(match: RiotMatch | null | undefined): match is RenderableMatch {
  const info = match?.info;
  if (!info || !Array.isArray(info.participants) || !Array.isArray(info.teams)) return false;
  if (info.participants.length !== 10 || info.teams.length < 2) return false;
  return info.participants.every(p => typeof p?.puuid === "string" && typeof p.participantId === "number");
}

/** The same envelope check for a timeline: frames exist and each carries participant frames. */
export function isRenderableTimeline(timeline: RiotTimeline | null | undefined): timeline is RenderableTimeline {
  const info = timeline?.info;
  return !!info && Array.isArray(info.frames) && info.frames.length > 0 && Array.isArray(info.participants);
}
