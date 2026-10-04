/**
 * The Teams tab: every team in one conference, one card each, with its roster, staff and OP.GG link.
 *
 * **One conference at a time**, like Standings and Stats. With several running, `DivisionPicker`
 * picks one and the grid shows only that division's teams; a merged grid of two divisions sorted by
 * name reads as one league of twenty, which is a competition nobody is in.
 *
 * **Loaded per division.** Only the picked conf's `queries.teamsForConf` is read, so another
 * division costs nothing until it is picked; `Home` does not load the league for this tab. A picked
 * division keeps its cache, so switching back is instant.
 *
 * Each person shows the slot's served presentation: avatar, pronouns, the verified shield, cached
 * Discord handle, primary Riot ID and solo rank. Every one of them can be absent, and an absent one
 * renders nothing rather than a placeholder, because none of them is required of a player.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { errorMessage, roleLabel, type RosterSlot, type TeamRecord } from "../../lib/api";
import { useLeague } from "../../lib/leagueContext";
import { groupLabels } from "../../lib/leagueAdapters";
import { queries } from "../../lib/queries";
import { rosterEntries } from "../../lib/roster";
import { teamGradientFor } from "../../lib/teamStyle";
import { teamInitial } from "../../lib/utils";
import { cn } from "../../lib/cn";
import { tierLabel, tierTone } from "../../lib/riot/rankTiers";
import { OpggLink } from "../OpggLink";
import { DivisionPicker } from "../league/DivisionPicker";
import { LEAGUE_VIEW_COLUMN } from "./leagueViewColumn";
import { TeamLink } from "../league/TeamLink";
import { PlayerAvatar, playerLabel, VerifiedMark } from "../players/PlayerIdentity";
import { DiscordHandleCopy } from "../players/DiscordHandleCopy";
import { PlayerLink } from "../profile/PlayerLink";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

interface Member {
  key: string;
  label: string;
  name: string;
  slot: RosterSlot;
}

/** One width for every rank badge, and for the empty slot beside an unavailable rank, so rows align. */
const RANK_WIDTH = "w-22 justify-center";

/**
 * The solo tier and division in the tier's color, without LP. `unavailable` (no verified account, an
 * incomplete cache) leaves the slot empty: it says nothing about the player, and "Unavailable"
 * beside a name would read as an accusation.
 */
function SoloRank({ slot }: { slot: RosterSlot }) {
  if (slot.rankStatus === "ranked" && slot.soloRank) {
    const { tier, division } = slot.soloRank;
    return (
      <Badge variant="outline" className={cn(RANK_WIDTH, tierTone(tier))}>
        <span className="sr-only">Solo/Duo: </span>{tierLabel(tier, division)}
      </Badge>
    );
  }
  if (slot.rankStatus === "unranked") return <Badge variant="muted" className={RANK_WIDTH}>Unranked</Badge>;
  return <span className={cn("shrink-0", RANK_WIDTH)} aria-hidden="true" />;
}

/**
 * One person: name, pronouns, shield and Discord copy icon on the first line, Riot ID beneath, rank at
 * the right. A missing handle proves nothing: it is a login-time
 * cache, not the association itself.
 */
function MemberRow({ member }: { member: Member }) {
  const { slot } = member;
  const [copyError, setCopyError] = useState<string | null>(null);

  return (
    <li className="flex min-w-0 items-center gap-2.5 py-1.5">
      <span className="w-14 shrink-0 font-heading text-[11px] text-text-muted">{member.label}</span>
      <PlayerAvatar src={slot.avatar} size="medium" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-1.5">
          <PlayerLink
            profileId={slot.profileId}
            className="truncate font-heading text-[13px] font-medium text-text-bright no-underline hover:text-brand"
          >
            {member.name}
          </PlayerLink>
          {slot.pronouns && <span className="shrink-0 text-[11px] text-text-dim">{slot.pronouns}</span>}
          {slot.verified && <VerifiedMark />}
          {slot.handle && <DiscordHandleCopy handle={slot.handle} onError={setCopyError} />}
        </span>
        {slot.primaryRiotId && (
          <span className="max-w-full truncate text-xs text-text-secondary"><span className="sr-only">Riot ID: </span>{slot.primaryRiotId}</span>
        )}
        {copyError && <span role="alert" className="text-xs text-destructive">{copyError}</span>}
      </span>
      <SoloRank slot={slot} />
    </li>
  );
}

/**
 * Owner first, then contacts. A contact who is also the owner is listed once, as owner: the same
 * person twice in a three-line list reads as two people.
 */
function staffOf(team: TeamRecord): Member[] {
  const owner = team.owner ?? null;
  const contacts = (team.contacts ?? []).filter(c => c.profileId !== owner?.profileId);
  return [
    ...(owner ? [{ key: `owner:${owner.profileId}`, label: "Owner", name: playerLabel(owner), slot: owner }] : []),
    ...contacts.map(c => ({ key: `contact:${c.profileId}`, label: "Contact", name: playerLabel(c), slot: c })),
  ];
}

function TeamCard({ team, conf }: { team: TeamRecord; conf: string }) {
  const roster: Member[] = rosterEntries(team).flatMap(e => e.slot
    ? [{ key: e.key, label: e.starter ? roleLabel(e.role, "") : "Sub", name: e.name, slot: e.slot }]
    : []);
  const staff = staffOf(team);

  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-bg2">
      <TeamLink
        conf={conf}
        code={team.code}
        className="flex min-w-0 items-center gap-3.5 px-4 py-4 no-underline"
        style={{ background: teamGradientFor(team) }}
      >
        {team.logo ? (
          <img src={team.logo} alt="" loading="lazy" decoding="async" className="size-12 shrink-0 rounded-lg bg-black/20 object-contain" />
        ) : (
          <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-black/30 font-heading text-xl font-bold text-white">
            {teamInitial(team.name)}
          </div>
        )}
        <div className="min-w-0">
          <div className="truncate font-display text-lg text-white">{team.name}</div>
          <div className="mt-0.5 flex items-center gap-2 font-mono text-[11px]">
            <span className="text-white/70">{team.code}</span>
            {team.record && (
              <span className="font-bold text-white/90">{team.record.seriesWins}W-{team.record.seriesLosses}L</span>
            )}
          </div>
        </div>
      </TeamLink>

      <div className="flex flex-1 flex-col gap-3 px-4 py-3">
        <section>
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-heading text-sm text-text-secondary">Roster</h3>
            <OpggLink links={team.links} team={team.name} />
          </div>
          {roster.length === 0 ? (
            <div className="py-2 text-xs text-text-dim">No roster set</div>
          ) : (
            <ul className="mt-1 list-none p-0">
              {roster.map(m => <MemberRow key={m.key} member={m} />)}
            </ul>
          )}
        </section>

        {staff.length > 0 && (
          <section className="border-t border-border pt-3">
            <h3 className="font-heading text-sm text-text-secondary">Staff</h3>
            <ul className="mt-1 list-none p-0">
              {staff.map(m => <MemberRow key={m.key} member={m} />)}
            </ul>
          </section>
        )}
      </div>
    </article>
  );
}

export function TeamsView() {
  const { tournaments, selectedConfs } = useLeague();

  // Resolved rather than stored, so a stale pick after the season selection changes falls back to
  // the first conference instead of showing an empty grid.
  const [confPick, setConfPick] = useState<string | null>(null);
  const conf = (confPick && selectedConfs.includes(confPick) ? confPick : selectedConfs[0]) ?? null;

  const labels = useMemo(() => groupLabels(tournaments, selectedConfs), [tournaments, selectedConfs]);

  const teams = useQuery({ ...queries.teamsForConf(conf ?? ""), enabled: conf !== null });
  // Alphabetical, as this tab has always listed teams. The served order is by code.
  const shown = useMemo(
    () => [...(teams.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [teams.data],
  );

  return (
    // The same column as Standings, so the heading and picker hold still between the two tabs.
    <div className={LEAGUE_VIEW_COLUMN}>
      <h2 className="font-display text-[22px] text-text-bright mb-4">Teams</h2>

      <DivisionPicker confs={selectedConfs} selected={conf} labels={labels} onSelect={setConfPick} />

      {conf === null ? null
        : teams.isPending ? <p role="status" className="py-10 text-center text-sm text-text-subtle">Loading teams…</p>
        : teams.error ? (
          <Alert variant="destructive">
            <AlertTitle>Couldn&apos;t load teams</AlertTitle>
            <AlertDescription><p>{errorMessage(teams.error)}</p></AlertDescription>
          </Alert>
        )
        : shown.length === 0 ? <div className="py-10 text-center text-[13px] text-text-dim">No teams yet.</div>
        : (
          // Three a row at most, so the full column makes each card wider rather than adding a fourth:
          // the room goes to each person's names and IDs.
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {shown.map(t => <TeamCard key={t.id} team={t} conf={conf} />)}
          </div>
        )}
    </div>
  );
}
