/**
 * Putting a person in a roster slot — one slot, or a list of them.
 *
 * The search is the site's public profile autocomplete, and it is **unfiltered by default here**,
 * which is the opposite of the accolade picker's default and deliberate. `?conf=` narrows to
 * profiles a *published* team in this conference already references, so with it on the one person a
 * roster editor is most often looking for — a new signing, who is on no team yet — cannot be found
 * at all. The checkbox is offered because narrowing is genuinely useful when a common first name
 * returns the whole site, but it starts off.
 *
 * A picked player is carried as `{profileId, name}` rather than an id, so a slot can render the
 * person it is holding without a second read. Only the id is ever sent: the name is the server's to
 * resolve, and a hydrated object going back would invite it to trust a stale one.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, UserPlus, X } from "lucide-react";
import { ACTION_SM, ACTION_SM_DANGER } from "../../admin/adminUi";
import { CONTROL_CLASS, LABEL_CLASS } from "../../stats/FilterBar";
import { useDebounced } from "../../../hooks/useDebounced";
import { queries } from "../../../lib/queries";
import { PROFILE_SEARCH_MIN } from "../../../lib/api";

/** A person in a slot: the key that is stored, and the label that makes it legible. */
export interface PickedPlayer {
  profileId: number;
  /** Riot ID, or `null` when Riot no longer resolves the account — still a valid slot. */
  name: string | null;
}

/** How a slot names whoever is in it, in descending order of how much it tells you. */
export function playerLabel(player: PickedPlayer): string {
  return player.name ?? `Profile ${player.profileId}`;
}

interface SearchProps {
  conf: string;
  /** Profile ids already placed on this team, so the list can mark them rather than hide them. */
  placed: ReadonlySet<number>;
  onPick: (player: PickedPlayer) => void;
  onCancel: () => void;
}

/**
 * The search itself, open until something is picked.
 *
 * Somebody already on the roster is **marked, not removed**: moving a substitute into the starting
 * five means picking a person the team already has, and a picker that hid them would look broken at
 * exactly that moment. The team form is what refuses a genuine double-placement.
 */
function PlayerSearch({ conf, placed, onPick, onCancel }: SearchProps) {
  const [term, setTerm] = useState("");
  const [thisLeagueOnly, setThisLeagueOnly] = useState(false);

  const query = useDebounced(term, 300).trim();
  const { data: results, isFetching } = useQuery(
    queries.profileSearch(query, thisLeagueOnly ? conf : null),
  );

  return (
    <div className="rounded-md border border-border bg-bg3 p-3">
      <div className="relative">
        <Search
          size={14}
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-dim"
        />
        <input
          value={term}
          onChange={e => setTerm(e.target.value)}
          placeholder="Search by name, Discord handle or profile id"
          aria-label="Search players"
          autoComplete="off"
          autoFocus
          className={`${CONTROL_CLASS} pl-8`}
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            checked={thisLeagueOnly}
            onChange={e => setThisLeagueOnly(e.target.checked)}
            className="h-4 w-4 cursor-pointer accent-brand"
          />
          Only players already on a team here
        </label>
        <button type="button" onClick={onCancel} className={ACTION_SM}>
          Cancel
        </button>
      </div>

      {term.trim().length > 0 && query.length < PROFILE_SEARCH_MIN && (
        <p className="mt-1.5 text-xs text-text-dim">
          Keep typing — {PROFILE_SEARCH_MIN} characters minimum.
        </p>
      )}
      {isFetching && <p className="mt-1.5 text-xs text-text-dim">Searching…</p>}

      {results && results.length > 0 && (
        <ul className="mt-2 max-h-56 overflow-y-auto rounded-md border border-border">
          {results.map(hit => (
            <li key={hit.profileId}>
              <button
                type="button"
                onClick={() => onPick({ profileId: hit.profileId, name: hit.name })}
                className="flex w-full cursor-pointer items-center gap-2.5 border-none bg-transparent px-3 py-1.5 text-left text-sm text-text hover:bg-bg-input"
              >
                {hit.avatar ? (
                  <img
                    src={hit.avatar}
                    alt=""
                    width={22}
                    height={22}
                    loading="lazy"
                    decoding="async"
                    className="h-[22px] w-[22px] shrink-0 rounded-full border border-border"
                  />
                ) : (
                  <span className="h-[22px] w-[22px] shrink-0 rounded-full border border-border bg-bg2" />
                )}
                <span className="min-w-0 flex-1 truncate">
                  {hit.name ?? `Profile ${hit.profileId}`}
                </span>
                {hit.handle && hit.handle !== hit.name && (
                  <span className="shrink-0 text-xs text-text-dim">@{hit.handle}</span>
                )}
                {placed.has(hit.profileId) && (
                  <span className="shrink-0 text-[10px] text-text-dim">
                    on this team
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {results && results.length === 0 && query.length >= PROFILE_SEARCH_MIN && !isFetching && (
        <p className="mt-1.5 text-xs text-text-dim">
          {thisLeagueOnly
            ? "Nobody on a published roster in this league matches that. Uncheck the box above to search everyone."
            : "No profile matches that. Anyone who has signed in or been picked up by a match ingest has a profile; nobody else does."}
        </p>
      )}
    </div>
  );
}

interface SlotProps {
  conf: string;
  label: string;
  value: PickedPlayer | null;
  placed: ReadonlySet<number>;
  onChange: (player: PickedPlayer | null) => void;
  /** Read-only when the viewer lacks the `roster` scope — the value still shows. */
  editable: boolean;
}

/** One position: who is in it, with Change and Clear, or the search when either is pressed. */
export function PlayerSlot({ conf, label, value, placed, onChange, editable }: SlotProps) {
  const [searching, setSearching] = useState(false);

  return (
    <div className="min-w-0">
      <span className={LABEL_CLASS}>{label}</span>
      {searching ? (
        <PlayerSearch
          conf={conf}
          placed={placed}
          onPick={player => {
            onChange(player);
            setSearching(false);
          }}
          onCancel={() => setSearching(false)}
        />
      ) : (
        <div className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-bg2 px-3 py-2">
          <span
            className={`min-w-0 flex-1 truncate text-sm ${
              value ? "text-text-bright" : "text-text-dim"
            }`}
          >
            {value ? playerLabel(value) : "Empty"}
          </span>
          {editable && (
            <>
              <button type="button" onClick={() => setSearching(true)} className={ACTION_SM}>
                {value ? "Change" : "Set"}
              </button>
              {value && (
                <button
                  type="button"
                  onClick={() => onChange(null)}
                  title={`Clear ${label}`}
                  className={ACTION_SM_DANGER}
                >
                  <X size={13} aria-hidden="true" />
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

interface ListProps {
  conf: string;
  label: string;
  values: readonly PickedPlayer[];
  placed: ReadonlySet<number>;
  onChange: (players: PickedPlayer[]) => void;
  editable: boolean;
  /** Omitted for contacts, which upstream does not cap. */
  max?: number;
  /** Shown under the list; the reason the cap exists, or what the list is for. */
  hint?: string;
}

/**
 * A list-shaped slot — the bench, and the contacts.
 *
 * Order is preserved as given rather than sorted: the bench is stored as an ordered array and the
 * substitute ordinals an application collected are exactly that order, so re-sorting here would
 * quietly renumber somebody's slot.
 */
export function PlayerList({
  conf,
  label,
  values,
  placed,
  onChange,
  editable,
  max,
  hint,
}: ListProps) {
  const [adding, setAdding] = useState(false);
  const full = max !== undefined && values.length >= max;

  return (
    <div className="min-w-0">
      <span className={LABEL_CLASS}>{label}</span>
      {values.length > 0 ? (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {values.map(player => (
            <li key={player.profileId}>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-text-bright">
                {playerLabel(player)}
                {editable && (
                  <button
                    type="button"
                    onClick={() =>
                      onChange(values.filter(p => p.profileId !== player.profileId))
                    }
                    title={`Remove ${playerLabel(player)}`}
                    className="cursor-pointer border-none bg-transparent p-0 text-text-dim hover:text-ccs-red"
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-2 text-sm text-text-dim">Nobody.</p>
      )}

      {editable &&
        (adding ? (
          <PlayerSearch
            conf={conf}
            placed={placed}
            onPick={player => {
              setAdding(false);
              // Adding somebody twice is a no-op rather than a duplicate row — the column is a set
              // in everything but type, and upstream deduplicates contacts anyway.
              if (values.some(p => p.profileId === player.profileId)) return;
              onChange([...values, player]);
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <button
            type="button"
            disabled={full}
            onClick={() => setAdding(true)}
            className={ACTION_SM}
          >
            <UserPlus size={13} aria-hidden="true" />
            Add
          </button>
        ))}

      {(hint || full) && (
        <p className="mt-1.5 text-xs text-text-dim">
          {full ? `That's the maximum of ${max}. Remove somebody to add another.` : hint}
        </p>
      )}
    </div>
  );
}
