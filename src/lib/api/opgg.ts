/**
 * Upstream's `OpggLinks`, served on profiles and on every hydrated team (team lists, the team page
 * and both sides of a match).
 *
 * A team's link covers its five starters only, built from saved verified accounts and self-reported
 * claims; substitutes, owners and contacts never enter it. `opggComplete` describes Riot ID
 * resolution, not whether every slot is filled, so a team with an empty slot can still be complete.
 * A deployment that does not serve the field maps to no link rather than an error.
 */

type Raw = Record<string, unknown>;

export interface OpggLinks {
  opggMultisearch: string | null;
  opggComplete: boolean;
  unresolvedPuuids: string[];
}

export function mapOpggLinks(value: unknown): OpggLinks {
  const r: Raw = value && typeof value === "object" ? (value as Raw) : {};
  return {
    opggMultisearch:
      typeof r.opggMultisearch === "string" && r.opggMultisearch.trim() !== "" ? r.opggMultisearch : null,
    opggComplete: r.opggComplete === true,
    unresolvedPuuids: Array.isArray(r.unresolvedPuuids)
      ? r.unresolvedPuuids.filter((entry): entry is string => typeof entry === "string" && entry !== "")
      : [],
  };
}
