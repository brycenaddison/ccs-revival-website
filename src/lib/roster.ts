/**
 * Joins a team's declared roster to its statistics.
 *
 * `GET /teams/:conf` names each roster slot by `profiles.id`, and `playerstats.id` is that same
 * key, so the two join directly with no name matching. This is the only way to see a player who
 * holds a slot but has no recorded games: benched players, and anyone yet to play, appear in the
 * roster and nowhere in the stats.
 *
 * `playerstats` is keyed on `(id, role, team, conf)`, so one person can own several rows — a
 * role swap legitimately produces two. A slot therefore takes the row matching its own role
 * where one exists, and otherwise the row with the most games. Every row no slot took comes back
 * as `extras` rather than being merged in: those are separate stat lines, and aggregating them
 * would misreport both.
 */

import { sortByRole, type PlayerStats, type Role, type RoleKey, type TeamRoster } from "./api";

/** Starting slots in roster order, with the role each one plays. */
const SLOTS: readonly { key: RoleKey; role: Role }[] = [
  { key: "top", role: "TOP" },
  { key: "jg", role: "JUNGLE" },
  { key: "mid", role: "MIDDLE" },
  { key: "bot", role: "BOTTOM" },
  { key: "sup", role: "UTILITY" },
];

export interface RosterEntry<S extends PlayerStats = PlayerStats> {
  /** Stable list key. Keyed on the slot, since a player with no stats has no row to key on. */
  key: string;
  profileId: number;
  /** Never blank — see `label`. */
  name: string;
  /** For a starter, the slot's role. For a sub, the role they actually played, if any. */
  role: Role | null;
  starter: boolean;
  /** This slot's stat line, or `null` when the player has no recorded games. */
  stats: S | null;
}

export interface JoinedRoster<S extends PlayerStats = PlayerStats> {
  entries: RosterEntry<S>[];
  /**
   * Stat lines no slot claimed: stand-ins with no roster slot, and the secondary-role lines of
   * players who do hold one. Both are appearances outside a roster slot.
   */
  extras: S[];
}

/**
 * A slot always names a real player, so it must never render blank.
 *
 * A slot's own `name` is `null` whenever Riot stops resolving the account. `playerstats` carries
 * the name recorded when the games were played, which often outlives that, so it is the better
 * fallback — and the profile id is the last resort, since two unresolved players on one roster
 * still have to be told apart.
 */
function label(name: string | null | undefined, recorded: string | null | undefined, profileId: number): string {
  return name?.trim() || recorded?.trim() || `Unknown (#${profileId})`;
}

/**
 * The declared roster on its own, with no statistics.
 *
 * For a list that answers "who is on this team" and nothing more. Every entry's `stats` is `null`,
 * a bench player has no role (the bench isn't role-assigned, and only a stat line could say what
 * they played), and a slot whose Riot ID no longer resolves falls back to its profile id rather
 * than to the name recorded when they played.
 */
export function rosterEntries(roster: TeamRoster): RosterEntry[] {
  return joinRoster(roster, []).entries;
}

export function joinRoster<S extends PlayerStats>(
  roster: TeamRoster | null,
  stats: readonly S[],
): JoinedRoster<S> {
  // A null roster means the lookup failed, not that the team has nobody. Falling through would
  // report every player as an appearance "outside a roster slot", so present the stat lines as
  // the roster instead — exactly what this could show before slots carried profiles.
  if (roster === null) {
    return {
      entries: sortByRole(stats).map(p => ({
        key: p.rowKey,
        profileId: p.id,
        name: label(p.name, null, p.id),
        role: p.role,
        starter: true,
        stats: p,
      })),
      extras: [],
    };
  }

  const byProfile = new Map<number, S[]>();
  for (const row of stats) {
    const rows = byProfile.get(row.id);
    if (rows) rows.push(row);
    else byProfile.set(row.id, [row]);
  }

  // One row can only serve one slot, so claiming is destructive: without it, a player listed
  // both as a starter and as a sub would show the same games twice.
  const claimed = new Set<S>();
  const claim = (profileId: number, role: Role | null): S | null => {
    const rows = (byProfile.get(profileId) ?? []).filter(r => !claimed.has(r));
    if (rows.length === 0) return null;
    const best =
      (role === null ? undefined : rows.find(r => r.role === role)) ??
      rows.reduce((a, b) => (b.games > a.games ? b : a));
    claimed.add(best);
    return best;
  };

  const entries: RosterEntry<S>[] = [];

  for (const { key, role } of SLOTS) {
    const slot = roster[key];
    if (!slot) continue;
    const row = claim(slot.profileId, role);
    entries.push({
      key: `${key}:${slot.profileId}`,
      profileId: slot.profileId,
      name: label(slot.name, row?.name, slot.profileId),
      role,
      starter: true,
      stats: row,
    });
  }

  // The bench is not role-assigned, so a sub's role can only come from what they played.
  roster.subs.forEach((slot, i) => {
    const row = claim(slot.profileId, null);
    entries.push({
      key: `sub${i}:${slot.profileId}`,
      profileId: slot.profileId,
      name: label(slot.name, row?.name, slot.profileId),
      role: row?.role ?? null,
      starter: false,
      stats: row,
    });
  });

  return { entries, extras: stats.filter(r => !claimed.has(r)) };
}
