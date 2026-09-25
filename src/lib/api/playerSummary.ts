/** Shared, display-only identity carried through search, resolution and roster hydration. */
export interface PlayerSummary {
  profileId: number;
  name: string | null;
  avatar: string | null;
  avatarSource: "discord" | "riot" | null;
  /** Served by the API: saved Discord association AND at least one verified Riot account. */
  verified: boolean;
}

export function mapPlayerSummary(value: unknown): PlayerSummary | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const id = raw.profileId ?? raw.id;
  const profileId = typeof id === "string" && /^\d+$/.test(id) ? Number(id) : id;
  if (typeof profileId !== "number" || !Number.isSafeInteger(profileId) || profileId <= 0) return null;
  return {
    profileId,
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name : null,
    avatar: typeof raw.avatar === "string" && raw.avatar.trim() ? raw.avatar : null,
    avatarSource: raw.avatarSource === "discord" || raw.avatarSource === "riot" ? raw.avatarSource : null,
    // Older responses remain usable, without guessing associations from the name or artwork.
    verified: raw.verified === true,
  };
}
