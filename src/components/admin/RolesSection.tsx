/**
 * Granting league admin — the user directory (`GET /admin/users`) and the two write routes behind
 * it (`PUT`/`DELETE /admin/users/:profileId/leagues/:conf`).
 *
 * Search-then-select rather than a table of everyone: the directory is every profile that has ever
 * signed in with Discord, and the question this page answers is always about one person.
 *
 * Two things the API decides and this page only reports:
 *
 *  - **Site roles are not editable here.** `admin` is granted by hand-written SQL upstream, on
 *    purpose — this is the surface that hands out league grants, so a page that could also grant
 *    the role that outranks them would make the whole scope system decorative. They are shown
 *    because "why does this person already have access to everything" is otherwise unanswerable.
 *  - **Only profiles with a Discord account are listed**, since nobody can sign in as one without,
 *    and a grant on it could never be used.
 *
 * `PUT` is set semantics — the body is the complete list of scopes for that conf — which is why
 * each row keeps a draft of its checkboxes and saves all four at once. The response carries the
 * profile's whole grant list back, but the cache is invalidated instead of patched from it: the
 * search list shows grants too, and one of the two updating without the other is the bug.
 */

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus, Search, Trash2 } from "lucide-react";
import { CONTROL_CLASS, LABEL_CLASS } from "../stats/FilterBar";
import { Toast } from "../Toast";
import {
  ACTION,
  ACTION_SM,
  ACTION_SM_DANGER,
  ACTION_SM_PRIMARY,
  ErrorLine,
  Pill,
} from "./adminUi";
import { useDebounced } from "../../hooks/useDebounced";
import { useLeague } from "../../lib/leagueContext";
import { queries, queryRoots } from "../../lib/queries";
import {
  errorMessage,
  LEAGUE_ADMIN_SCOPE,
  LEAGUE_SCOPES,
  revokeLeague,
  setLeagueScopes,
  type DirectoryUser,
  type LeagueGrant,
  type LeagueScope,
} from "../../lib/api";

/** Small enough that the pager is rarely needed, large enough that a name search lands in one page. */
const PAGE_SIZE = 25;

export function RolesSection() {
  const [term, setTerm] = useState("");
  const q = useDebounced(term);
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // A new term re-pages from the start; leaving the offset would answer a two-hit search with an
  // empty page three.
  useEffect(() => setOffset(0), [q]);

  const page = useQuery(queries.adminUsers(q, PAGE_SIZE, offset));
  const selected = useQuery(queries.adminUser(selectedId));

  const rows = page.data?.users ?? [];
  const total = page.data?.total ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <label className={LABEL_CLASS} htmlFor="admin-user-search">
          Find someone
        </label>
        <div className="relative">
          <Search
            size={15}
            aria-hidden="true"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim pointer-events-none"
          />
          <input
            id="admin-user-search"
            value={term}
            onChange={e => setTerm(e.target.value)}
            placeholder="Name, Discord handle, or paste a Discord ID"
            className={`${CONTROL_CLASS} pl-9`}
          />
        </div>
        <p className="text-text-dim text-xs mt-1.5">
          Only profiles with a Discord account appear here — a grant on one without could never be
          used, because nobody can sign in as it.
        </p>
      </div>

      {page.isError ? (
        <ErrorLine message={`Couldn't load the directory: ${errorMessage(page.error)}`} />
      ) : rows.length === 0 ? (
        <p className="text-text-dim">{page.isPending ? "Searching…" : "Nobody matches that."}</p>
      ) : (
        <>
          <div className="bg-bg3 border border-border rounded-lg overflow-hidden">
            {rows.map(user => (
              <UserRow
                key={user.profileId}
                user={user}
                selected={user.profileId === selectedId}
                onSelect={() => setSelectedId(user.profileId === selectedId ? null : user.profileId)}
              />
            ))}
          </div>
          <Pager total={total} offset={offset} shown={rows.length} onOffset={setOffset} />
        </>
      )}

      {selectedId !== null && (
        <div className="border-t border-border pt-5">
          {selected.isPending ? (
            <p className="text-text-dim">Loading…</p>
          ) : selected.isError ? (
            <ErrorLine message={errorMessage(selected.error)} />
          ) : selected.data ? (
            <UserDetail user={selected.data} />
          ) : (
            <p className="text-text-dim">That profile no longer exists.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------- the list

function UserRow({
  user,
  selected,
  onSelect,
}: {
  user: DirectoryUser;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`w-full flex items-center gap-3 text-left px-3 py-2.5 border-b border-border last:border-b-0 cursor-pointer border-l-[3px] ${
        selected ? "bg-bg-input border-l-accent" : "bg-transparent border-l-transparent"
      }`}
    >
      {/* Never null upstream: with no hash it resolves to the Discord default for the snowflake. */}
      <img src={user.avatar} alt="" className="w-8 h-8 rounded-full shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-text-bright text-sm truncate">
          {user.name ?? `Profile ${user.profileId}`}
        </span>
        <span className="block text-text-dim text-xs truncate">
          {user.handle ? `@${user.handle}` : "handle not captured yet"} · #{user.profileId}
        </span>
      </span>
      <span className="flex flex-wrap justify-end gap-1 shrink-0 max-w-[45%]">
        {user.roles.map(role => (
          <Pill key={role}>{role}</Pill>
        ))}
        {confsOf(user.leagues).map(conf => (
          <Pill key={conf} muted>
            {conf}
          </Pill>
        ))}
      </span>
    </button>
  );
}

function Pager({
  total,
  offset,
  shown,
  onOffset,
}: {
  total: number;
  offset: number;
  shown: number;
  onOffset: (next: number) => void;
}) {
  if (total <= PAGE_SIZE) return null;

  return (
    <div className="flex items-center justify-between">
      <span className="text-text-dim text-xs">
        {offset + 1}–{offset + shown} of {total}
      </span>
      <span className="flex gap-2">
        <button
          type="button"
          disabled={offset === 0}
          onClick={() => onOffset(Math.max(0, offset - PAGE_SIZE))}
          className={ACTION}
        >
          <ChevronLeft size={15} aria-hidden="true" />
          Prev
        </button>
        <button
          type="button"
          disabled={offset + shown >= total}
          onClick={() => onOffset(offset + PAGE_SIZE)}
          className={ACTION}
        >
          Next
          <ChevronRight size={15} aria-hidden="true" />
        </button>
      </span>
    </div>
  );
}

// ----------------------------------------------------------------- the detail

/** The confs a grant list touches, in a stable order. One conf can hold several scopes. */
function confsOf(grants: LeagueGrant[]): string[] {
  return [...new Set(grants.map(g => g.conf))].sort();
}

/** Grants regrouped the way the editor shows them: one row per conf, carrying its scopes. */
function byConf(grants: LeagueGrant[]): { conf: string; name: string; scopes: LeagueScope[] }[] {
  const rows = new Map<string, { conf: string; name: string; scopes: LeagueScope[] }>();
  for (const g of grants) {
    const row = rows.get(g.conf) ?? { conf: g.conf, name: g.name, scopes: [] };
    if (!row.scopes.includes(g.scope)) row.scopes.push(g.scope);
    rows.set(g.conf, row);
  }
  return [...rows.values()].sort((a, b) => a.conf.localeCompare(b.conf));
}

function UserDetail({ user }: { user: DirectoryUser }) {
  const qc = useQueryClient();
  const { tournaments } = useLeague();
  const [notice, setNotice] = useState<string | null>(null);
  const [addConf, setAddConf] = useState("");

  const grants = useMemo(() => byConf(user.leagues), [user.leagues]);
  const held = useMemo(() => new Set(grants.map(g => g.conf)), [grants]);

  // Only a conf `GET /tournaments` knows can be granted: `requireConf` runs ahead of the write and
  // answers a plain-text 400 for anything else.
  const grantable = tournaments.filter(t => !held.has(t.conf));

  // Both the row in the list and this panel read grants, from two different queries. Awaited so the
  // row's controls stay disabled until the refetch lands, rather than re-enabling against the
  // pre-write state for a frame.
  const done = async (message: string) => {
    await qc.invalidateQueries({ queryKey: queryRoots.adminUsers });
    setNotice(message);
  };

  const save = useMutation({
    mutationFn: (v: { conf: string; scopes: LeagueScope[] }) =>
      setLeagueScopes(user.profileId, v.conf, v.scopes),
    onSuccess: (_grants, v) =>
      done(v.scopes.length === 0 ? `Revoked ${v.conf}.` : `Updated ${v.conf}.`),
  });

  const revoke = useMutation({
    mutationFn: (conf: string) => revokeLeague(user.profileId, conf),
    onSuccess: (_grants, conf) => done(`Revoked every ${conf} scope.`),
  });

  const busy = save.isPending || revoke.isPending;
  const failure = save.isError ? save.error : revoke.isError ? revoke.error : null;

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <img src={user.avatar} alt="" className="w-12 h-12 rounded-full shrink-0" />
        <div className="min-w-0">
          <h3 className="font-display text-lg text-text-bright tracking-wider truncate">
            {user.name ?? `Profile ${user.profileId}`}
          </h3>
          <p className="text-text-dim text-xs truncate">
            {user.handle ? `@${user.handle} · ` : ""}Discord {user.snowflake} · profile{" "}
            {user.profileId}
          </p>
          <p className="text-text-dim text-xs">
            {user.accounts} Riot {user.accounts === 1 ? "account" : "accounts"} linked ·{" "}
            {user.lastLogin ? `last signed in ${formatDate(user.lastLogin)}` : "never signed in"}
          </p>
        </div>
      </div>

      <div className="mb-6">
        <label className={LABEL_CLASS}>Site roles</label>
        <div className="flex flex-wrap gap-2">
          {user.roles.length === 0 ? (
            <span className="text-text-dim text-sm">None</span>
          ) : (
            user.roles.map(role => <Pill key={role}>{role}</Pill>)
          )}
        </div>
        <p className="text-text-dim text-xs mt-1.5">
          Not editable here. Site admin outranks every league grant, so it is granted by hand in the
          database rather than from the page that hands out those grants. It also implies admin in
          every league, whether or not any are listed below.
        </p>
      </div>

      <label className={LABEL_CLASS}>League grants</label>
      {grants.length === 0 ? (
        <p className="text-text-dim text-sm mb-4">No leagues yet.</p>
      ) : (
        <div className="flex flex-col gap-3 mb-4">
          {grants.map(row => (
            <GrantRow
              // Keyed on the server's answer, so a save resets the draft to what was stored rather
              // than leaving the checkboxes showing what was asked for.
              key={`${row.conf}:${[...row.scopes].sort().join(",")}`}
              conf={row.conf}
              name={row.name}
              held={row.scopes}
              busy={busy}
              onSave={scopes => save.mutate({ conf: row.conf, scopes })}
              onRevoke={() => revoke.mutate(row.conf)}
            />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[200px] flex-1">
          <label className={LABEL_CLASS} htmlFor="admin-grant-conf">
            Add a league
          </label>
          <select
            id="admin-grant-conf"
            value={addConf}
            onChange={e => setAddConf(e.target.value)}
            disabled={grantable.length === 0}
            className={CONTROL_CLASS}
          >
            <option value="">Choose a league…</option>
            {grantable.map(t => (
              <option key={t.conf} value={t.conf}>
                {t.name} ({t.conf})
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          disabled={addConf === "" || busy}
          onClick={() => {
            save.mutate({ conf: addConf, scopes: [LEAGUE_ADMIN_SCOPE] });
            setAddConf("");
          }}
          className={ACTION_SM_PRIMARY}
        >
          <Plus size={14} aria-hidden="true" />
          Grant admin
        </button>
      </div>
      {grantable.length === 0 && tournaments.length > 0 && (
        <p className="text-text-dim text-xs mt-1.5">They already hold a grant in every league.</p>
      )}

      <ErrorLine message={failure ? errorMessage(failure) : null} />

      <Toast message={notice} onClose={() => setNotice(null)} />
    </div>
  );
}

/** `2026-07-30T12:00:00.000Z` → `30 Jul 2026`. Falls back to the raw string if it won't parse. */
function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function GrantRow({
  conf,
  name,
  held,
  busy,
  onSave,
  onRevoke,
}: {
  conf: string;
  name: string;
  held: LeagueScope[];
  busy: boolean;
  onSave: (scopes: LeagueScope[]) => void;
  onRevoke: () => void;
}) {
  const [draft, setDraft] = useState<LeagueScope[]>(held);

  const dirty =
    draft.length !== held.length || draft.some(s => !held.includes(s));

  const toggle = (scope: LeagueScope) =>
    setDraft(prev => (prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]));

  // `admin` implies the other three within this conf, so ticking them alongside it changes nothing.
  const impliedByAdmin = draft.includes(LEAGUE_ADMIN_SCOPE);

  return (
    <div className="bg-bg3 border border-border rounded-lg p-3">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <span className="text-text-bright text-sm truncate">{name}</span>
        <span className="font-mono text-xs text-text-dim shrink-0">{conf}</span>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-2 mb-3">
        {LEAGUE_SCOPES.map(scope => (
          <label
            key={scope}
            className={`flex items-center gap-2 cursor-pointer text-sm ${
              scope !== LEAGUE_ADMIN_SCOPE && impliedByAdmin ? "text-text-dim" : "text-text"
            }`}
          >
            <input
              type="checkbox"
              checked={draft.includes(scope)}
              onChange={() => toggle(scope)}
              className="accent-accent w-4 h-4 cursor-pointer"
            />
            {scope}
          </label>
        ))}
      </div>

      {impliedByAdmin && (
        <p className="text-text-dim text-xs mb-3">
          Admin already implies schedule, roster and stats in this league.
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={!dirty || busy}
          onClick={() => onSave(draft)}
          className={ACTION_SM_PRIMARY}
        >
          {dirty ? "Save scopes" : "Saved"}
        </button>
        {dirty && (
          <button type="button" disabled={busy} onClick={() => setDraft(held)} className={ACTION_SM}>
            Reset
          </button>
        )}
        <button type="button" disabled={busy} onClick={onRevoke} className={ACTION_SM_DANGER}>
          <Trash2 size={14} aria-hidden="true" />
          Revoke
        </button>
      </div>
    </div>
  );
}
