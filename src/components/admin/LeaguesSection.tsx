/**
 * Creating a league and editing its metadata — `GET`/`POST /admin/leagues`,
 * `PATCH /admin/leagues/:conf`, and the season's two lifecycle switches beside it.
 *
 * **This reads `/admin/leagues`, not the public `/tournaments`.** It used to read the latter out of
 * `LeagueProvider`, which was correct while that list was unfiltered. It is now a listed-only
 * projection, so a hidden upcoming conference is absent from it — and this is the editor that has to
 * be able to select the hidden league the admin just created. Saves still invalidate
 * `queryRoots.tournaments`, which covers both keys, so the nav's season picker updates from the same
 * write rather than needing a reload.
 *
 * A league has three independent flags and this page owns the controls for all three:
 *
 *  - `active` — whether the season is running now. A checkbox on the metadata form, as it always was.
 *  - `applicationsOpen` — intake. A toggle here, through `PATCH /admin/leagues/:conf/applications`.
 *    It used to be League Admin's, behind a conference `admin` grant, and moved because opening
 *    intake changes what the whole site offers — the nav grows an APPLY NOW button for every member.
 *    Roster staff still see the state on League Admin → Team Applications; they can't change it.
 *  - `listed` — public visibility. Two one-way controls: "Make season public" is
 *    `POST /admin/leagues/:conf/list`, the **only** path to listed, which also marks the season
 *    running and closes intake in one statement; and the emergency hide is the metadata `PATCH` with
 *    `listed: false`, the one value upstream accepts for that key. Neither is part of Save.
 *
 * The two switches are separate mutations rather than fields of the form, because they are commands
 * with their own refusals (`season_listed`, `no_teams`, `already_listed`) and not a diff of the row.
 * They live in `LeagueForm` all the same, because that is the component that has the row.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, EyeOff, Globe, Lock, LockOpen, Plus } from "lucide-react";
import { CONTROL_CLASS, LABEL_CLASS } from "../stats/FilterBar";
import { ReadOnlyValue, SettingsRow } from "../settings/SettingsSection";
import { ConfirmButton } from "../ConfirmButton";
import { Toast } from "../Toast";
import { ACTION, ACTION_PRIMARY, ACTION_SM_PRIMARY, ErrorLine, Pill, stateNote } from "./adminUi";
import { queries, queryRoots } from "../../lib/queries";
import { fmtDay } from "../../lib/utils";
import {
  CODENAME_MAX,
  CONF_PATTERN,
  createLeague,
  errorMessage,
  listSeason,
  NAME_MAX,
  refusalOf,
  setApplicationsOpen,
  SHORTNAME_MAX,
  updateLeague,
  type LeagueEdit,
  type Tournament,
} from "../../lib/api";

/** Picker value for "not an existing league". Never collides — a real conf is 1–3 characters. */
const NEW = "";

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
  const [codename, setCodename] = useState(league?.codename ?? "");
  const [active, setActive] = useState(league?.active === true);
  // Not a mirror of `listed` like the others: it is a one-way request to hide, so it starts unticked
  // even on a listed league and there is nothing for it to do on one that is already hidden.
  const [hide, setHide] = useState(false);

  const trimmedName = name.trim();
  const trimmedShort = shortname.trim();
  const trimmedCodename = codename.trim();
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
    if (trimmedCodename !== (league.codename ?? "")) {
      out.codename = trimmedCodename === "" ? null : trimmedCodename;
    }
    if (active !== (league.active === true)) out.active = active;
    // Only ever `false`. The type says so too — upstream rejects `listed: true` here, because a
    // season becomes public through the publication transaction and nowhere else.
    if (hide && listed) out.listed = false;
    return out;
  }, [league, trimmedName, trimmedShort, trimmedCodename, active, hide, listed]);

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
            ...(trimmedCodename ? { codename: trimmedCodename } : {}),
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

  // Intake, as the row reports it. `undefined` is a deployment older than the column, and a toggle
  // rendered over it would claim a state nobody knows — so that case gets a caption, not a button.
  const open = league?.applicationsOpen;

  const intake = useMutation({
    mutationFn: (next: boolean) => setApplicationsOpen(league?.conf ?? "", next),
    onSuccess: async (_row, next) => {
      // This list is what the pill below reads its state back from, so awaiting the invalidation is
      // what makes the toggle settle on the server's answer rather than on the value just requested.
      // `applications` too: the nav's APPLY NOW button and League Admin's season-state panel both
      // read what this changed.
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryRoots.tournaments }),
        qc.invalidateQueries({ queryKey: queryRoots.applications }),
      ]);
      onSaved(next ? "Applications are open." : "Applications are closed.");
    },
  });

  const goPublic = useMutation({
    mutationFn: () => listSeason(league?.conf ?? ""),
    onSuccess: async () => {
      // Listing is what puts the conference in the season picker and the schedule feed, and the
      // public data reads — teams, standings — stop refusing it to anonymous visitors at the same
      // moment, so every one of those caches is stale.
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryRoots.tournaments }),
        qc.invalidateQueries({ queryKey: queryRoots.applications }),
        qc.invalidateQueries({ queryKey: queryRoots.teams }),
        qc.invalidateQueries({ queryKey: queryRoots.standings }),
      ]);
      onSaved(`${league?.name ?? "This season"} is public.`);
    },
  });

  // `refusalOf` lifts the `{status, error}` envelope both commands answer with; anything else — a
  // plain-text `400`, a network failure — falls through to the generic message.
  const intakeError = intake.isError
    ? (refusalOf(intake.error)?.message ?? errorMessage(intake.error))
    : null;
  const listError = goPublic.isError
    ? (refusalOf(goPublic.error)?.message ?? errorMessage(goPublic.error))
    : null;

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
            ? "1–3 lowercase letters or digits. This is the league's permanent id. It can't be changed once created, because matches, teams and every stats view reference it by value."
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

      {/* Two short labels, and they answer different questions: the season name says *when* a league
          ran and is shared by every division running at once; the division name says *which one* it
          is and is what the Home standings strip shows. Upstream stores them as `shortname` and
          `codename` and derives neither from the other. */}
      <SettingsRow
        label="Season Name"
        hint={`Optional, ${SHORTNAME_MAX} characters max, e.g. “Summer ’26”. Names the season a team played in. Divisions running concurrently are meant to share one, so it can't tell them apart. Leave it empty to clear.`}
      >
        <input
          value={shortname}
          onChange={e => setShortname(e.target.value)}
          maxLength={SHORTNAME_MAX}
          aria-label="Season Name"
          className={CONTROL_CLASS}
        />
      </SettingsRow>

      <SettingsRow
        label="Division Name"
        hint={`Optional, ${CODENAME_MAX} characters max, e.g. “Apollo”. What the site calls this division wherever several run at once: the Standings, Stats and Teams strips, the Home standings panel and the schedule captions. Falls back to the full name without one. Leave it empty to clear.`}
      >
        <input
          value={codename}
          onChange={e => setCodename(e.target.value)}
          maxLength={CODENAME_MAX}
          aria-label="Division Name"
          className={CONTROL_CLASS}
        />
      </SettingsRow>

      <SettingsRow
        label="Status"
        hint={
          isNew
            ? "A new league is created hidden and closed to applications: it won't appear anywhere on the site until you make it public below, after its teams exist. Marking it as running now only decides which season the site defaults to once it is public. Grant its league admins on the roles page, then open applications here."
            : "Marks this season as the one running now, which is what the site shows by default. Making the season public sets this too. Deactivating doesn't end anything: the conf stays a valid id and its league admins keep their access. Revoking those is a separate job on the roles page."
        }
      >
        <label className="flex items-center gap-2.5 cursor-pointer text-sm text-text">
          <input
            type="checkbox"
            checked={active}
            onChange={e => setActive(e.target.checked)}
            className="accent-brand w-4 h-4 cursor-pointer"
          />
          This season is running now
        </label>
      </SettingsRow>

      {league !== null && (
        <>
          <SettingsRow
            label="Applications"
            hint={
              listed
                ? "This season is public, so intake stays closed. Recruiting happens before publication, and the database enforces it."
                : "While applications are open, any signed-in member sees APPLY NOW in the nav and can submit a team for this season. League admins review the queue and publish approved teams from League Admin → Team Applications; only this switch is yours. Takes effect immediately, no Save needed."
            }
          >
            {open === undefined ? (
              <ReadOnlyValue>Not reported by this deployment</ReadOnlyValue>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <Pill muted={!open}>{open ? "Open" : "Closed"}</Pill>
                {/* A listed season cannot open intake (`409 season_listed`), so the button only stays
                    live on one for the case that should be impossible: intake somehow open. */}
                <button
                  type="button"
                  disabled={intake.isPending || (listed && !open)}
                  onClick={() => intake.mutate(!open)}
                  className={ACTION}
                >
                  {open ? <Lock size={15} aria-hidden="true" /> : <LockOpen size={15} aria-hidden="true" />}
                  {intake.isPending ? "Saving…" : open ? "Close applications" : "Open applications"}
                </button>
              </div>
            )}
            <ErrorLine message={intakeError} />
          </SettingsRow>

          <SettingsRow
            label="Public visibility"
            hint={
              listed
                ? "Hiding is an emergency measure, saved with the form: it takes the season out of every selector and public read without deleting anything or changing whether it is marked as running."
                : "Making the season public lists it across the site, marks it as running, and closes applications, in one step. It creates no teams and refuses an empty field, so have League Admin publish the approved teams first."
            }
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
              {league.listed === false && (
                <ConfirmButton
                  title={`Make ${league.name} public?`}
                  description={
                    <>
                      Every visitor will see this season in the site's selectors, schedule and
                      standings from now on, it will be marked as running, and applications will
                      close. There is no undo here, only the emergency hide.
                      {!league.teamsPublishedAt &&
                        " No teams have been published for it yet; the server refuses to list an empty season."}
                    </>
                  }
                  confirmLabel="Make public"
                  confirmVariant="default"
                  disabled={goPublic.isPending}
                  onConfirm={() => goPublic.mutate()}
                  trigger={
                    <button type="button" disabled={goPublic.isPending} className={ACTION_SM_PRIMARY}>
                      <Globe size={14} aria-hidden="true" />
                      {goPublic.isPending ? "Publishing…" : "Make season public"}
                    </button>
                  }
                />
              )}
            </div>
            <ErrorLine message={listError} />
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
