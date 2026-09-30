/**
 * The two-team header card: a team column either side of a center slot, then a caption row.
 *
 * Shared by the match page and the prediction detail page, so a fixture looks the same wherever it
 * is headed. The caller owns the center (a score or "vs", plus its own status chip) and the caption
 * items; anything passed as `children` sits between the teams and the caption, which is where the
 * prediction page puts its pool bar.
 *
 * Team columns link to the team page with `TeamLink`, show the full name on desktop and the code on
 * mobile, and dim unless `won`. A null team renders "TBD".
 */

import type { ReactNode } from "react";
import { TeamBadge } from "../TeamBadge";
import { TeamLink } from "../league/TeamLink";
import { toBadge } from "../../lib/leagueAdapters";
import type { TeamColors } from "../../lib/teamStyle";

export type MatchupTeam = TeamColors & { code: string; name: string; logo?: string };

export function MatchupHeader({
  conf,
  teamA,
  teamB,
  wonA = false,
  wonB = false,
  recordA,
  recordB,
  center,
  caption,
  children,
}: {
  conf: string;
  teamA: MatchupTeam | null;
  teamB: MatchupTeam | null;
  wonA?: boolean;
  wonB?: boolean;
  /** A preformatted season record ("3-1") under each name, when the read serves one. */
  recordA?: string | null;
  recordB?: string | null;
  center: ReactNode;
  caption?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mb-6 rounded-lg border border-border bg-bg2 p-6">
      <div className="flex items-center justify-center gap-6 md:gap-10">
        <TeamColumn team={teamA} conf={conf} side="left" won={wonA} record={recordA} />
        <div className="flex min-w-[90px] shrink-0 flex-col items-center gap-1">{center}</div>
        <TeamColumn team={teamB} conf={conf} side="right" won={wonB} record={recordB} />
      </div>
      {children}
      {caption && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 font-heading text-[11px] text-text-muted">
          {caption}
        </div>
      )}
    </div>
  );
}

/** The center before a result: a muted "vs". */
export function MatchupVs() {
  return <span className="rounded bg-bg-input px-3 py-1 font-display text-base text-text-dim">vs</span>;
}

/** The center after a result. The leading side (or both, when level) reads bright. */
export function MatchupScore({ a, b }: { a: number; b: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`font-display text-3xl md:text-4xl ${a >= b ? "text-text-bright" : "text-text-muted"}`}>{a}</span>
      <span className="font-display text-lg text-text-subtle">-</span>
      <span className={`font-display text-3xl md:text-4xl ${b >= a ? "text-text-bright" : "text-text-muted"}`}>{b}</span>
    </div>
  );
}

/** Caption items are separated by a dot, and the separator belongs to the item that follows one. */
export function MatchupCaption({ children }: { children: ReactNode }) {
  return (
    <>
      <span className="text-text-subtle first:hidden">·</span>
      <span>{children}</span>
    </>
  );
}

/** A link inside the caption row, like "Watch" or "Match details". */
export const MATCHUP_CAPTION_LINK = "text-brand no-underline hover:underline";

function TeamColumn({
  team,
  conf,
  side,
  won,
  record,
}: {
  team: MatchupTeam | null;
  conf: string;
  side: "left" | "right";
  won: boolean;
  record?: string | null;
}) {
  if (team === null) {
    return (
      <div className={`flex min-w-0 flex-1 items-center ${side === "left" ? "justify-end" : ""}`}>
        <span className="font-heading text-base italic text-text-dim md:text-lg">TBD</span>
      </div>
    );
  }

  const badge = <TeamBadge team={toBadge(team)} size={44} />;
  const name = (
    <span
      className={`truncate font-heading text-base font-medium group-hover:text-brand md:text-lg ${
        won ? "font-bold text-text-bright" : "text-text-muted"
      }`}
    >
      <span className="hidden md:inline">{team.name}</span>
      <span className="md:hidden">{team.code}</span>
    </span>
  );

  return (
    <TeamLink
      conf={conf}
      code={team.code}
      className={`group flex min-w-0 flex-1 flex-col gap-1 no-underline ${side === "left" ? "items-end" : ""}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        {side === "left" ? <>{name}{badge}</> : <>{badge}{name}</>}
      </div>
      {record && <span className="font-mono text-[11px] text-text-dim">{record}</span>}
    </TeamLink>
  );
}
