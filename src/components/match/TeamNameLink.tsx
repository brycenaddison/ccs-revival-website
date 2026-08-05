/**
 * A team named in full, linked to its page, on a surface that only knows its code.
 *
 * The box score and the series totals both identify a team by **code** — that is all the games carry; the
 * full name and the conference live on the fixture. And a code is not what a reader recognises: `XSVH`
 * over five player rows is a lookup they have to do themselves. So the match page resolves codes once and
 * hands down a `TeamNamer`, and both surfaces render the name the header does.
 *
 * The code survives as the tooltip, because it is what the objectives line, the winner line and the
 * standings all use.
 */

import { TeamLink } from "../league/TeamLink";

/** Resolves a team code against the fixture. `null` for one the fixture doesn't name. */
export interface TeamNamer {
  (code: string): { name: string; conf: string } | null;
}

export function TeamNameLink({
  code,
  nameOf,
  className,
}: {
  code: string;
  nameOf: TeamNamer;
  /** Applied to the text either way, so the resolved and unresolved cases look alike. */
  className?: string;
}) {
  const team = nameOf(code);

  /*
   * An unresolvable code renders as itself and doesn't link. That happens when the games attached to a
   * fixture aren't its games — which `linkage: "inferred"` already warns about further down the page —
   * and a wrong link is worse there than no link.
   */
  if (team === null) return <span className={`truncate ${className ?? ""}`}>{code}</span>;

  return (
    <TeamLink conf={team.conf} code={code} title={code} className="min-w-0 no-underline">
      <span className={`truncate hover:text-accent ${className ?? ""}`}>{team.name}</span>
    </TeamLink>
  );
}
