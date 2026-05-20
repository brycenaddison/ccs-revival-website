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
        background: `linear-gradient(135deg, ${team?.color_primary || "#333"}, ${team?.color_accent || "#555"})`,
        fontSize: Math.max(8, size * 0.4),
      }}
    >
      {teamInitial(team?.name)}
    </div>
  );
}
