import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, type To } from "react-router-dom";
import { ArrowUpRight, LoaderCircle, Moon, Shield, type LucideIcon } from "lucide-react";
import { CONTENT_ROLE, errorMessage, PROFILE_SEARCH_MAX, PROFILE_SEARCH_MIN } from "../../lib/api";
import { useAuth } from "../../lib/authContext";
import { useAdminAccess } from "../../lib/adminAccess";
import { useLeague, useSeasonLink } from "../../lib/leagueContext";
import { queries } from "../../lib/queries";
import { TABS, visibleTabs } from "../../lib/tabs";
import { toggleTheme } from "../../lib/theme";
import { useDebounced } from "../../hooks/useDebounced";
import { useHasInvitations } from "../../hooks/useInvitations";
import { useHasLiveApplication } from "../../hooks/useMyApplications";
import { accountMenuEntries } from "../auth/UserMenu";
import { TeamLink } from "../league/TeamLink";
import { PlayerIdentity } from "../players/PlayerIdentity";
import { PlayerLink } from "../profile/PlayerLink";
import { TeamLogo } from "../profile/profileUi";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "../ui/command";
import { CommandLinkItem } from "./CommandLinkItem";

const SHORTCUT_GROUPS = ["Pages", "Your Pages", "Admin"] as const;

interface Shortcut {
  group: typeof SHORTCUT_GROUPS[number];
  label: string;
  to: To;
  icon?: LucideIcon;
}

/** Longer labels for discovery, scoped to the command menu. */
const SHORTCUT_LABELS: Partial<Record<string, string>> = {
  "/info": "League Info",
  "/content": "Content Management",
};

/** Page destinations and access rules come from the same registries as the navigation. */
function useShortcuts(): Shortcut[] {
  const auth = useAuth();
  const { isSiteAdmin, leagues } = useAdminAccess();
  const { selectedConfs, activeConfs } = useLeague();
  const seasonLink = useSeasonLink();
  const hasApplication = useHasLiveApplication();
  const hasInvitations = useHasInvitations();
  const account = accountMenuEntries({
    ...auth,
    profileId: auth.profile?.id ?? null,
    hasApplication,
    hasInvitations,
    isSiteAdmin,
    canEditContent: isSiteAdmin || auth.hasRole(CONTENT_ROLE),
  });

  return [
    ...visibleTabs(TABS, selectedConfs, activeConfs).map(tab => ({
      group: "Pages" as const,
      label: SHORTCUT_LABELS[tab.path] ?? tab.label, icon: tab.icon, to: seasonLink(tab.path),
    })),
    ...(auth.isAuthenticated ? account.flatMap(entry =>
      entry.kind === "item" && entry.to && !entry.disabled
        ? [{
          group: entry.to === "/content" || entry.to === "/admin" ? "Admin" as const : "Your Pages" as const,
          label: SHORTCUT_LABELS[entry.to] ?? entry.label, to: entry.to, icon: entry.icon,
        }] : [],
    ) : []),
    ...(leagues[0] ? [{ group: "Admin" as const, label: "League Admin", to: `/league/${encodeURIComponent(leagues[0].conf)}/admin`, icon: Shield }] : []),
  ];
}

function matches(text: string, search: string): boolean {
  const normalized = text.normalize("NFKC").toLocaleLowerCase();
  return search.normalize("NFKC").toLocaleLowerCase().split(/\s+/).every(word => normalized.includes(word));
}

function SearchError({ label, error, retry }: { label: string; error: unknown; retry: () => void }) {
  return (
    <div role="alert" className="mx-3 my-3 rounded-md border border-border px-3 py-2 text-sm">
      <p className="font-medium text-text-bright">{label}</p>
      <p className="mt-1 break-words text-text-secondary">{errorMessage(error)}</p>
      <CommandItem value={`retry:${label}`} onSelect={retry} className="mt-2 text-brand" aria-label={`Retry: ${label}`}>Try again</CommandItem>
    </div>
  );
}

export default function SearchResults({ onNavigate }: { onNavigate: () => void }) {
  const [input, setInput] = useState("");
  const [composing, setComposing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const term = input.trim();
  const settled = useDebounced(term);
  const eligible = term.length >= PROFILE_SEARCH_MIN;
  const ready = eligible && settled === term && !composing;
  const { tournaments } = useLeague();
  const shortcuts = useShortcuts().filter(shortcut => matches(`${shortcut.group} ${shortcut.label}`, term));
  const shortcutGroups = SHORTCUT_GROUPS.map(heading => ({
    heading, items: shortcuts.filter(shortcut => shortcut.group === heading),
  })).filter(group => group.items.length > 0);
  const showThemeCommand = matches("Toggle Dark Mode theme appearance light", term);

  // This component mounts only inside an open dialog, possibly after its lazy chunk arrives.
  useEffect(() => inputRef.current?.focus({ preventScroll: true }), []);

  const teams = useQuery({ ...queries.publicTeams(), enabled: eligible && !composing });
  const profiles = useQuery({ ...queries.publicPlayerSearch(settled), enabled: ready });
  const riotProfiles = useQuery({ ...queries.publicPlayerSearch(settled, "riot"), enabled: ready });
  const leagueNames = useMemo(() => new Map(tournaments.map(t => [t.conf, t.name])), [tournaments]);

  // The API has no team-search endpoint. Its all-conference list already covers past seasons;
  // filter its names/codes locally without fetching each season separately.
  const matchingTeams = useMemo(() => !eligible ? [] : (teams.data ?? []).filter(team =>
    team.conf && team.code && matches(`${team.name} ${team.code} ${leagueNames.get(team.conf) ?? ""}`, term),
  ), [eligible, teams.data, leagueNames, term]);

  // The unfiltered identity mode finds website names/handles, including former players without a
  // current verified account. Riot mode adds cached IDs. Preserve served order and join by identity.
  const players = useMemo(() => {
    if (!ready) return [];
    const byId = new Map((profiles.data ?? []).map(player => [player.profileId, player]));
    for (const player of riotProfiles.data ?? []) byId.set(player.profileId, player);
    return [...byId.values()];
  }, [ready, profiles.data, riotProfiles.data]);

  const waiting = eligible && (!ready || teams.isPending || profiles.isPending || riotProfiles.isPending);
  const playerLimit = ready && ((profiles.data?.length ?? 0) >= PROFILE_SEARCH_MAX || (riotProfiles.data?.length ?? 0) >= PROFILE_SEARCH_MAX);
  const teamLimit = 25;
  const hasError = eligible && (teams.isError || (ready && (profiles.isError || riotProfiles.isError)));

  return (
    <Command label="Search players, teams, pages, and commands" shouldFilter={false} loop vimBindings={false}>
      <CommandInput
        ref={inputRef}
        value={input}
        onValueChange={setInput}
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={() => setComposing(false)}
        placeholder="Player, Riot ID, team, page, or command…"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={100}
      />
      <CommandList label="Search results" aria-busy={waiting}>
        {!eligible && (
          <p className="px-3 pt-3 pb-1 text-xs text-text-secondary">Type at least two characters to find players and teams.</p>
        )}
        {waiting && (
          <p role="status" className="flex items-center gap-2 px-3 py-3 text-sm text-text-secondary">
            <LoaderCircle size={15} className="motion-safe:animate-spin" aria-hidden="true" /> Searching…
          </p>
        )}
        {eligible && teams.isError && <SearchError label="Team search is unavailable" error={teams.error} retry={() => void teams.refetch()} />}
        {ready && profiles.isError && <SearchError label="Player name search is unavailable" error={profiles.error} retry={() => void profiles.refetch()} />}
        {ready && riotProfiles.isError && <SearchError label="Riot ID search is unavailable" error={riotProfiles.error} retry={() => void riotProfiles.refetch()} />}
        {shortcutGroups.map(group => (
          <CommandGroup key={group.heading} heading={group.heading}>
            {group.items.map(shortcut => (
              <CommandLinkItem key={shortcut.label} value={`page:${shortcut.label}`} onNavigate={onNavigate}>
                <Link to={shortcut.to}>
                  {shortcut.icon && <shortcut.icon size={18} className="shrink-0 text-text-secondary" aria-hidden="true" />}
                  <span className="min-w-0 flex-1 truncate">{shortcut.label}</span>
                  <ArrowUpRight size={14} className="shrink-0 text-text-secondary" aria-hidden="true" />
                </Link>
              </CommandLinkItem>
            ))}
          </CommandGroup>
        ))}
        {showThemeCommand && (
          <CommandGroup heading="Appearance">
            <CommandItem value="action:toggle-theme" onSelect={() => { toggleTheme(); onNavigate(); }}>
              <Moon size={18} className="shrink-0 text-text-secondary" aria-hidden="true" />
              <span>Toggle Dark Mode</span>
            </CommandItem>
          </CommandGroup>
        )}
        {matchingTeams.length > 0 && (
          <CommandGroup heading="Teams · All seasons">
            {matchingTeams.slice(0, teamLimit).map(team => (
              <CommandLinkItem key={`${team.conf}:${team.code}`} value={`team:${team.conf}:${team.code}`} onNavigate={onNavigate}>
                <TeamLink conf={team.conf!} code={team.code}>
                  <TeamLogo team={team} code={team.code} size={30} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{team.name || team.code}</span>
                    <span className="block truncate text-xs text-text-secondary">{team.code} · {leagueNames.get(team.conf!) ?? "CCS league"}</span>
                  </span>
                </TeamLink>
              </CommandLinkItem>
            ))}
            {matchingTeams.length > teamLimit && <p className="px-3 py-2 text-xs text-text-secondary">Showing {teamLimit} of {matchingTeams.length} teams. Add a team name or season to narrow the search.</p>}
          </CommandGroup>
        )}
        {players.length > 0 && (
          <CommandGroup heading="Players · All seasons">
            {players.map(player => {
              const aliases = player.matchedRiotIds.filter(id => id !== player.primaryRiotId);
              return (
                <CommandLinkItem key={player.profileId} value={`player:${player.profileId}`} onNavigate={onNavigate}>
                  <PlayerLink profileId={player.profileId}>
                    <span className="min-w-0 flex-1">
                      <PlayerIdentity player={player} linked={false} />
                      {(player.primaryRiotId || player.handle) && <span className="mt-0.5 block truncate text-xs text-text-secondary">{player.primaryRiotId ?? `@${player.handle}`}</span>}
                      {aliases.length > 0 && <span className="mt-0.5 block truncate text-xs text-text-secondary">Matched: {aliases.join(", ")}</span>}
                    </span>
                  </PlayerLink>
                </CommandLinkItem>
              );
            })}
          </CommandGroup>
        )}
        {playerLimit && <p className="px-3 py-2 text-xs text-text-secondary">More players may match. Keep typing to narrow the search.</p>}
        {!waiting && !hasError && <CommandEmpty>{eligible ? "No results found. Try another name, team code, or Riot ID." : "No matching pages or commands. Type at least two characters to search players and teams."}</CommandEmpty>}
      </CommandList>
    </Command>
  );
}
