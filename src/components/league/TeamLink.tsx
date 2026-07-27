import { Link } from "react-router-dom";
import type { CSSProperties, ReactNode } from "react";
import { parseTeamKey } from "../../lib/leagueAdapters";
import type { Team } from "../../types/league";

/** Canonical path for a team's page. Teams are identified by (conf, code), not code alone. */
export function teamPath(conf: string, code: string): string {
  return `/teams/${encodeURIComponent(conf)}/${encodeURIComponent(code)}`;
}

interface Props {
  /** A view-model team, whose `id` already encodes conf and code. */
  team?: Pick<Team, "id"> | null;
  /** Or an explicit conf + code, for API rows that only carry a team code. */
  conf?: string;
  code?: string | null;
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
 * Renders children unwrapped when it can't resolve a target, so call sites don't need to
 * branch on partial data — a team with no conf simply isn't a link.
 */
export function TeamLink({ team, conf, code, className, style, title, stopPropagation, children }: Props) {
  const resolved = team ? parseTeamKey(team.id) : conf && code ? { conf, code } : null;
  if (!resolved) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }

  return (
    <Link
      to={teamPath(resolved.conf, resolved.code)}
      className={className}
      style={style}
      title={title}
      onClick={stopPropagation ? e => e.stopPropagation() : undefined}
    >
      {children}
    </Link>
  );
}
