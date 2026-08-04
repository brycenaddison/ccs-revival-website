/**
 * Creating a league and editing its metadata — `POST /admin/leagues` and `PATCH /admin/leagues/:conf`.
 *
 * There is no `GET` under `/admin/leagues`: the public `GET /tournaments` already serves the full
 * list, and `LeagueProvider` has it cached for the whole session. So this reads from context and
 * invalidates that query on save, which means the season picker in the nav updates from the same
 * write rather than needing a reload.
 *
 * The form is deliberately the *only* editor for the three fields the endpoint accepts. `layout` is
 * shown read-only because the API will not take it — it is a `jsonb[]` of the season's best-of
 * structure, owned by the season config — and a disabled input would read as "not right now" rather
 * than "not here".
 */

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Plus } from "lucide-react";
import { CONTROL_CLASS, LABEL_CLASS } from "../stats/FilterBar";
import { ReadOnlyValue, SettingsRow } from "../settings/SettingsSection";
import { Toast } from "../Toast";
import { ACTION_PRIMARY, ErrorLine } from "./adminUi";
import { useLeague } from "../../lib/leagueContext";
import { queryRoots } from "../../lib/queries";
import {
  CONF_PATTERN,
  createLeague,
  errorMessage,
  NAME_MAX,
  SHORTNAME_MAX,
  updateLeague,
  type LeagueEdit,
  type Tournament,
  type TournamentLayout,
} from "../../lib/api";

/** Picker value for "not an existing league". Never collides — a real conf is 1–3 characters. */
const NEW = "";

export function LeaguesSection() {
  const { tournaments, loading, error } = useLeague();
  const [selected, setSelected] = useState<string>(NEW);
  // Owned here rather than in the form: creating a league re-keys the form, which would destroy
  // the confirmation of the very save that caused it.
  const [saved, setSaved] = useState<string | null>(null);

  const current = tournaments.find(t => t.conf === selected) ?? null;

  // A conf that vanished — deleted elsewhere, or the list arriving after a create — falls back to
  // the create form rather than editing nothing.
  const value = current ? current.conf : NEW;

  if (loading) return <p className="text-text-dim">Loading leagues…</p>;

  return (
    <div className="flex flex-col gap-5">
      {error && <ErrorLine message={`Couldn't load the league list: ${error}`} />}

      <div>
        <label className={LABEL_CLASS}>Editing</label>
        <select
          value={value}
          aria-label="League to edit"
          onChange={e => setSelected(e.target.value)}
          className={CONTROL_CLASS}
        >
          <option value={NEW}>+ New league</option>
          {tournaments.map(t => (
            <option key={t.conf} value={t.conf}>
              {t.name} ({t.conf}){t.active ? " · live" : ""}
            </option>
          ))}
        </select>
      </div>

      {/* Keyed on the selection so switching leagues resets the fields to that row, rather than
          carrying a half-typed edit across to a different season. */}
      <LeagueForm
        key={value}
        league={current}
        existing={tournaments}
        onSaved={setSaved}
        onCreated={setSelected}
      />

      <Toast message={saved} onClose={() => setSaved(null)} />
    </div>
  );
}

/** "Wk 1+ Bo1 · Wk 5+ Bo3", or a note that the season config hasn't set one. */
function layoutSummary(layout: TournamentLayout[]): string {
  if (layout.length === 0) return "Not set";
  return [...layout]
    .sort((a, b) => a.startingWeek - b.startingWeek)
    .map(l => `Wk ${l.startingWeek}+ Bo${l.bestOf}`)
    .join("  ·  ");
}

interface FormProps {
  /** The league being edited, or `null` to create one. */
  league: Tournament | null;
  existing: Tournament[];
  onSaved: (message: string) => void;
  /** Selects the league that was just created, once the list knows about it. */
  onCreated: (conf: string) => void;
}

function LeagueForm({ league, existing, onSaved, onCreated }: FormProps) {
  const qc = useQueryClient();
  const isNew = league === null;

  const [conf, setConf] = useState(league?.conf ?? "");
  const [name, setName] = useState(league?.name ?? "");
  const [shortname, setShortname] = useState(league?.shortname ?? "");
  const [active, setActive] = useState(league?.active === true);

  const trimmedName = name.trim();
  const trimmedShort = shortname.trim();

  /**
   * Only what actually moved. `PATCH` treats an absent key as "leave it alone", so sending the
   * whole form would rewrite `shortname` on every name change — and sending nothing at all is a
   * `400`, which is what disables the button below.
   */
  const changes = useMemo<LeagueEdit>(() => {
    if (!league) return {};
    const out: LeagueEdit = {};
    if (trimmedName !== league.name) out.name = trimmedName;
    // An emptied box clears the column; upstream only reads `null` as "clear", never "".
    if (trimmedShort !== (league.shortname ?? "")) out.shortname = trimmedShort === "" ? null : trimmedShort;
    if (active !== (league.active === true)) out.active = active;
    return out;
  }, [league, trimmedName, trimmedShort, active]);

  const confTaken = isNew && existing.some(t => t.conf === conf);
  const confValid = CONF_PATTERN.test(conf);
  const canSave = isNew
    ? confValid && !confTaken && trimmedName !== ""
    : trimmedName !== "" && Object.keys(changes).length > 0;

  const save = useMutation({
    // `league === null` rather than `isNew`, here and below, so the narrowing is local to the
    // expression that needs it.
    mutationFn: () =>
      league === null
        ? createLeague({
            conf,
            name: trimmedName,
            ...(trimmedShort ? { shortname: trimmedShort } : {}),
            active,
          })
        : updateLeague(league.conf, changes),
    onSuccess: async (result: Tournament) => {
      // The season picker, `useAdminAccess` and this form all read the same cached list. Awaited so
      // that a newly created league is *in* that list before it is selected — otherwise selecting it
      // would land on a conf the list doesn't know yet and bounce back to the create form.
      await qc.invalidateQueries({ queryKey: queryRoots.tournaments });
      onSaved(isNew ? `Created ${result.name}.` : `Saved ${result.name}.`);
      if (isNew) onCreated(result.conf);
    },
  });

  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        if (canSave && !save.isPending) save.mutate();
      }}
    >
      <SettingsRow
        label="Conf"
        hint={
          isNew
            ? "1–3 lowercase letters or digits. This is the league's permanent id — it can't be changed once created, because matches, teams and every stats view reference it by value."
            : "The primary key. Matches, teams, forfeits, grants and the stats views all reference it by value, so it can't be changed."
        }
      >
        {league === null ? (
          <input
            value={conf}
            onChange={e => setConf(e.target.value.toLowerCase())}
            maxLength={3}
            placeholder="ccs"
            aria-label="Conf"
            className={`${CONTROL_CLASS} font-mono`}
          />
        ) : (
          <ReadOnlyValue mono>{league.conf}</ReadOnlyValue>
        )}
      </SettingsRow>

      {isNew && conf !== "" && !confValid && (
        <p className="text-ccs-red text-xs -mt-3 mb-5">conf must be 1–3 lowercase letters or digits.</p>
      )}
      {confTaken && (
        <p className="text-ccs-red text-xs -mt-3 mb-5">
          {conf} is already taken by {existing.find(t => t.conf === conf)?.name}.
        </p>
      )}

      <SettingsRow label="Name" hint="The full season name, e.g. “CCS 2026 Summer Diamond Division”. Shown wherever a league has to be told apart from the one running beside it.">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={NAME_MAX}
          aria-label="Name"
          className={CONTROL_CLASS}
        />
      </SettingsRow>

      <SettingsRow
        label="Short name"
        hint={`Optional, ${SHORTNAME_MAX} characters max, e.g. “Summer ’26”. Divisions running concurrently are meant to share one, so it can't tell them apart. Leave it empty to clear.`}
      >
        <input
          value={shortname}
          onChange={e => setShortname(e.target.value)}
          maxLength={SHORTNAME_MAX}
          aria-label="Short name"
          className={CONTROL_CLASS}
        />
      </SettingsRow>

      <SettingsRow
        label="Status"
        hint="Marks this season as the one running now, which is what the site shows by default. Deactivating doesn't end anything: the conf stays a valid id and its league admins keep their access — revoking those is a separate job on the roles page."
      >
        <label className="flex items-center gap-2.5 cursor-pointer text-sm text-text">
          <input
            type="checkbox"
            checked={active}
            onChange={e => setActive(e.target.checked)}
            className="accent-accent w-4 h-4 cursor-pointer"
          />
          This season is running now
        </label>
      </SettingsRow>

      {league !== null && (
        <SettingsRow
          label="Week layout"
          hint="Read-only here. It's the per-week best-of structure the post-match summary reads, and it belongs to the season config rather than this editor — a new league starts with none."
        >
          <ReadOnlyValue>{layoutSummary(league.layout)}</ReadOnlyValue>
        </SettingsRow>
      )}

      <button type="submit" disabled={!canSave || save.isPending} className={ACTION_PRIMARY}>
        {isNew ? <Plus size={15} aria-hidden="true" /> : <Check size={15} aria-hidden="true" />}
        {save.isPending ? "Saving…" : isNew ? "Create league" : "Save changes"}
      </button>
      {!isNew && Object.keys(changes).length === 0 && !save.isPending && (
        <p className="text-text-dim text-xs mt-2">No changes to save.</p>
      )}

      <ErrorLine message={save.isError ? errorMessage(save.error) : null} />
    </form>
  );
}
