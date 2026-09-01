/**
 * League Admin → Teams. The roster desk: who plays for whom, and what a team is called.
 *
 * **Rosters lead and branding hides behind a button**, which is the opposite of how the team
 * document is shaped and deliberate: a name, a tag and two colors are chosen once a season, while a
 * roster moves every week — substitutions, late signings, a support who stopped showing up. The
 * screen is laid out around the thing that changes.
 *
 * It reads the public `GET /teams/:conf` rather than a credentialed projection of the same row.
 * That read already carries every editable column — both colors, the owner, the contacts, the five
 * starters and the bench — and a team only exists after publication, which is also what lists the
 * conference, so there is nothing here a hidden-league read would answer better. See
 * `lib/api/teamAdmin.ts`, which owns the writes and nothing else.
 *
 * **The writes it calls do not exist upstream yet** — `league-admin-teams-api-spec.md` is the
 * proposal. Until they land the page reads correctly and every save returns a `404`, which
 * `ErrorLine` shows verbatim.
 *
 * Scope is `roster`, narrower than the page's own gate: a grant carrying only `roster` reaches this
 * section and nothing else, and a viewer without it sees the same rosters read-only rather than a
 * set of controls that answer `403`. `hasScope` reads an empty list as "cannot tell" — see its
 * header for why that is the safe direction.
 *
 * Teams render in the order served, which is by code. Nothing here re-sorts them: the read is
 * shared with the public Teams view and two orders for one list is how they start disagreeing.
 */

import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronRight, Pencil, Plus, X } from "lucide-react";
import {
  ACTION,
  ACTION_PRIMARY,
  ACTION_SM,
  ColorField,
  ErrorLine,
  TeamStylePreview,
} from "../../admin/adminUi";
import { CONTROL_CLASS } from "../../stats/FilterBar";
import { SettingsRow } from "../../settings/SettingsSection";
import { ImageUpload } from "../../ImageUpload";
import { Toast } from "../../Toast";
import { ROLE_LABEL, STARTER_ROLES } from "../../apply/applyUi";
import { PlayerList, PlayerSlot, playerLabel, type PickedPlayer } from "./PlayerPicker";
import { useAdminAccess } from "../../../lib/adminAccess";
import { queries, queryRoots } from "../../../lib/queries";
import {
  createTeam,
  errorMessage,
  hasScope,
  hexFromInt,
  intFromHex,
  updateTeam,
  TEAM_CODE_MAX,
  TEAM_LOGO_MAX,
  TEAM_NAME_MAX,
  TEAM_SUBS_MAX,
  type TeamRecord,
  type TeamRosterInput,
} from "../../../lib/api";

/**
 * Lane names come from the applicant vocabulary rather than a second copy here.
 *
 * `applyUi` is written for players and this screen for staff, and the two do word some things
 * differently — but a position is a position, and "Jungle" spelled twice is one place for them to
 * drift apart over nothing. `STARTER_ROLES` is already in lane order.
 */
const STARTERS = STARTER_ROLES;

export function TeamsSection() {
  // From the route, like every other league section — the registry in `LeagueAdmin` is just data.
  const { conf = "" } = useParams();
  const { isSiteAdmin, leagues } = useAdminAccess();
  const [saved, setSaved] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const { data, isPending, error } = useQuery(queries.teamsForConf(conf));
  const teams = data ?? [];

  const canEdit = isSiteAdmin || hasScope(leagues.find(l => l.conf === conf), "roster");

  if (isPending) return <p className="text-text-dim">Loading teams…</p>;

  return (
    <div className="flex flex-col gap-5">
      {error && <ErrorLine message={`Couldn't load this league's teams: ${errorMessage(error)}`} />}

      {canEdit &&
        (creating ? (
          <section className="rounded-lg border border-border bg-bg2 p-5">
            <h3 className="font-display text-[18px] tracking-widest text-text-bright">
              NEW TEAM
            </h3>
            {/* Says what this is *not*, because the other way in is the one people expect. An
                approved application becomes a team through publication, which writes the whole
                field at once; this is the hand-built exception beside it. */}
            <p className="mt-1 text-sm text-text-secondary">
              For a team the league is adding directly. An approved application becomes a team when
              you publish the season, not here. You'll fill the roster in afterwards.
            </p>
            <div className="mt-4">
              <TeamDetailsForm
                conf={conf}
                team={null}
                onDone={message => {
                  setCreating(false);
                  setSaved(message);
                }}
                onCancel={() => setCreating(false)}
              />
            </div>
          </section>
        ) : (
          <div>
            <button type="button" onClick={() => setCreating(true)} className={ACTION}>
              <Plus size={15} aria-hidden="true" />
              Add a team
            </button>
          </div>
        ))}

      {teams.length === 0 ? (
        <p className="text-text-dim">
          This league has no teams yet. They arrive when the season's approved applications are
          published — see Team Applications — or you can add one directly above.
        </p>
      ) : (
        teams.map(team => (
          <TeamCard
            key={team.id}
            conf={conf}
            team={team}
            canEdit={canEdit}
            onSaved={setSaved}
          />
        ))
      )}

      <Toast message={saved} onClose={() => setSaved(null)} />
    </div>
  );
}

// -------------------------------------------------------------------- one team

interface CardProps {
  conf: string;
  team: TeamRecord;
  canEdit: boolean;
  onSaved: (message: string) => void;
}

/** Every roster position a team has, as people rather than as ids. */
interface RosterDraft {
  owner: PickedPlayer | null;
  contacts: PickedPlayer[];
  top: PickedPlayer | null;
  jg: PickedPlayer | null;
  mid: PickedPlayer | null;
  bot: PickedPlayer | null;
  sup: PickedPlayer | null;
  subs: PickedPlayer[];
}

function draftFrom(team: TeamRecord): RosterDraft {
  return {
    // `owner` and `contacts` are optional on the read — absent means a deployment without the
    // columns, which is not the same as nobody — but an editor has to offer the field either way,
    // and sending what it shows is correct in both cases.
    owner: team.owner ?? null,
    contacts: [...(team.contacts ?? [])],
    top: team.top,
    jg: team.jg,
    mid: team.mid,
    bot: team.bot,
    sup: team.sup,
    subs: [...team.subs],
  };
}

/**
 * The draft as the wire sees it — which is also how it is compared.
 *
 * One function for both jobs on purpose: a dirty check that read different fields from the save
 * would let an edit look clean and go unsent, or the reverse. Key order is fixed, so stringifying
 * two of these is a sound equality test.
 */
function rosterInput(draft: RosterDraft): TeamRosterInput {
  return {
    owner: draft.owner?.profileId ?? null,
    contacts: draft.contacts.map(p => p.profileId),
    top: draft.top?.profileId ?? null,
    jg: draft.jg?.profileId ?? null,
    mid: draft.mid?.profileId ?? null,
    bot: draft.bot?.profileId ?? null,
    sup: draft.sup?.profileId ?? null,
    subs: draft.subs.map(p => p.profileId),
  };
}

/** Everyone holding a *playing* position — the set a person may appear in only once. */
function playingSlots(draft: RosterDraft): PickedPlayer[] {
  return [draft.top, draft.jg, draft.mid, draft.bot, draft.sup, ...draft.subs].filter(
    (p): p is PickedPlayer => p !== null,
  );
}

function TeamCard({ conf, team, canEdit, onSaved }: CardProps) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  const [draft, setDraft] = useState<RosterDraft>(() => draftFrom(team));

  const server = draftFrom(team);
  const dirty = JSON.stringify(rosterInput(draft)) !== JSON.stringify(rosterInput(server));

  // A profile in two playing positions is refused by the database's own guard, so catching it here
  // is a courtesy that names the person instead of surfacing a constraint. Administrative roles are
  // not included: the owner is routinely also the mid laner.
  const playing = playingSlots(draft);
  const doubled = playing.filter(
    (p, i) => playing.findIndex(other => other.profileId === p.profileId) !== i,
  );

  // Everybody attached to this team in any capacity, so a search result can say so. Wider than
  // `playing` on purpose: it is a note, not a rule, and seeing "on this team" beside the contact
  // you are about to make the support is the useful version.
  const placed = new Set(
    [...playing, ...(draft.owner ? [draft.owner] : []), ...draft.contacts].map(p => p.profileId),
  );

  const save = useMutation({
    mutationFn: () => updateTeam(conf, team.id, rosterInput(draft)),
    onSuccess: async (result: TeamRecord) => {
      // `standings` as well as `teams`: the standings table carries each team's name and code, so a
      // rename that refreshed only this list would leave the public table showing the old one.
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryRoots.teams }),
        qc.invalidateQueries({ queryKey: queryRoots.standings }),
      ]);
      onSaved(`Saved ${result.name}'s roster.`);
    },
  });

  return (
    <section className="rounded-lg border border-border bg-bg2 p-5">
      <header className="flex flex-wrap items-center gap-3">
        {team.logo ? (
          <img src={team.logo} alt="" className="h-10 w-10 shrink-0 rounded bg-bg3 object-contain" />
        ) : (
          <div className="h-10 w-10 shrink-0 rounded border border-border bg-bg3" />
        )}
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-[20px] leading-none tracking-widest text-text-bright">
            {team.name.toUpperCase()}
          </h3>
          <p className="mt-1 font-mono text-xs text-text-secondary">{team.code}</p>
        </div>
        <Swatches primary={team.color} secondary={team.colorSecondary ?? null} />
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          className={ACTION_SM}
        >
          {open ? (
            <ChevronDown size={13} aria-hidden="true" />
          ) : (
            <ChevronRight size={13} aria-hidden="true" />
          )}
          {canEdit ? "Edit roster" : "Roster"}
        </button>
        {canEdit && (
          <button
            type="button"
            onClick={() => setEditingDetails(v => !v)}
            className={ACTION_SM}
          >
            <Pencil size={13} aria-hidden="true" />
            Team details
          </button>
        )}
      </header>

      {/* The one line that makes the list scannable without expanding anything. */}
      {!open && <RosterLine draft={server} />}

      {editingDetails && (
        <div className="mt-4">
          <TeamDetailsForm
            conf={conf}
            team={team}
            onDone={message => {
              setEditingDetails(false);
              onSaved(message);
            }}
            onCancel={() => setEditingDetails(false)}
          />
        </div>
      )}

      {open && (
        <div className="mt-5 flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {STARTERS.map(role => (
              <PlayerSlot
                key={role}
                conf={conf}
                label={ROLE_LABEL[role]}
                value={draft[role]}
                placed={placed}
                editable={canEdit}
                onChange={player => setDraft(d => ({ ...d, [role]: player }))}
              />
            ))}
          </div>

          <PlayerList
            conf={conf}
            label="Substitutes"
            values={draft.subs}
            placed={placed}
            editable={canEdit}
            max={TEAM_SUBS_MAX}
            onChange={subs => setDraft(d => ({ ...d, subs }))}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <PlayerSlot
              conf={conf}
              label="Owner"
              value={draft.owner}
              placed={placed}
              editable={canEdit}
              onChange={owner => setDraft(d => ({ ...d, owner }))}
            />
            <PlayerList
              conf={conf}
              label="Contacts"
              values={draft.contacts}
              placed={placed}
              editable={canEdit}
              hint="Who the league writes to. Usually the owner, and often more than one person."
              onChange={contacts => setDraft(d => ({ ...d, contacts }))}
            />
          </div>

          {doubled.length > 0 && (
            <p className="text-sm text-ccs-orange">
              {doubled.map(playerLabel).join(", ")} is in two playing positions. Somebody can be
              owner or a contact as well as a player, but only ever one position.
            </p>
          )}

          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!dirty || doubled.length > 0 || save.isPending}
                onClick={() => save.mutate()}
                className={ACTION_PRIMARY}
              >
                <Check size={15} aria-hidden="true" />
                {save.isPending ? "Saving…" : "Save roster"}
              </button>
              <button
                type="button"
                disabled={!dirty || save.isPending}
                onClick={() => setDraft(draftFrom(team))}
                className={ACTION}
              >
                <X size={15} aria-hidden="true" />
                Discard changes
              </button>
            </div>
          )}

          <ErrorLine message={save.isError ? errorMessage(save.error) : null} />
        </div>
      )}
    </section>
  );
}

/** The roster in one line, for the collapsed card: the five positions, then how deep the bench is. */
function RosterLine({ draft }: { draft: RosterDraft }) {
  const anyFilled = STARTERS.some(role => draft[role] !== null);

  return (
    <p className="mt-3 text-sm text-text-secondary">
      {!anyFilled ? (
        <span className="text-text-dim">No starters set.</span>
      ) : (
        STARTERS.map(role => {
          const player = draft[role];
          return (
            <span key={role} className="mr-3 inline-block whitespace-nowrap">
              <span className="text-text-dim">{ROLE_LABEL[role]} </span>
              {player ? playerLabel(player) : <span className="text-ccs-orange">empty</span>}
            </span>
          );
        })
      )}
      {draft.subs.length > 0 && (
        <span className="text-text-dim">
          · {draft.subs.length} on the bench
        </span>
      )}
    </p>
  );
}

// ------------------------------------------------------------------- branding

interface DetailsProps {
  conf: string;
  /** The team being edited, or `null` to create one. */
  team: TeamRecord | null;
  onDone: (message: string) => void;
  onCancel: () => void;
}

/**
 * Name, tag, logo and the two colors — the half of a team that barely moves.
 *
 * Create sends the complete document with an empty roster, because a team's identity is decided
 * before its players are and the roster editor above is a better place to fill one in than a form
 * with thirteen fields. Edit sends only what this form owns: the patch leaves the roster alone, so
 * saving branding can never clobber a signing somebody made in the other panel.
 */
function TeamDetailsForm({ conf, team, onDone, onCancel }: DetailsProps) {
  const qc = useQueryClient();
  const isNew = team === null;

  const [name, setName] = useState(team?.name ?? "");
  const [code, setCode] = useState(team?.code ?? "");
  const [logo, setLogo] = useState(team?.logo ?? "");
  const [primary, setPrimary] = useState(hexFromInt(team?.color ?? null, "#d20708"));
  const [secondary, setSecondary] = useState(
    hexFromInt(team?.colorSecondary ?? null, "#ffffff"),
  );

  const trimmedName = name.trim();
  const trimmedCode = code.trim();
  const trimmedLogo = logo.trim();

  const save = useMutation({
    mutationFn: () => {
      const branding = {
        name: trimmedName,
        code: trimmedCode,
        // `null` clears it upstream; an empty string is refused.
        logo: trimmedLogo === "" ? null : trimmedLogo,
        color: intFromHex(primary),
        colorSecondary: intFromHex(secondary),
      };
      return team === null
        ? createTeam(conf, {
          ...branding,
          owner: null,
          contacts: [],
          top: null,
          jg: null,
          mid: null,
          bot: null,
          sup: null,
          subs: [],
        })
        : updateTeam(conf, team.id, branding);
    },
    onSuccess: async (result: TeamRecord) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryRoots.teams }),
        qc.invalidateQueries({ queryKey: queryRoots.standings }),
      ]);
      onDone(isNew ? `Added ${result.name}.` : `Saved ${result.name}.`);
    },
  });

  const canSave = trimmedName !== "" && trimmedCode !== "";
  const renamingCode = team !== null && trimmedCode !== "" && trimmedCode !== team.code;

  return (
    <form
      className="rounded-lg border border-border bg-bg3 p-4"
      onSubmit={e => {
        e.preventDefault();
        if (canSave && !save.isPending) save.mutate();
      }}
    >
      <SettingsRow
        label="Team name"
        hint={`As it should appear in the standings. Up to ${TEAM_NAME_MAX} characters.`}
      >
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={TEAM_NAME_MAX}
          aria-label="Team name"
          className={CONTROL_CLASS}
        />
      </SettingsRow>

      <SettingsRow
        label="Tag"
        hint={`The short form on scoreboards and brackets. Up to ${TEAM_CODE_MAX} characters, unique in this league.`}
      >
        <input
          value={code}
          onChange={e => setCode(e.target.value)}
          maxLength={TEAM_CODE_MAX}
          aria-label="Tag"
          className={`${CONTROL_CLASS} font-mono`}
        />
      </SettingsRow>

      {/* Not a hint on the field, because it only applies to one edit and it is the expensive kind
          of mistake: the stats tables record a team by its code, so a tag changed mid-season leaves
          the games already played behind under the old one. Worth saying out loud, once. */}
      {renamingCode && (
        <p className="-mt-3 mb-5 text-xs text-ccs-orange">
          Changing the tag from <span className="font-mono">{team.code}</span> to{" "}
          <span className="font-mono">{trimmedCode}</span> after games have been played can detach
          this team from the statistics already recorded against the old one.
        </p>
      )}

      <SettingsRow label="Logo" hint="A square image works best.">
        <ImageUpload value={logo} onChange={setLogo} maxLength={TEAM_LOGO_MAX} label="Logo" />
      </SettingsRow>

      <SettingsRow
        label="Primary Color"
        hint="The team's primary color for content, embeds, and the website."
      >
        <ColorField id={`primary-${team?.id ?? "new"}`} value={primary} onChange={setPrimary} />
      </SettingsRow>

      <SettingsRow
        label="Secondary Color"
        hint="The accent beside the primary color."
      >
        <ColorField
          id={`secondary-${team?.id ?? "new"}`}
          value={secondary}
          onChange={setSecondary}
        />
      </SettingsRow>

      <SettingsRow label="Preview" hint="How the pair reads on the badge and across a team card.">
        <TeamStylePreview name={name} code={code} logo={logo} primary={primary} secondary={secondary} />
      </SettingsRow>

      <div className="flex gap-2">
        <button type="submit" disabled={!canSave || save.isPending} className={ACTION_PRIMARY}>
          {isNew ? <Plus size={15} aria-hidden="true" /> : <Check size={15} aria-hidden="true" />}
          {save.isPending ? "Saving…" : isNew ? "Add team" : "Save details"}
        </button>
        <button type="button" onClick={onCancel} className={ACTION}>
          Cancel
        </button>
      </div>

      <ErrorLine message={save.isError ? errorMessage(save.error) : null} />
    </form>
  );
}

/**
 * A team's two colors.
 *
 * Inline `backgroundColor` rather than a utility, for the same reason `TeamBadge` uses one: this is
 * data off the wire, so there is no `@theme` token for it and Tailwind cannot express it.
 */
function Swatches({ primary, secondary }: { primary: number | null; secondary: number | null }) {
  if (primary === null && secondary === null) return null;
  return (
    <span className="flex shrink-0 items-center gap-1" aria-label="Team colors">
      {[primary, secondary].map((color, i) =>
        color === null ? null : (
          <span
            key={i}
            title={hexFromInt(color)}
            className="h-5 w-5 rounded border border-border3"
            style={{ backgroundColor: hexFromInt(color) }}
          />
        ),
      )}
    </span>
  );
}
