import type { ChampionLookup } from "../../lib/championData";

interface Props {
  /** Numeric champion id, internal name, or display name — whatever the payload carries. */
  champion: number | string | null | undefined;
  lookup: ChampionLookup | null;
  size?: number;
  /** Show the display name next to the icon. */
  showName?: boolean;
  /** Text to fall back to when the champion can't be resolved. */
  fallbackLabel?: string;
  className?: string;
}

/**
 * A champion's square icon, with the display name resolved from its id.
 *
 * Degrades to text when the lookup hasn't loaded or the reference doesn't resolve, so a CDN
 * failure costs artwork rather than information.
 */
export function ChampionIcon({
  champion,
  lookup,
  size = 24,
  showName = false,
  fallbackLabel,
  className,
}: Props) {
  const info = lookup?.get(champion);
  const label = info?.name ?? fallbackLabel ?? (typeof champion === "string" && champion !== "" ? champion : "—");

  if (!info) {
    return <span className={className ?? "text-xs text-text-secondary"}>{label}</span>;
  }

  return (
    <span className={className ?? "flex items-center gap-1.5 min-w-0"} title={label}>
      <img
        src={info.icon}
        alt={label}
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
