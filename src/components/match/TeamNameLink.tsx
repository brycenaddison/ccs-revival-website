/**
 * A team named in full, linked to its page, on a surface that only knows its ID and recorded code.
 *
 * The box score and the series totals identify a side by `teamId` and label it with the code it was
 * recorded under, which is all the games carry; the full name lives on the fixture. And a code is not
 * what a reader recognizes: `XSVH` over five player rows is a lookup they have to do themselves. So the
 * match page resolves IDs once and hands down a `TeamNamer`, and both surfaces render the name the
 * header does.
 *
 * The code survives as the tooltip, because it is what the objectives line, the winner line and the
 * standings all use.
 */

import { TeamLink } from "../league/TeamLink";

/** Resolves a served team ID against the fixture's two sides. `null` for one the fixture doesn't name. */
export interface TeamNamer {
  (teamId: number | null): { teamId: number; name: string } | null;
}

export function TeamNameLink({
  teamId,
  code,
  nameOf,
  className,
}: {
  teamId: number | null;
  /** The code the side was recorded under, shown when the fixture doesn't name the team. */
  code: string;
  nameOf: TeamNamer;
  /** Applied to the text either way, so the resolved and unresolved cases look alike. */
  className?: string;
}) {
  const team = nameOf(teamId);

  /*
   * An unresolvable side renders its code and doesn't link. That happens when the games attached to a
   * fixture aren't its games — which `linkage: "inferred"` already warns about further down the page —
   * or when legacy evidence has no team ID, and a wrong link is worse there than no link.
   */
  if (team === null) return <span className={`truncate ${className ?? ""}`}>{code}</span>;

  return (
    <TeamLink teamId={team.teamId} title={code} className="min-w-0 no-underline hover:text-brand [&:hover_*]:text-brand">
      <span className={`truncate hover:text-brand ${className ?? ""}`}>{team.name}</span>
    </TeamLink>
  );
}
