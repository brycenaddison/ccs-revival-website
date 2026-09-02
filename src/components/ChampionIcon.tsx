import {
  isNoBanChampion,
  NO_BAN_CHAMPION,
  type ChampionLookup,
} from "../lib/championData";
import { tileClass } from "../lib/tile";

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
  /**
   * Draw the icon as a tile: clipped to a rounded box with the artwork scaled up 20%, on a lift.
   *
   * Riot bakes a one-pixel dark border into every square; the client hides it by zooming the art a
   * touch past the box, and so does this. The lift is `shadow-tile`, the same one every item, rune and
   * spell tile wears (`game/RiotIcons.tsx`), so a row of mixed icons reads as one set.
   */
  tile?: boolean;
  className?: string;
}

/**
 * A champion's square icon, from either an API-served URL or a client-side id/name lookup.
 *
 * One component for both because they are the same picture: `lib/championData.ts` builds its URLs
 * the way the API does. Callers that hold a served `img` pass it as `src` and skip the lookup;
 * callers holding only a Riot payload's `championId` pass `champion` + `lookup`.
 *
 * `-1` always resolves to Community Dragon's dedicated no-ban icon, even when an API supplies a
 * broken normal-champion URL or the champion lookup has not loaded yet.
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
  tile = false,
  className,
}: Props) {
  const noBan = isNoBanChampion(champion);
  const info = noBan ? NO_BAN_CHAMPION : src ? undefined : lookup?.get(champion);
  const label =
    (noBan ? NO_BAN_CHAMPION.name : name) ??
    info?.name ??
    fallbackLabel ??
    (typeof champion === "string" && champion !== "" ? champion : "—");
  // A served `src` for -1 usually points at the normal champion route, where this asset does not
  // exist. The sentinel's dedicated path therefore wins even though `src` wins for real champions.
  const icon = noBan ? NO_BAN_CHAMPION.icon : src ?? info?.icon ?? null;

  // A decorative icon that failed to resolve renders nothing: its label is already on screen, so
  // a text fallback here would print the champion's name twice.
  if (!icon) {
    return decorative ? null : <span className={className ?? "text-xs text-text-secondary"}>{label}</span>;
  }

  const img = (
    <img
      src={icon}
      alt={decorative ? "" : label}
      loading="lazy"
      decoding="async"
      width={size}
      height={size}
      className={tile ? "block h-full w-full scale-[1.2] object-cover object-center" : "rounded shrink-0"}
      style={tile ? undefined : { width: size, height: size }}
    />
  );

  return (
    <span className={className ?? "flex items-center gap-1.5 min-w-0"} title={title ?? label}>
      {tile ? (
        <span className={`inline-block shrink-0 overflow-hidden bg-bg3 ${tileClass(size)}`} style={{ width: size, height: size }}>
          {img}
        </span>
      ) : (
        img
      )}
      {showName && <span className="text-xs text-text-secondary truncate">{label}</span>}
    </span>
  );
}
