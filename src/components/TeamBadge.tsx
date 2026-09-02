import { teamGradient } from "../lib/teamStyle";
import { teamInitial } from "../lib/utils";

interface TeamBadgeProps {
  team?: { name?: string; color_primary?: string; color_accent?: string; logo_url?: string };
  size?: number;
}

export function TeamBadge({ team, size = 24 }: TeamBadgeProps) {
  if (team?.logo_url) {
    return (
      <img
        src={team.logo_url}
        alt={team.name || ""}
        loading="lazy"
        decoding="async"
        width={size}
        height={size}
        className="shrink-0 object-contain"
        style={{
          width: size,
          height: size,
          borderRadius: size > 24 ? 6 : 4,
        }}
        onError={(e) => {
          // Fall back to gradient badge on load error
          const el = e.currentTarget;
          el.style.display = "none";
          el.nextElementSibling?.classList.remove("hidden");
        }}
      />
    );
  }

  return (
    <div
      className="flex items-center justify-center font-heading font-bold text-white shrink-0"
      style={{
        width: size,
        height: size,
        borderRadius: size > 24 ? 6 : 4,
        background: teamGradient(team?.color_primary || "#333", team?.color_accent || "#555"),
        fontSize: Math.max(8, size * 0.4),
      }}
    >
      {teamInitial(team?.name)}
    </div>
  );
}

/**
 * A team's card header: its gradient, the logo (or initial) on a translucent well inside it, and the
 * name and tag in white beside that. The same markup as the Teams tab's card header in
 * `views/TeamsView.tsx`, which is the largest surface a team's pair is ever painted on.
 *
 * Takes the resolved `background` rather than the colors so the rule for which two stops to draw
 * stays in `lib/teamStyle.ts`: a team already on the wire passes `teamGradientFor`, and the color
 * forms pass `teamGradient` over the pair being chosen. Shared by `TeamStylePreview` and the
 * invitation inbox, so a team looks the same to the captain choosing its colors, to the player
 * deciding whether to join it, and on the Teams tab once it exists.
 */
export function TeamStyleHeader({
  name,
  code,
  logo,
  background,
  label,
}: {
  name: string;
  code: string;
  logo: string | null;
  /** A CSS `background` value from `lib/teamStyle.ts`. */
  background: string;
  /** An `aria-label`, for a caller whose header is decorative rather than the card's heading. */
  label?: string;
}) {
  return (
    <div
      className="flex items-center gap-3.5 px-4 py-5"
      style={{ background }}
      aria-label={label}
    >
      {logo ? (
        <img src={logo} alt="" decoding="async" className="h-12 w-12 rounded-lg bg-black/20 object-contain" />
      ) : (
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-black/30 font-heading text-xl font-bold text-white">
          {teamInitial(name)}
        </div>
      )}
      <div className="min-w-0">
        <div className="truncate font-display text-xl text-white">{name}</div>
        <div className="mt-0.5 font-mono text-[11px] text-white/70">{code}</div>
      </div>
    </div>
  );
}
