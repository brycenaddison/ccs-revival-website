import type { ChampionLookup } from "../lib/championData";

interface Props {
  /** Numeric champion id, internal alias, or display name — whatever the payload carries. */
  champion?: number | string | null;
  lookup?: ChampionLookup | null;
  /**
   * An icon URL the API already resolved (`img`, `champImg`, `icon`).
   *
   * Preferred over the lookup when present, and it is the same URL the lookup would build —
   * both are Community Dragon's `/champion/:id/square`. See `lib/championData.ts`.
   */
  src?: string | null;
  /** Display name the API already resolved. Saves a lookup the caller doesn't need. */
  name?: string | null;
  size?: number;
  /** Show the display name next to the icon. */
  showName?: boolean;
  /** Text to fall back to when the champion can't be resolved. */
  fallbackLabel?: string;
  /** Tooltip override — the pick count a champion pool carries, say. Defaults to the name. */
  title?: string;
  /**
   * The champion's name is already rendered next to this icon, so the icon adds nothing to read.
   *
   * Empties the `alt`, which is what stops a screen reader announcing the name twice for one cell.
   */
  decorative?: boolean;
  className?: string;
}

/**
 * A champion's square icon, from either an API-served URL or a client-side id/name lookup.
 *
 * One component for both because they are the same picture: `lib/championData.ts` builds its URLs
 * the way the API does. Callers that hold a served `img` pass it as `src` and skip the lookup;
 * callers holding only a Riot payload's `championId` pass `champion` + `lookup`.
 *
 * Degrades to text when neither resolves, so a CDN failure costs artwork rather than information.
 */
export function ChampionIcon({
  champion,
  lookup,
  src,
  name,
  size = 24,
  showName = false,
  fallbackLabel,
  title,
  decorative = false,
  className,
}: Props) {
  const info = src ? undefined : lookup?.get(champion);
  const label =
    name ??
    info?.name ??
    fallbackLabel ??
    (typeof champion === "string" && champion !== "" ? champion : "—");
  const icon = src ?? info?.icon ?? null;

  // A decorative icon that failed to resolve renders nothing: its label is already on screen, so
  // a text fallback here would print the champion's name twice.
  if (!icon) {
    return decorative ? null : <span className={className ?? "text-xs text-text-secondary"}>{label}</span>;
  }

  return (
    <span className={className ?? "flex items-center gap-1.5 min-w-0"} title={title ?? label}>
      <img
        src={icon}
        alt={decorative ? "" : label}
        loading="lazy"
        decoding="async"
        width={size}
        height={size}
        className="rounded shrink-0"
        style={{ width: size, height: size }}
      />
      {showName && <span className="text-xs text-text-secondary truncate">{label}</span>}
    </span>
  );
}
