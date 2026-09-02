/**
 * League Admin → Accolades: this conference's definitions, and the awards issued under them.
 *
 * One read answers the whole screen (`GET /:conf/accolades`), and it returns two things that look
 * similar and are not: the *definitions* this conference may issue — active site-wide ones plus every
 * one it owns — and the *occurrences* it has issued. A definition is reusable; an occurrence is one
 * award with a complete recipient list. That is what makes co-winners a single award with several
 * recipients, and player of the week several awards told apart by `label`.
 *
 * A **team** award names the team and sends no profile list: the server expands that team's current
 * roster in the same transaction, deduplicated, former members excluded. So the recipient picker
 * below is only ever shown for an individual award, and editing a team award re-expands rather than
 * preserving who won it — the header on `../../../lib/api/accolades.ts` says more about why.
 *
 * Recipients for an individual award are found through `GET /profiles/search`, which matches display
 * names, cached Discord handles and — for an all-digit query — a profile id, so pasting an id in is
 * still a search rather than a separate field. Its optional `conf` narrows to profiles a published
 * team in this conference references; that is on by default, because an all-pro selection means one
 * of this league's players and a common first name otherwise returns the whole site. Turning it off
 * is the only way to reach somebody unrostered, since the filter excludes them rather than merely
 * ranking them lower.
 */

import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { PlayerLink } from "../../profile/PlayerLink";
import { CONTROL_CLASS } from "../../stats/FilterBar";
import { ACTION, ACTION_PRIMARY, ACTION_SM, ACTION_SM_DANGER, ErrorLine, Pill } from "../../admin/adminUi";
import { DefinitionForm, DefinitionRow, KindPill } from "../../admin/accolades/accoladeUi";
import { SettingsRow } from "../../settings/SettingsSection";
import { ConfirmButton } from "../../ConfirmButton";
import { Toast } from "../../Toast";
import { useDebounced } from "../../../hooks/useDebounced";
import { queries, queryRoots } from "../../../lib/queries";
import { fmtDay } from "../../../lib/utils";
import {
  createLeagueDefinition,
  errorMessage,
  issueAccolade,
  revokeAccolade,
  updateAccolade,
  updateLeagueDefinition,
  ACCOLADE_LABEL_MAX,
  PROFILE_SEARCH_MIN,
  type AccoladeDefinition,
  type AccoladeDefinitionInput,
  type AccoladeInput,
  type AccoladeRecord,
  type TeamRecord,
} from "../../../lib/api";

export function AccoladesSection() {
  const { conf = "" } = useParams();
  const [saved, setSaved] = useState<string | null>(null);

  const { data, isPending, error } = useQuery(queries.leagueAccolades(conf));
  const { data: teamRows } = useQuery(queries.teamsForConf(conf));
  const teams = teamRows ?? [];

  if (isPending) return <p className="text-text-dim">Loading accolades…</p>;

  return (
    <div className="flex flex-col gap-8">
      {error && <ErrorLine message={`Couldn't load accolades: ${errorMessage(error)}`} />}

      <IssuedPanel
        conf={conf}
        definitions={data?.definitions ?? []}
        accolades={data?.accolades ?? []}
        teams={teams}
        onSaved={setSaved}
      />

      <DefinitionsPanel conf={conf} definitions={data?.definitions ?? []} onSaved={setSaved} />

      <Toast message={saved} onClose={() => setSaved(null)} />
    </div>
  );
}

// -------------------------------------------------------------- definitions

type Editing = { kind: "closed" } | { kind: "new" } | { kind: "existing"; id: number };

interface DefinitionsProps {
  conf: string;
  definitions: readonly AccoladeDefinition[];
  onSaved: (message: string) => void;
}

/**
 * The definitions available here, split by who owns them.
 *
 * A site-wide definition is read-only from this page and there is no control that pretends
 * otherwise — a league admin may *issue* it but only a site admin can change it, and a disabled
 * Edit button would invite them to go looking for the thing that unlocks it.
 */
function DefinitionsPanel({ conf, definitions, onSaved }: DefinitionsProps) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Editing>({ kind: "closed" });

  const own = definitions.filter(d => d.conf !== null);
  const global = definitions.filter(d => d.conf === null);

  const save = useMutation({
    mutationFn: (input: AccoladeDefinitionInput) =>
      editing.kind === "existing"
        ? updateLeagueDefinition(conf, editing.id, input)
        : createLeagueDefinition(conf, input),
    onSuccess: async (definition: AccoladeDefinition) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryRoots.accolades }),
        qc.invalidateQueries({ queryKey: queryRoots.profiles }),
      ]);
      onSaved(`Saved ${definition.name}.`);
      setEditing({ kind: "closed" });
    },
  });

  const target = editing.kind === "existing" ? own.find(d => d.id === editing.id) ?? null : null;

  return (
    <section>
      <h3 className="font-display text-[18px] text-text-bright ">Definitions</h3>
      <p className="text-text-dim text-xs mt-1">
        What this league can award. Site-wide definitions are managed by a site admin; the ones this
        league owns are editable here.
      </p>

      <div className="mt-3">
        {editing.kind === "closed" ? (
          <button
            type="button"
            onClick={() => {
              save.reset();
              setEditing({ kind: "new" });
            }}
            className={ACTION}
          >
            <Plus size={15} aria-hidden="true" />
            New definition for this league
          </button>
        ) : (
          <DefinitionForm
            key={editing.kind === "existing" ? editing.id : "new"}
            definition={target}
            saving={save.isPending}
            error={save.isError ? errorMessage(save.error) : null}
            onSave={input => save.mutate(input)}
            onCancel={() => setEditing({ kind: "closed" })}
          />
        )}
      </div>

      {own.length > 0 && (
        <ul className="mt-3">
          {own.map(definition => (
            <DefinitionRow key={definition.id} definition={definition}>
              <button
                type="button"
                onClick={() => {
                  save.reset();
                  setEditing({ kind: "existing", id: definition.id });
                }}
                className={ACTION_SM}
              >
                <Pencil size={13} aria-hidden="true" />
                Edit
              </button>
            </DefinitionRow>
          ))}
        </ul>
      )}

      {global.length > 0 && (
        <ul className="mt-3">
          {global.map(definition => (
            <DefinitionRow key={definition.id} definition={definition} scope="site-wide" />
          ))}
        </ul>
      )}

      {definitions.length === 0 && (
        <p className="text-text-dim mt-3">
          Nothing to award yet. Create a definition for this league, or ask a site admin to add a
          site-wide one.
        </p>
      )}
    </section>
  );
}

// -------------------------------------------------------------------- issued

interface IssuedProps {
  conf: string;
  definitions: readonly AccoladeDefinition[];
  accolades: readonly AccoladeRecord[];
  teams: readonly TeamRecord[];
  onSaved: (message: string) => void;
}

function IssuedPanel({ conf, definitions, accolades, teams, onSaved }: IssuedProps) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Editing>({ kind: "closed" });

  const remove = useMutation({
    mutationFn: (accoladeId: number) => revokeAccolade(conf, accoladeId),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryRoots.accolades }),
        qc.invalidateQueries({ queryKey: queryRoots.profiles }),
      ]);
      onSaved("Accolade revoked.");
    },
  });

  const target =
    editing.kind === "existing" ? accolades.find(a => a.id === editing.id) ?? null : null;

  return (
    <section>
      <h3 className="font-display text-[18px] text-text-bright ">Awards</h3>
      <p className="text-text-dim text-xs mt-1">
        Newest first, as served. Every award here shows on each recipient's public profile —
        career-wide, so it stays visible while they're reading a different season.
      </p>

      <div className="mt-3">
        {editing.kind === "closed" ? (
          <button
            type="button"
            disabled={definitions.every(d => !d.active)}
            onClick={() => setEditing({ kind: "new" })}
            className={ACTION_PRIMARY}
          >
            <Plus size={15} aria-hidden="true" />
            Issue an accolade
          </button>
        ) : (
          <IssueForm
            key={editing.kind === "existing" ? editing.id : "new"}
            conf={conf}
            accolade={target}
            definitions={definitions}
            teams={teams}
            onDone={message => {
              onSaved(message);
              setEditing({ kind: "closed" });
            }}
            onCancel={() => setEditing({ kind: "closed" })}
          />
        )}
      </div>

      <ErrorLine message={remove.isError ? errorMessage(remove.error) : null} />

      {accolades.length === 0 ? (
        <p className="text-text-dim mt-3">Nothing awarded in this league yet.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {accolades.map(accolade => (
            <li key={accolade.id} className="bg-bg2 border border-border rounded-lg p-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <KindPill kind={accolade.definition.kind} />
                <span className="font-heading text-sm text-text-bright">
                  {accolade.definition.name}
                </span>
                {accolade.label && <Pill muted>{accolade.label}</Pill>}
                {accolade.team && (
                  <span className="text-text-secondary text-xs">
                    {accolade.team.name} ({accolade.team.code})
                  </span>
                )}
                {accolade.awardedAt && (
                  <span className="text-text-dim text-xs">{fmtDay(accolade.awardedAt)}</span>
                )}
                <span className="ml-auto flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditing({ kind: "existing", id: accolade.id })}
                    className={ACTION_SM}
                  >
                    <Pencil size={13} aria-hidden="true" />
                    Edit
                  </button>
                  <ConfirmButton
                    title={`Revoke “${accolade.definition.name}”?`}
                    description={
                      accolade.recipients.length === 1
                        ? `It disappears from ${accolade.recipients[0].nickname ?? "the recipient"}'s profile. The definition stays, so it can be awarded again.`
                        : `It disappears from all ${accolade.recipients.length} recipients' profiles. The definition stays, so it can be awarded again.`
                    }
                    confirmLabel="Revoke"
                    onConfirm={() => remove.mutate(accolade.id)}
                    disabled={remove.isPending}
                    trigger={
                      <button type="button" className={ACTION_SM_DANGER}>
                        <Trash2 size={13} aria-hidden="true" />
                        Revoke
                      </button>
                    }
                  />
                </span>
              </div>
              <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                {accolade.recipients.map(recipient => (
                  <li key={recipient.profileId} className="text-sm">
                    <PlayerLink profileId={recipient.profileId} className="text-brand hover:underline">
                      {recipient.nickname ?? `profile ${recipient.profileId}`}
                    </PlayerLink>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ----------------------------------------------------------------- issue form

/**
 * A chosen recipient, name and all.
 *
 * Recipients are held as objects rather than bare ids so a chip can still name somebody after the
 * search box that found them has been cleared. Keeping only ids meant re-deriving names from the
 * current result set, which forgot them the moment the query changed.
 */
interface Recipient {
  profileId: number;
  name: string;
}

interface IssueProps {
  conf: string;
  /** The award being edited, or `null` to issue a new one. */
  accolade: AccoladeRecord | null;
  definitions: readonly AccoladeDefinition[];
  teams: readonly TeamRecord[];
  onDone: (message: string) => void;
  onCancel: () => void;
}

function IssueForm({ conf, accolade, definitions, teams, onDone, onCancel }: IssueProps) {
  const qc = useQueryClient();
  const isNew = accolade === null;

  // A retired definition can't be issued again, but one already used has to stay selectable while
  // its own award is being edited — otherwise the picker would silently re-point the award.
  const issuable = definitions.filter(d => d.active || d.id === accolade?.definitionId);

  const [definitionId, setDefinitionId] = useState<number>(
    accolade?.definitionId ?? issuable[0]?.id ?? 0,
  );
  const [label, setLabel] = useState(accolade?.label ?? "");
  const [teamId, setTeamId] = useState<number | null>(accolade?.teamId ?? null);
  // Only an individual award's recipients are the assignment. A team award's are the roster the
  // server expanded, so seeding them here would turn a re-save into an explicit profile list and
  // silently change the award's kind of record.
  const [selected, setSelected] = useState<Recipient[]>(
    accolade !== null && accolade.teamId === null
      ? accolade.recipients.map(r => ({
          profileId: r.profileId,
          name: r.nickname ?? `Profile ${r.profileId}`,
        }))
      : [],
  );
  const [term, setTerm] = useState("");
  // On by default: a league admin issuing an all-pro selection means one of *their* players, and the
  // filter is what keeps a common first name from returning the whole site. Off finds everyone —
  // with it on, upstream returns only profiles a published team in this conference references, so a
  // caster or a former player is not merely ranked lower, they are absent.
  const [thisLeagueOnly, setThisLeagueOnly] = useState(true);

  const definition = issuable.find(d => d.id === definitionId) ?? null;
  const isTeamAward = definition?.kind === "team";

  const query = useDebounced(term, 300).trim();
  const { data: results, isFetching } = useQuery(
    queries.profileSearch(query, thisLeagueOnly ? conf : null),
  );

  const save = useMutation({
    mutationFn: (input: AccoladeInput) =>
      accolade === null ? issueAccolade(conf, input) : updateAccolade(conf, accolade.id, input),
    onSuccess: async (result: AccoladeRecord) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryRoots.accolades }),
        qc.invalidateQueries({ queryKey: queryRoots.profiles }),
      ]);
      onDone(
        isNew
          ? `Awarded ${result.definition.name} to ${result.recipients.length} recipient(s).`
          : `Saved ${result.definition.name}.`,
      );
    },
  });

  const canSave = definition !== null && (isTeamAward ? teamId !== null : selected.length > 0);

  function toggle(recipient: Recipient) {
    setSelected(current =>
      current.some(r => r.profileId === recipient.profileId)
        ? current.filter(r => r.profileId !== recipient.profileId)
        : [...current, recipient],
    );
  }

  return (
    <form
      className="bg-bg3 border border-border rounded-lg p-4"
      onSubmit={e => {
        e.preventDefault();
        if (!canSave || save.isPending || definition === null) return;
        const trimmed = label.trim();
        save.mutate({
          definitionId: definition.id,
          label: trimmed === "" ? null : trimmed,
          // The two shapes are mutually exclusive upstream and a mixed one is a `400`, so the kind
          // decides both fields rather than sending whatever the form happens to be holding.
          teamId: isTeamAward ? teamId : null,
          profileIds: isTeamAward ? [] : selected.map(r => r.profileId),
        });
      }}
    >
      <SettingsRow label="Award" hint="Only definitions available to this league are listed.">
        <select
          value={definitionId}
          aria-label="Award"
          onChange={e => {
            setDefinitionId(Number(e.target.value));
            // The target shape belongs to the kind, so switching definitions clears whichever half
            // of the form no longer applies rather than carrying a stale team or recipient list.
            setTeamId(null);
            setSelected([]);
          }}
          className={CONTROL_CLASS}
        >
          {issuable.map(d => (
            <option key={d.id} value={d.id}>
              {d.name} — {d.kind === "team" ? "team" : "individual"}
              {d.active ? "" : " (retired)"}
            </option>
          ))}
        </select>
      </SettingsRow>

      <SettingsRow
        label="Label"
        hint="Optional, and what tells repeat awards apart: “Group A”, “Week 4”. Leave it empty for a one-off."
      >
        <input
          value={label}
          onChange={e => setLabel(e.target.value)}
          maxLength={ACCOLADE_LABEL_MAX}
          aria-label="Label"
          className={CONTROL_CLASS}
        />
      </SettingsRow>

      {isTeamAward ? (
        <SettingsRow
          label="Team"
          hint="The server writes this team's current roster as the recipients — starters and substitutes, deduplicated. Former members are not included, and editing this award later repeats that expansion against the roster as it is then."
        >
          <select
            value={teamId ?? ""}
            aria-label="Team"
            onChange={e => setTeamId(e.target.value === "" ? null : Number(e.target.value))}
            className={CONTROL_CLASS}
          >
            <option value="">Select a team…</option>
            {teams.map(team => (
              <option key={team.id} value={team.id}>
                {team.name} ({team.code})
              </option>
            ))}
          </select>
          {teams.length === 0 && (
            <p className="text-text-dim text-xs mt-1.5">
              This league has no published teams yet, so there is nothing to award to.
            </p>
          )}
        </SettingsRow>
      ) : (
        <SettingsRow
          label="Recipients"
          hint="Everyone selected wins the same award — that is what co-winners are. For a repeating award, issue it once per occasion and use the label."
        >
          {selected.length > 0 && (
            <ul className="mb-2 flex flex-wrap gap-1.5">
              {selected.map(recipient => (
                <li key={recipient.profileId}>
                  <button
                    type="button"
                    onClick={() => toggle(recipient)}
                    title="Remove"
                    className="inline-flex items-center gap-1.5 rounded-full border border-brand/50 px-2.5 py-0.5 bg-transparent cursor-pointer font-heading text-[10px] text-text-bright"
                  >
                    {recipient.name}
                    <X size={11} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}

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
              className={`${CONTROL_CLASS} pl-8`}
            />
          </div>

          <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-text">
            <input
              type="checkbox"
              checked={thisLeagueOnly}
              onChange={e => setThisLeagueOnly(e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-brand"
            />
            Only this league's players
          </label>

          {term.trim().length > 0 && query.length < PROFILE_SEARCH_MIN && (
            <p className="mt-1.5 text-xs text-text-dim">
              Keep typing — {PROFILE_SEARCH_MIN} characters minimum.
            </p>
          )}
          {isFetching && <p className="mt-1.5 text-xs text-text-dim">Searching…</p>}

          {results && results.length > 0 && (
            <ul className="mt-2 max-h-64 overflow-y-auto rounded-md border border-border">
              {results.map(hit => {
                const name = hit.name ?? hit.handle ?? `Profile ${hit.profileId}`;
                const picked = selected.some(r => r.profileId === hit.profileId);
                return (
                  <li key={hit.profileId}>
                    <label className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-sm text-text hover:bg-bg-input">
                      <input
                        type="checkbox"
                        checked={picked}
                        onChange={() => toggle({ profileId: hit.profileId, name })}
                        className="h-4 w-4 cursor-pointer accent-brand"
                      />
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
                      <span className="min-w-0 truncate">{name}</span>
                      {hit.handle && hit.handle !== hit.name && (
                        <span className="shrink-0 text-xs text-text-dim">@{hit.handle}</span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          {results && results.length === 0 && query.length >= PROFILE_SEARCH_MIN && !isFetching && (
            <p className="mt-1.5 text-xs text-text-dim">
              {thisLeagueOnly
                ? "Nobody on a published roster in this league matches that. Uncheck the box above to search everyone."
                : "No profile matches that."}
            </p>
          )}
        </SettingsRow>
      )}

      <div className="flex gap-2">
        <button type="submit" disabled={!canSave || save.isPending} className={ACTION_PRIMARY}>
          {save.isPending ? "Saving…" : isNew ? "Award it" : "Save award"}
        </button>
        <button type="button" onClick={onCancel} className={ACTION}>
          Cancel
        </button>
      </div>

      <ErrorLine message={save.isError ? errorMessage(save.error) : null} />
    </form>
  );
}
