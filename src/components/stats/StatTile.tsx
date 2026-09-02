/**
 * One headline number with a caption.
 *
 * Two shapes. Without a `subject` it is just value-over-label, which is all a count needs.
 *
 * With one it names *who* holds the number, and does it properly: the metric becomes a small label
 * above the value and the holder gets its own line below, with its logo. The first version crammed both
 * into the caption as "Best Win% · DoGI" — a truncated 9px string in which the team was the least
 * legible part of a tile that exists to point at a team.
 */

interface Props {
  value: string;
  label: string;
  /** A CSS var, not a hex literal, so the tile follows the light/dark toggle. */
  color: string;
  /** The team or player holding this number. Switches the tile to its labeled-above layout. */
  subject?: string;
  subjectLogo?: string;
  /**
   * Fallback block color when the subject has no logo. Defaults to the theme-aware neutral, since a
   * team's own color is unset often enough that it resolves to a near-invisible dark gray.
   */
  subjectColor?: string;
}

export function StatTile({ value, label, color, subject, subjectLogo, subjectColor }: Props) {
  if (!subject) {
    return (
      // `h-full` plus centring, because this sits in a grid row alongside the taller subject variant
      // and a top-aligned lone number next to three three-line tiles reads as a mistake.
      <div className="bg-bg3 border border-border rounded-lg px-3 py-3.5 text-center min-w-0 h-full flex flex-col justify-center">
        <div className="font-display text-[26px] leading-none truncate" style={{ color }}>{value}</div>
        <div className="text-[9px] text-text-muted font-heading mt-1.5 truncate"title={label}>
          {label}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-bg3 border border-border rounded-lg px-3 py-3 min-w-0 h-full">
      <div className="text-[9px] text-text-muted font-heading truncate"title={label}>
        {label}
      </div>
      <div className="font-display text-[26px] leading-none truncate mt-1" style={{ color }}>{value}</div>
      <div className="flex items-center gap-1.5 mt-2 min-w-0">
        {subjectLogo ? (
          <img
            src={subjectLogo}
            alt=""
            loading="lazy"
            decoding="async"
            className="w-5 h-5 rounded object-contain shrink-0"
          />
        ) : (
          <span className="w-5 h-5 rounded shrink-0" style={{ background: subjectColor ?? "var(--bar-unset)" }} />
        )}
        <span className="font-heading text-[11px] text-text-bright truncate" title={subject}>
          {subject}
        </span>
      </div>
    </div>
  );
}
