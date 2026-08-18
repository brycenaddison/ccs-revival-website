/**
 * Public, cross-season player page — `/players/:profileId`.
 *
 * One request answers the whole page. Everything below is composition plus two indexes built from
 * that single payload:
 *
 * - `teamIndex` — `career.teams` is by construction every `(conf, code)` the player has appeared
 *   under, so it resolves the *player's* team on any game or series row without a second call.
 *   Opponents need no index: every row carries its own `opponent` metadata.
 * - `gamesById` — `games[]` holds the player's whole career, which is what lets the personal-best
 *   cards name the player's own team and role and the match history nest games under their series.
 *   Both are map lookups over data already in hand, not re-aggregation.
 *
 * Layout is a rail plus a wide column, and the split is by *shape of question*, not by importance.
 * The rail answers "who is this player" — their accounts, roles, champions, rivals and teams — all
 * of which are lists that read fine narrow. The wide column answers "what have they done", which is
 * where the numbers and the game rows are, and those genuinely need the width.
 */

import { useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  errorMessage,
  type PlayerProfile as PlayerProfileData,
  type ProfileGame,
  type TeamRecord,
} from "../lib/api";
import { queries } from "../lib/queries";
import { PageShell } from "../components/layout/PageShell";
import { AccountsCard } from "../components/profile/AccountsCard";
import { CareerTiles } from "../components/profile/CareerTiles";
import { ChampionPoolCard } from "../components/profile/ChampionPoolCard";
import { MatchHistory } from "../components/profile/MatchHistory";
import { MatchupCard } from "../components/profile/MatchupCard";
import { PersonalBestCards } from "../components/profile/PersonalBestCards";
import { ProfileHeader } from "../components/profile/ProfileHeader";
import { RoleSplitCard } from "../components/profile/RoleSplitCard";
import { TeamHistoryCard } from "../components/profile/TeamHistoryCard";
import { ProfileSection, useConfLabel, type TeamIndex } from "../components/profile/profileUi";

export default function PlayerProfile() {
  const rawId = useParams().profileId;
  const profileId = rawId && /^\d+$/.test(rawId) && Number(rawId) > 0 ? Number(rawId) : null;
  const [search, setSearch] = useSearchParams();
  const conf = search.get("conf")?.trim() || null;
  const query = useQuery(queries.playerProfile(profileId, conf));

  // The league selector is the URL, so it survives a reload and a shared link. Replacing rather
  // than pushing keeps Back going where the reader came from instead of walking the selector.
  const onConfChange = (next: string) => {
    const params = new URLSearchParams(search);
    if (next) params.set("conf", next);
    else params.delete("conf");
    setSearch(params, { replace: true });
  };

  return (
    <PageShell maxWidth={1280}>
      {profileId === null ? (
        <Empty title="PLAYER NOT FOUND" body="That player link isn't valid." />
      ) : query.isPending ? (
        <div className="py-16 text-center text-text-subtle">Loading player profile…</div>
      ) : query.error ? (
        <Empty title="COULDN'T LOAD PLAYER" body={errorMessage(query.error)} />
      ) : !query.data ? (
        <Empty title="PLAYER NOT FOUND" body={`No player profile exists for #${profileId}.`} />
      ) : (
        <ProfileContent data={query.data} onConfChange={onConfChange} />
      )}
    </PageShell>
  );
}

function ProfileContent({
  data,
  onConfChange,
}: {
  data: PlayerProfileData;
  onConfChange: (conf: string) => void;
}) {
  const confLabel = useConfLabel();
  const { career, games, matches, accolades } = data;

  const teamIndex = useMemo<TeamIndex>(() => {
    const index = new Map<string, TeamRecord>();
    for (const row of career.teams) {
      // Team codes are unique only within a conference, which is the key upstream joins on too.
      if (row.team) index.set(`${row.conf}|${row.teamCode}`, row.team);
    }
    return (c, code) => (code ? index.get(`${c}|${code}`) ?? null : null);
  }, [career.teams]);

  const gamesById = useMemo(
    () => new Map<string, ProfileGame>(games.map(game => [game.matchId, game])),
    [games],
  );

  // Matching a Riot payload's participants back to this player, for the expandable build detail.
  const puuids = useMemo(() => new Set(data.accounts.map(a => a.puuid)), [data.accounts]);

  const played = (career.totals.games ?? 0) > 0;

  return (
    <div>
      <ProfileHeader
        profile={data.profile}
        accounts={data.accounts}
        accolades={accolades}
        totals={career.totals}
        conf={data.filter.conf}
        availableConferences={data.filter.availableConferences}
        onConfChange={onConfChange}
      />

      <div className="grid items-start gap-x-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div>
          <AccountsCard data={data} />
          {played && (
            <>
              <RoleSplitCard roles={career.roles} />
              <ChampionPoolCard champions={career.champions} />
              <MatchupCard matchups={career.laneMatchups} />
              <TeamHistoryCard teams={career.teams} />
            </>
          )}
        </div>

        <div className="mt-6 lg:mt-0">
          {!played ? (
            <div className="rounded-lg border border-border bg-bg2 px-5 py-12 text-center text-text-dim">
              No recorded games in{" "}
              {data.filter.conf ? confLabel(data.filter.conf).name : "this player's career"}.
            </div>
          ) : (
            <>
              <ProfileSection title="CAREER">
                <CareerTiles totals={career.totals} />
              </ProfileSection>

              <ProfileSection title="PERSONAL BESTS">
                <PersonalBestCards
                  personalBests={career.personalBests}
                  gamesById={gamesById}
                  teamIndex={teamIndex}
                />
              </ProfileSection>

              <ProfileSection title="MATCH HISTORY">
                <MatchHistory matches={matches} games={games} teamIndex={teamIndex} puuids={puuids} />
              </ProfileSection>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto mt-16 max-w-[520px] text-center">
      <h1 className="font-display text-[26px] tracking-widest text-text-bright">{title}</h1>
      <p className="mt-2 text-text-secondary">{body}</p>
    </div>
  );
}
