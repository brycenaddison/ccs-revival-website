import { Link } from "react-router-dom";
import type { ComponentProps, CSSProperties, ReactNode } from "react";
import { useSeasonLink } from "../../lib/leagueContext";
import type { Team } from "../../types/league";

/**
 * Canonical path for a team's page. `teams.id` is globally unique and survives a tag change, so the
 * path carries neither the conf nor the code.
 */
export function teamPath(teamId: number): string {
  return `/teams/${teamId}`;
}

interface Props extends Omit<ComponentProps<typeof Link>, "to" | "children"> {
  /** A view-model team, which carries its ID. */
  team?: Pick<Team, "teamId"> | null;
  /**
   * Or the served team ID. Null is unresolved legacy evidence: the link renders as plain content
   * rather than recovering an identity from a tag.
   */
  teamId?: number | null;
  className?: string;
  style?: CSSProperties;
  title?: string;
  /**
   * Set when the link sits inside another clickable element (a table row that opens a game,
   * say) so the click doesn't trigger both.
   */
  stopPropagation?: boolean;
  children: ReactNode;
}

/**
 * Wraps any team reference in a link to that team's page.
 *
 * Renders children unwrapped when it has no team ID, so call sites don't need to branch on partial
 * data.
 */
export function TeamLink({ team, teamId, className, style, title, stopPropagation, children, onClick, ...props }: Props) {
  // The team page's "back to CCS" link needs the season the visitor was browsing, and it can only
  // carry what arrived in the URL.
  const seasonLink = useSeasonLink();
  const id = team?.teamId ?? teamId ?? null;
  if (id === null) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }

  return (
    <Link
      {...props}
      to={seasonLink(teamPath(id))}
      className={className}
      style={style}
      title={title}
      onClick={event => {
        if (stopPropagation) event.stopPropagation();
        onClick?.(event);
      }}
    >
      {children}
    </Link>
  );
}
