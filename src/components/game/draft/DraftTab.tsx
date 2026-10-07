/**
 * The Draft tab: the game's stored Drafter draft, the two sides side by side.
 *
 * Sides are the **draft's** blue and red, which need not be the lobby sides, so each column is named
 * by its team and "Blue draft"/"Red draft", never by map side. Each side's bans sit together as
 * icons; its picks follow in pick order as centered splash tiles, the art the scoreboard uses. The
 * game number and patch are already in the page header. The match page's draft card has the
 * interleaved, chronological order.
 *
 * Each pick shows the role confirmed in the draft room beside the role Riot recorded. A mismatch is
 * highlighted because it usually means a role swap after the draft.
 */

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import {
  normalizeRole,
  roleLabel,
  SITE_ADMIN_ROLE,
  type GameDraft,
  type GameDraftLockout,
  type GameDraftPick,
  type GameDraftSide,
} from "../../../lib/api";
import { NO_BAN_CHAMPION, type ChampionLookup } from "../../../lib/championData";
import { useAuth } from "../../../lib/authContext";
import { cn } from "../../../lib/cn";
import { draftCorrectionPath } from "../../admin/drafts/draftCorrectionLink";
import { accentHex } from "../../../lib/teamStyle";
import { ChampionIcon } from "../../ChampionIcon";
import { TeamBadge } from "../../TeamBadge";
import { TeamLink } from "../../league/TeamLink";
import { PlayerLink } from "../../profile/PlayerLink";
import { BlindTag, FirstPickTag } from "../../drafts/DraftMarks";
import { DRAFT_MODE_LABEL, DRAFT_ROLE_LABEL, lockoutLabel } from "../../drafts/draftLabels";
import { ChampionSplashArt } from "../ChampionSplashArt";
import { useGameView } from "../GameView";

export default function DraftTab() {
  const { draft, lookups } = useGameView();
  const { isAuthenticated, hasRole } = useAuth();
  // The correction editor is site admin only upstream, so nobody else is offered it.
  const canCorrect = isAuthenticated && hasRole(SITE_ADMIN_ROLE);
  if (draft === undefined) return <Note>Loading draft…</Note>;
  if (draft === null) return <Note>This game has no draft.</Note>;

  return (
    <div className="flex flex-col gap-4">
      {(draft.mode || draft.url || canCorrect) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-heading text-[11px] text-text-muted">
          {draft.mode && <span>{DRAFT_MODE_LABEL[draft.mode].label} draft</span>}
          <span className="ml-auto flex items-center gap-3">
            {canCorrect && (
              <Link
                to={draftCorrectionPath({ drafterSeriesId: draft.drafterSeriesId, game: draft.game })}
                className="text-brand hover:underline"
              >
                Correct draft
              </Link>
            )}
            {draft.url && (
              <a href={draft.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline">
                View draft room
                <ExternalLink size={12} aria-hidden="true" />
              </a>
            )}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {draft.sides.map(side => (
          <SideColumn key={side.side} side={side} draft={draft} champions={lookups.champions} />
        ))}
      </div>
      <Lockouts entries={draft.unavailable} champions={lookups.champions} />
    </div>
  );
}

function SideColumn({ side, draft, champions }: { side: GameDraftSide; draft: GameDraft; champions: ChampionLookup | null }) {
  const team = side.team;
  return (
    <section
      aria-label={side.side === "blue" ? "Blue draft" : "Red draft"}
      className={cn(
        "min-w-0 overflow-hidden rounded-lg border border-border bg-bg2 border-t-2",
        side.side === "blue" ? "border-t-side-blue" : "border-t-side-red",
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-border bg-bg3 px-4 py-3">
        {team && (
          <TeamLink teamId={team.id} className="group flex min-w-0 items-center gap-2 no-underline">
            <TeamBadge
              team={{ name: team.name, color_primary: team.colorHex, color_accent: accentHex(team), logo_url: team.logo }}
              size={24}
            />
            <span className="truncate font-heading text-sm font-semibold text-text-bright group-hover:text-brand group-hover:underline">
              {team.name}
            </span>
          </TeamLink>
        )}
        <span className={cn("font-heading text-[11px]", side.side === "blue" ? "text-side-blue" : "text-side-red")}>
          {side.side === "blue" ? "Blue draft" : "Red draft"}
        </span>
        {/* Without first selection blue always picks first, so the chip would only restate the side. */}
        <FirstPickTag shown={side.firstPick && draft.firstSelection === true} />
      </div>

      {side.bans.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
          <span className="font-heading text-[10px] text-text-muted">Bans</span>
          <ul className="flex flex-wrap items-center gap-1.5">
            {side.bans.map(ban => (
              <li key={ban.turn}>
                <ChampionIcon
                  // A skipped ban keeps its slot; draw it with Riot's no-ban artwork.
                  champion={ban.championId ?? NO_BAN_CHAMPION.key}
                  src={ban.icon}
                  name={ban.championId === null ? "Skipped ban" : ban.champion}
                  lookup={champions}
                  size={26}
                  tile
                  className="flex opacity-70"
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="flex flex-col divide-y divide-border">
        {side.picks.map(pick => <PickRow key={pick.turn} pick={pick} champions={champions} />)}
      </ul>
    </section>
  );
}

/** Uncropped splash width in px, with the scoreboard cell's right-side crop. */
const SPLASH_CROP_RIGHT = 0.25;
const SPLASH_WIDTH = 120;

function PickRow({ pick, champions }: { pick: GameDraftPick; champions: ChampionLookup | null }) {
  const name = pick.champion ?? champions?.get(pick.championId)?.name ?? "Unknown champion";
  return (
    <li className="flex h-16 min-w-0 items-stretch">
      <ChampionSplashArt
        championId={pick.championId}
        cropRight={SPLASH_CROP_RIGHT}
        position="center 25%"
        className="h-full shrink-0 border-r border-border"
        style={{ width: Math.round(SPLASH_WIDTH * (1 - SPLASH_CROP_RIGHT)) }}
      />
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-3">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-heading text-sm text-text-bright">{name}</span>
          <BlindTag blind={pick.blind} />
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-[11px] text-text-muted">
          {pick.name && (
            <PlayerLink profileId={pick.profileId} className="min-w-0 truncate text-text no-underline hover:text-brand">
              {pick.name}
            </PlayerLink>
          )}
          <Roles pick={pick} />
        </span>
      </div>
    </li>
  );
}

/** The drafted role, and the played one only when it differs. */
function Roles({ pick }: { pick: GameDraftPick }) {
  const assigned = pick.assignedRole;
  const played = pick.playedRole;
  if (assigned === null && played === null) return null;
  if (assigned === null) return <span>{roleLabel(played)}</span>;
  if (played === null || normalizeRole(assigned) === played) return <span>{DRAFT_ROLE_LABEL[assigned]}</span>;
  return (
    <span className="text-ccs-orange">
      Drafted {DRAFT_ROLE_LABEL[assigned]}, played {roleLabel(played)}
    </span>
  );
}

/** Champions neither side could pick, grouped by why. Usually empty for game 1 of a normal series. */
function Lockouts({ entries, champions }: { entries: readonly GameDraftLockout[]; champions: ChampionLookup | null }) {
  if (entries.length === 0) return null;
  const groups = new Map<string, GameDraftLockout[]>();
  for (const entry of entries) {
    const label = lockoutLabel(entry.reason, entry.game);
    groups.set(label, [...(groups.get(label) ?? []), entry]);
  }

  return (
    <details className="rounded-lg border border-border bg-bg2 px-4 py-3">
      <summary className="cursor-pointer font-heading text-sm text-text-bright">
        Locked out <span className="text-text-dim">({entries.length})</span>
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        {[...groups].map(([label, group]) => (
          <div key={label}>
            <h4 className="mb-1.5 font-heading text-[11px] text-text-muted">{label}</h4>
            <ul className="flex flex-wrap gap-1.5">
              {group.map(entry => (
                <li key={entry.championId}>
                  <ChampionIcon champion={entry.championId} src={entry.icon} name={entry.champion} lookup={champions} size={24} tile className="flex" />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <div className="py-10 text-center font-heading text-sm text-text-muted">{children}</div>;
}
