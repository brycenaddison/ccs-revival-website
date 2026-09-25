import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ACTION_SM, ACTION_SM_PRIMARY, ErrorLine } from "../admin/adminUi";
import { RiotAccountCard, RiotAccountCards } from "../profile/RiotAccountCards";
import { discordAvatarUrl } from "../apply/applyUi";
import { useDebounced } from "../../hooks/useDebounced";
import { queries } from "../../lib/queries";
import {
  ApiError, errorMessage, PROFILE_SEARCH_MIN, RIOT_GAME_NAME_MAX, RIOT_TAG_LINE_MAX,
  type PlayerSummary, type ProfileSearchResult, type RiotAccountInput,
  type RosterRiotAcceptance, type RosterDiscordAcceptance, type LinkedAccount,
} from "../../lib/api";
import { splitRiotId } from "../../lib/riotId";
import { PlayerIdentity, PlayerResultRow } from "./PlayerIdentity";
import { PlayerSearchPanel, PlayerResultGroup, SearchStatus } from "./PlayerSearchPanel";
import {
  pickerContext, type PlayerPickerMode, type PlayerPickerOptions, type PickerQueryOptions,
  type RiotPlayerSource, type DiscordPlayerSource,
} from "./pickerTypes";

interface Callbacks extends PlayerPickerOptions {
  onPick: (player: PlayerSummary) => void;
  onCancel: () => void;
}
export type PlayerPickerProps = PlayerPickerMode & Callbacks;

/** A context change unmounts pending previews and resolutions before another result can be applied. */
export function PlayerPicker(props: PlayerPickerProps) {
  const key = pickerContext(props);
  if (props.mode === "riot") return <RiotPicker key={key} {...props} />;
  if (props.mode === "discord") return <DiscordPicker key={key} {...props} />;
  return <ProfilePicker key={key} {...props} />;
}

function useAcceptance<T>(accept: (input: T) => Promise<PlayerSummary>, onPick: Callbacks["onPick"]) {
  const active = useRef(true);
  const locked = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  const mutation = useMutation({
    mutationFn: accept,
    retry: false,
    onSuccess: player => { if (active.current) onPick(player); },
    onSettled: () => { locked.current = false; },
  });
  return {
    ...mutation,
    submit: (input: T) => {
      if (locked.current) return;
      locked.current = true;
      mutation.mutate(input);
    },
  };
}

function ProfileResults({ term, query, options, onPick, placed, placedText = "already selected", mode = "profile" }: {
  term: string;
  query: string;
  options: PickerQueryOptions<ProfileSearchResult[]>;
  mode?: "profile" | "riot";
} & Omit<Callbacks, "onCancel">) {
  const result = useQuery(options);
  const current = term.trim() === query && !result.isPlaceholderData;
  const enough = term.trim().length >= PROFILE_SEARCH_MIN;
  return (
    <>
      {!enough && term.trim() && <SearchStatus>Keep typing — {PROFILE_SEARCH_MIN} characters minimum.</SearchStatus>}
      {enough && (!current || result.isFetching) && <SearchStatus>Searching…</SearchStatus>}
      {current && <ErrorLine message={result.error ? errorMessage(result.error) : null} />}
      {enough && current && !result.error && !result.isFetching && result.data && (
        result.data.length ? (
          <PlayerResultGroup>
            {result.data.map(hit => (
              <li key={hit.profileId}>
                <PlayerResultRow player={hit} detail={profileDetail(hit, mode)}
                  annotation={placed?.has(hit.profileId) ? placedText : undefined} onSelect={() => onPick(hit)} />
              </li>
            ))}
          </PlayerResultGroup>
        ) : <SearchStatus>No profile matches that.</SearchStatus>
      )}
    </>
  );
}

function profileDetail(hit: ProfileSearchResult, mode: "profile" | "riot"): string {
  const primary = mode === "riot" ? hit.primaryRiotId : null;
  const matches = hit.matchedRiotIds.filter(id => id.toLowerCase() !== primary?.toLowerCase());
  return [
    primary ? `Primary Riot ID: ${primary}` : null,
    matches.length ? `Matched: ${matches.join(", ")}` : null,
    hit.handle ? `@${hit.handle}` : null,
    mode === "profile" ? `Profile ${hit.profileId}` : null,
  ].filter(Boolean).join(" · ");
}

function ProfilePicker(props: Callbacks) {
  const [term, setTerm] = useState("");
  const query = useDebounced(term, 300).trim();
  return (
    <PlayerSearchPanel label="Website name, Discord handle or profile ID" term={term} onTerm={setTerm} onCancel={props.onCancel}>
      <ProfileResults {...props} term={term} query={query} options={queries.profileSearch(query)} />
    </PlayerSearchPanel>
  );
}

type RiotTarget = { kind: "profile"; player: PlayerSummary } | { kind: "account"; input: RiotAccountInput };

function RiotPicker({ source, ...props }: Callbacks & { source: RiotPlayerSource }) {
  const [term, setTerm] = useState("");
  const [target, setTarget] = useState<RiotTarget | null>(null);
  const query = useDebounced(term, 300).trim();
  const input = splitRiotId(term.trim());
  const hash = term.trim().indexOf("#");
  const complete = hash > 0 && hash === term.trim().lastIndexOf("#") &&
    input.gameName.length > 0 && input.gameName.length <= RIOT_GAME_NAME_MAX &&
    input.tagLine.length > 0 && input.tagLine.length <= RIOT_TAG_LINE_MAX;

  if (!source.enabled) return <ErrorLine message="Player selection is unavailable for this session." />;
  if (target) {
    const previewProps = { source, onPick: props.onPick, onBack: () => setTarget(null) };
    return target.kind === "profile"
      ? <ExistingRiotPreview {...previewProps} player={target.player} />
      : <ExactRiotPreview {...previewProps} input={target.input} />;
  }
  return (
    <PlayerSearchPanel label="Website name or Riot ID" term={term} onTerm={setTerm} onCancel={props.onCancel}>
      <ProfileResults {...props} term={term} query={query} options={source.searchOptions(query)} mode="riot"
        onPick={player => setTarget({ kind: "profile", player })} />
      {complete && (
        <button type="button" className={`${ACTION_SM_PRIMARY} mt-3`}
          onClick={() => setTarget({ kind: "account", input })}>Look up Riot account</button>
      )}
      {term.includes("#") && !complete && (
        <SearchStatus>Enter GameName#TAG (up to {RIOT_GAME_NAME_MAX} name and {RIOT_TAG_LINE_MAX} tag characters).</SearchStatus>
      )}
    </PlayerSearchPanel>
  );
}

interface PreviewCallbacks {
  source: RiotPlayerSource;
  onPick: Callbacks["onPick"];
  onBack: () => void;
}

function ExistingRiotPreview({ player, ...props }: PreviewCallbacks & { player: PlayerSummary }) {
  const result = useQuery({
    ...queries.profileAccounts(player.profileId), retry: false, staleTime: 0,
    refetchOnWindowFocus: false, refetchOnReconnect: false,
  });
  const accounts = result.data?.accounts ?? [];
  const error = result.error ? errorMessage(result.error)
    : !result.isFetching && !accounts.length ? "This profile has no verified Riot accounts available." : null;
  return <RiotPreview {...props} player={player} accounts={accounts} exact={false}
    loading={result.isFetching} error={error} onRetry={() => { void result.refetch(); }}
    acceptance={{ profileId: player.profileId }} />;
}

function ExactRiotPreview({ input, ...props }: PreviewCallbacks & { input: RiotAccountInput }) {
  const result = useQuery(props.source.previewOptions(input));
  const preview = result.data;
  return <RiotPreview {...props} player={preview?.profile ?? null} accounts={preview ? [preview.account] : []} exact
    loading={result.isFetching} error={result.error ? errorMessage(result.error) : null}
    onRetry={() => { void result.refetch(); }} acceptance={preview ? {
      ...input, expectedPuuid: preview.account.puuid, expectedProfileId: preview.profile?.profileId ?? null,
    } : null} />;
}

function RiotPreview({ source, onPick, onBack, player, accounts, exact, loading, error, acceptance, onRetry }: PreviewCallbacks & {
  player: PlayerSummary | null;
  accounts: LinkedAccount[];
  exact: boolean;
  loading: boolean;
  error: string | null;
  acceptance: RosterRiotAcceptance | null;
  onRetry: () => void;
}) {
  const resolve = useAcceptance(source.accept, onPick);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => { panel.current?.focus(); }, []);
  const failed = error !== null || resolve.isError;
  return (
    <div ref={panel} tabIndex={-1} aria-label="Player preview" className="min-w-0 space-y-3 rounded-md border border-border bg-bg3 p-3" aria-busy={loading || resolve.isPending}
      onKeyDown={event => {
        if (event.key === "Escape" && !resolve.isPending) { event.stopPropagation(); onBack(); }
      }}>
      <p className="text-sm font-semibold text-text-bright">Player preview</p>
      {loading ? <SearchStatus>Loading Riot account details…</SearchStatus> : !error && (
        <>
          {player ? <PlayerIdentity player={player} /> : <p className="text-sm text-text-secondary">New website profile</p>}
          {exact && accounts[0] ? <RiotAccountCard account={accounts[0]} /> : <RiotAccountCards accounts={accounts} />}
        </>
      )}
      <ErrorLine message={error} />
      <ErrorLine message={resolve.error ? errorMessage(resolve.error) : null} />
      <div className="flex flex-wrap gap-2">
        {failed ? (
          <button type="button" className={ACTION_SM_PRIMARY} disabled={loading || resolve.isPending}
            onClick={() => { resolve.reset(); onRetry(); }}>Retry preview</button>
        ) : (
          <button type="button" className={ACTION_SM_PRIMARY}
            disabled={loading || resolve.isPending || !acceptance || !accounts.length}
            onClick={() => { if (acceptance) resolve.submit(acceptance); }}>
            {resolve.isPending ? "Selecting…" : "Use this player"}
          </button>
        )}
        <button type="button" className={ACTION_SM} disabled={resolve.isPending} onClick={onBack}>Back</button>
      </div>
      {resolve.isPending && <SearchStatus>Selecting player…</SearchStatus>}
    </div>
  );
}

function DiscordPicker({ source, ...props }: Callbacks & { source: DiscordPlayerSource }) {
  const [term, setTerm] = useState("");
  const [exactLookup, setExactLookup] = useState<string | null>(null);
  const query = useDebounced(term, 300).trim();
  const isSnowflake = /^\d{17,20}$/.test(term.trim());
  const requested = isSnowflake ? exactLookup === term.trim() : true;
  const searchTerm = isSnowflake ? exactLookup ?? "" : query;
  const options = source.searchOptions(requested ? searchTerm : "");
  const result = useQuery({ ...options, enabled: source.enabled && options.enabled });
  const resolve = useAcceptance<RosterDiscordAcceptance>(source.accept, props.onPick);
  const current = requested && term.trim() === searchTerm && searchTerm.length >= PROFILE_SEARCH_MIN;
  const denied = resolve.error instanceof ApiError && [401, 403].includes(resolve.error.status);
  // On any request error, even a background 401/403, do not display cached private hits.
  const data = current && !denied && !result.error && !result.isFetching && !result.isPlaceholderData
    ? result.data : undefined;
  const annotation = (id: number | null) => id !== null && props.placed?.has(id) ? props.placedText ?? "already selected" : undefined;

  if (!source.enabled) return <ErrorLine message="Player selection is unavailable for this session." />;
  return (
    <PlayerSearchPanel label="Website name, Discord name or user ID" term={term} busy={resolve.isPending}
      onTerm={next => { setTerm(next); setExactLookup(null); resolve.reset(); }} onCancel={props.onCancel}>
      {isSnowflake && <button type="button" className={`${ACTION_SM} mt-2`} disabled={resolve.isPending || result.isFetching}
        onClick={() => { setExactLookup(term.trim()); if (requested && current) void result.refetch(); }}>Look up Discord user ID</button>}
      {term.trim() && term.trim().length < PROFILE_SEARCH_MIN && <SearchStatus>Keep typing — {PROFILE_SEARCH_MIN} characters minimum.</SearchStatus>}
      {requested && searchTerm.length >= PROFILE_SEARCH_MIN && (!current || result.isFetching) && <SearchStatus>Searching…</SearchStatus>}
      {current && <ErrorLine message={result.error ? errorMessage(result.error) : null} />}
      {data && (
        <>
          <PlayerResultGroup label="Website profiles">
            {data.profiles.status === "unavailable" ? <li className="px-3 pb-3"><ErrorLine message={data.profiles.error} /></li>
              : data.profiles.results.length === 0 ? <li className="p-3 text-xs text-text-dim">No website profiles match that.</li>
              : data.profiles.results.map(hit => (
                <li key={hit.profileId}><PlayerResultRow player={hit}
                  detail={[hit.handle ? `@${hit.handle}` : null, `Profile ${hit.profileId}`, `Discord ${hit.discordUserId}`].filter(Boolean).join(" · ")}
                  annotation={annotation(hit.profileId)} disabled={resolve.isPending}
                  onSelect={() => resolve.submit({ profileId: hit.profileId })} /></li>
              ))}
          </PlayerResultGroup>
          <PlayerResultGroup label="Discord server">
            {data.guild.status === "unavailable" ? <li className="px-3 pb-3"><ErrorLine message={data.guild.error} /></li>
              : data.guild.results.length === 0 ? <li className="p-3 text-xs text-text-dim">No Discord members match that.</li>
              : data.guild.results.map(hit => (
                <li key={hit.userId}><PlayerResultRow player={hit.profile ?? { profileId: hit.profileId, name: hit.displayName,
                  avatar: discordAvatarUrl(hit.userId, hit.avatar), verified: hit.verified }}
                  detail={[hit.username ? `@${hit.username}` : null, `Discord ${hit.userId}`].filter(Boolean).join(" · ")}
                  annotation={annotation(hit.profileId)} disabled={resolve.isPending}
                  onSelect={() => resolve.submit({ discordUserId: hit.userId })} /></li>
              ))}
          </PlayerResultGroup>
        </>
      )}
      {resolve.isPending && <SearchStatus>Selecting player…</SearchStatus>}
      <ErrorLine message={resolve.error ? errorMessage(resolve.error) : null} />
    </PlayerSearchPanel>
  );
}
