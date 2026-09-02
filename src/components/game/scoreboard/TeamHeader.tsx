/**
 * A team block's header: the result word, the team, and in the last two tracks the column switchers
 * (blue block) or nothing (red block). One subgrid row of the board. The side's numbers live in
 * `TeamFooter`, beneath the rows.
 *
 * **The switchers line up with the columns below by construction.** They are grid items in tracks six
 * and seven of the same grid the rows use, so there is no width or gap to keep in step.
 */

import type { Dispatch, SetStateAction } from "react";
import { cn } from "../../../lib/cn";
import type { TeamMetadata } from "../../../lib/api";
import { accentHex } from "../../../lib/teamStyle";
import type { RiotTeamId } from "../../../lib/riot/matchV5";
import { sideTeamCode } from "../../../lib/game/participants";
import { TeamBadge } from "../../TeamBadge";
import { TeamLink } from "../../league/TeamLink";
import { useGameView } from "../GameView";
import type { Density } from "./density";
import { DAMAGE_OPTIONS, FARM_OPTIONS, StatSwitcher, type DamageStat, type FarmStat } from "./StatSwitcher";

export interface Switchers {
  damage: [DamageStat, Dispatch<SetStateAction<DamageStat>>];
  farm: [FarmStat, Dispatch<SetStateAction<FarmStat>>];
}

/** The result word and the team, shared with the compact board. */
export function TeamIdentity({ teamId, density }: { teamId: RiotTeamId; density: Density }) {
  const { match, context, participants } = useGameView();
  const team = match.info.teams.find(t => t.teamId === teamId);
  const code = sideTeamCode(participants, teamId);
  const meta: TeamMetadata | null = code !== null ? context?.teams[code] ?? null : null;
  const win = team?.win;

  return (
    <div className="flex min-w-0 items-center gap-3">
      {win !== undefined && (
        <span className={cn("font-display font-bold", density.result, win ? "text-ccs-green" : "text-text-muted")}>
          {win ? "Victory" : "Defeat"}
        </span>
      )}
      {meta ? (
        <TeamLink conf={meta.conf ?? context?.conf} code={meta.code} className="group flex min-w-0 items-center gap-2 no-underline">
          <TeamBadge
            team={{ name: meta.name, color_primary: meta.colorHex, color_accent: accentHex(meta), logo_url: meta.logo }}
            size={density.ban + 6}
          />
          <span className="truncate font-heading font-semibold text-text-bright group-hover:text-brand group-hover:underline">
            {meta.name}
          </span>
        </TeamLink>
      ) : code !== null ? (
        <span className="font-heading font-semibold text-text-bright">{code}</span>
      ) : null}
    </div>
  );
}

export function TeamHeader({
  teamId,
  density,
  switchers,
}: {
  teamId: RiotTeamId;
  density: Density;
  /** The blue header owns the switchers; the red one passes `null` and leaves the tracks empty. */
  switchers: Switchers | null;
}) {
  return (
    // No horizontal padding on the row itself: a subgrid's padding is added to its edge tracks, so
    // `px-3` here widened the farm track by 12px in every row (whitespace the board could not compact)
    // and offset the farm switcher 6px left of the numbers beneath it. The inset goes on the identity
    // cell instead; the switchers sit in their tracks exactly as the rows' cells do.
    <div className={cn("col-span-7 grid grid-cols-subgrid items-center border-b border-border bg-bg3", density.header)}>
      <div className="col-span-5 min-w-0 pl-3">
        <TeamIdentity teamId={teamId} density={density} />
      </div>
      {switchers ? (
        <>
          <StatSwitcher value={switchers.damage[0]} options={DAMAGE_OPTIONS} onChange={switchers.damage[1]} density={density} />
          <StatSwitcher value={switchers.farm[0]} options={FARM_OPTIONS} onChange={switchers.farm[1]} density={density} />
        </>
      ) : (
        <>
          <span />
          <span />
        </>
      )}
    </div>
  );
}
