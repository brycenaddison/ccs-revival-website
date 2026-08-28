/**
 * Creating a league and editing its metadata — `GET`/`POST /admin/leagues` and
 * `PATCH /admin/leagues/:conf`.
 *
 * **This reads `/admin/leagues`, not the public `/tournaments`.** It used to read the latter out of
 * `LeagueProvider`, which was correct while that list was unfiltered. It is now a listed-only
 * projection, so a hidden upcoming conference is absent from it — and this is the editor that has to
 * be able to select the hidden league the admin just created. Saves still invalidate
 * `queryRoots.tournaments`, which covers both keys, so the nav's season picker updates from the same
 * write rather than needing a reload.
 *
 * A league has three independent flags and this page only owns one and a half of them:
 *
 *  - `active` — whether the season is running now. Editable here, as it always was.
 *  - `applicationsOpen` — intake. Shown, but the control is League Admin → Team Applications, since
 *    running an application window is league work.
 *  - `listed` — public visibility. Shown, and **only ever settable to `false`** here: a season
 *    becomes public through the atomic team publication, and upstream refuses `listed: true` on this
 *    route precisely so nobody can bypass it. `false` remains available as an emergency hide.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, EyeOff, Plus } from "lucide-react";
import { CONTROL_CLASS, LABEL_CLASS } from "../stats/FilterBar";
import { ReadOnlyValue, SettingsRow } from "../settings/SettingsSection";
import { Toast } from "../Toast";
import { ACTION_PRIMARY, ErrorLine, Pill } from "./adminUi";
import { queries, queryRoots } from "../../lib/queries";
import { fmtDay } from "../../lib/utils";
import {
  CONF_PATTERN,
  createLeague,
  errorMessage,
  NAME_MAX,
  SHORTNAME_MAX,
  updateLeague,
  type LeagueEdit,
  type Tournament,
} from "../../lib/api";

/** Picker value for "not an existing league". Never collides — a real conf is 1–3 characters. */
const NEW = "";

/**
 * A one-line summary of where a league is in its lifecycle, for the picker.
 *
 * Worth spelling out rather than leaving to three checkboxes: "hidden" and "live" are the two states
 * an admin is actually looking for, and a hidden league with intake open is the state this whole
 * workflow exists to support. Absent flags contribute nothing — an older deployment omits them, and
 * inventing "hidden" from a missing `listed` would relabel every existing season.
 */
function stateNote(t: Tournament): string {
  const notes: string[] = [];
  if (t.listed === false) notes.push("hidden");
  if (t.applicationsOpen === true) notes.push("intake open");
  if (t.active === true) notes.push("live");
  if (t.teamsPublishedAt) notes.push(`published ${fmtDay(t.teamsPublishedAt)}`);
  return notes.length === 0 ? "" : ` · ${notes.join(" · ")}`;
}

export function LeaguesSection() {
  const { data, isPending: loading, error: failure } = useQuery(queries.adminLeagues());
  const tournaments = data ?? [];
  const error = failure ? errorMessage(failure) : null;
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
              {t.name} ({t.conf})
              {stateNote(t)}
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
  // Not a mirror of `listed` like the others: it is a one-way request to hide, so it starts unticked
  // even on a listed league and there is nothing for it to do on one that is already hidden.
  const [hide, setHide] = useState(false);

  const trimmedName = name.trim();
  const trimmedShort = shortname.trim();
  const listed = league?.listed !== false;

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
    // Only ever `false`. The type says so too — upstream rejects `listed: true` here, because a
    // season becomes public through the publication transaction and nowhere else.
    if (hide && listed) out.listed = false;
    return out;
  }, [league, trimmedName, trimmedShort, active, hide, listed]);

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
        hint={
          isNew
            ? "A new league is created hidden and closed to applications: it won't appear anywhere on the site until its teams are published. Marking it as running now only decides which season the site defaults to once it is public — grant its league admins on the roles page, then run intake from League Admin."
            : "Marks this season as the one running now, which is what the site shows by default. Deactivating doesn't end anything: the conf stays a valid id and its league admins keep their access — revoking those is a separate job on the roles page."
        }
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
        <>
          <SettingsRow
            label="Public visibility"
            hint="A season becomes public only when its teams are published, which happens in one transaction with the team rows — there is no switch for it here, and the API refuses one. Hiding is available as an emergency measure; it doesn't delete anything or change whether the season is marked as running."
          >
            <div className="flex flex-wrap items-center gap-3">
              <Pill muted={!listed}>{listed ? "Listed" : "Hidden"}</Pill>
              {league.teamsPublishedAt && (
                <span className="text-text-dim text-xs">
                  Teams published {fmtDay(league.teamsPublishedAt)}
                </span>
              )}
              {league.listed === undefined && (
                <span className="text-text-dim text-xs">
                  This deployment doesn't report visibility yet.
                </span>
              )}
            </div>
            {listed && (
              <label className="mt-2.5 flex items-center gap-2.5 cursor-pointer text-sm text-text">
                <input
                  type="checkbox"
                  checked={hide}
                  onChange={e => setHide(e.target.checked)}
                  className="accent-ccs-red w-4 h-4 cursor-pointer"
                />
                <EyeOff size={14} aria-hidden="true" className="text-ccs-red" />
                Hide this season from the whole site
              </label>
            )}
          </SettingsRow>

          <SettingsRow
            label="Applications"
            hint="Whether signed-in members can submit teams for this season. Running an application window is league work — open and close it in League Admin → Team Applications for this conf."
          >
            <ReadOnlyValue>
              {league.applicationsOpen === undefined
                ? "Not reported by this deployment"
                : league.applicationsOpen
                  ? "Open — members can submit teams"
                  : "Closed"}
            </ReadOnlyValue>
          </SettingsRow>
        </>
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
