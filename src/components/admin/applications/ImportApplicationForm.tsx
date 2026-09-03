/**
 * The import form: a captain, their team's details, and the roster to stage, entered by a site admin
 * from an external application form's answers.
 *
 * It is deliberately **not** `apply/ApplicationForm.tsx` with a submitter field bolted on. That form
 * writes through the applicant routes, which gate on the caller being the submitter, and it speaks to
 * the captain ("Start my application", "you started it"). This one writes one document through
 * `importApplication` and speaks to the admin about somebody else. The fields and their caps are the
 * same because the application document is the same, and the color swatches, the preview and the
 * role picker are the shared components those forms already use, so the two cannot disagree about a
 * value.
 *
 * The roster is part of the document rather than a second step because that is the shape of the
 * source: a form response is one row with the team and its players on it, and an import that made
 * the admin save the team and then add six people one at a time would be six chances to lose their
 * place in the spreadsheet. Every staged member lands as a `pending` invitation nobody has been
 * messaged about; the card below the form is where the messages are sent.
 *
 * Substitute ordinals are assigned here in list order, silently, for the same reason `InviteMember`
 * assigns them: they order the bench and mean nothing to anybody, and there is no reason to ask for
 * one on a form that already has thirteen fields.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Import, Trash2, UserPlus } from "lucide-react";
import { ACTION_PRIMARY, ACTION_SM, ACTION_SM_DANGER, ColorField, ErrorLine, TeamStylePreview } from "../adminUi";
import { CONTROL_CLASS, LABEL_CLASS } from "../../stats/FilterBar";
import { SettingsRow } from "../../settings/SettingsSection";
import { ImageUpload } from "../../ImageUpload";
import { RolePicker } from "../../apply/InviteMember";
import { identityKey, PersonPicker, toPersonRef, type PickedPerson } from "./PersonPicker";
// `toPersonRef` builds the submitter; members are built per branch in `toImportedMembers` below.
import { queryRoots } from "../../../lib/queries";
import {
  errorMessage,
  hexFromInt,
  importApplication,
  intFromHex,
  refusalOf,
  twitterUrl,
  writeApplicationDetails,
  APPLICATION_CODE_MAX,
  APPLICATION_LOGO_MAX,
  APPLICATION_MESSAGE_MAX,
  APPLICATION_NAME_MAX,
  EXPERIENCE_MAX,
  ORGANIZATION_NAME_MAX,
  SUB_ORDINAL_MAX,
  TWITTER_URL_MAX,
  type ImportedMember,
  type MemberRoleAssignment,
  type TeamApplication,
  type TeamMemberRole,
} from "../../../lib/api";

interface Props {
  conf: string;
  onDone: (message: string) => void;
}

/** One row of the roster being staged. `key` is local, for React; nothing about it is sent. */
interface StagedMember {
  key: number;
  person: PickedPerson | null;
  roles: TeamMemberRole[];
}

const ADMIN_OWNER_NOTE =
  "Owner is how the league records who runs the team. Control of the application stays with the submitter above regardless.";

export function ImportApplicationForm({ conf, onDone }: Props) {
  const qc = useQueryClient();

  const [submitter, setSubmitter] = useState<PickedPerson | null>(null);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [logo, setLogo] = useState("");
  const [primary, setPrimary] = useState(hexFromInt(null, "#d20708"));
  const [secondary, setSecondary] = useState(hexFromInt(null, "#ffffff"));
  const [organization, setOrganization] = useState("");
  const [twitter, setTwitter] = useState("");
  const [experience, setExperience] = useState("");
  const [message, setMessage] = useState("");
  const [rulesRead, setRulesRead] = useState(false);
  const [ticketOpened, setTicketOpened] = useState(false);

  const [members, setMembers] = useState<StagedMember[]>([]);
  const [nextKey, setNextKey] = useState(1);

  const trimmedName = name.trim();
  const trimmedCode = code.trim();
  const trimmedLogo = logo.trim();
  const trimmedMessage = message.trim();

  // Identity keys already on the form, so the picker can mark a repeat. The submitter counts: they
  // are routinely also a player, and marking rather than hiding is what lets the admin add them.
  const taken = new Set<string>(
    [submitter, ...members.map(m => m.person)].flatMap(p => (p ? [identityKey(p.identity)] : [])),
  );
  const incomplete = members.filter(m => m.person === null || m.roles.length === 0);

  const canSave =
    trimmedName !== "" && trimmedCode !== "" && submitter !== null && incomplete.length === 0;

  const save = useMutation({
    mutationFn: () => {
      if (submitter === null) return Promise.reject(new Error("Pick a submitter first."));
      return importApplication(conf, {
        submitter: toPersonRef(submitter.identity),
        application: {
          name: trimmedName,
          code: trimmedCode,
          // Upstream reads `null` as "no logo" and refuses an empty string.
          logo: trimmedLogo === "" ? null : trimmedLogo,
          color: intFromHex(primary),
          colorSecondary: intFromHex(secondary),
          // A fresh document, so there is nothing to preserve; `writeApplicationDetails` is used
          // anyway so the keys are the ones the applicant's card and the review queue read.
          applicationMetadata: writeApplicationDetails(
            {},
            {
              organizationName: organization.trim() === "" ? null : organization.trim(),
              twitter: twitterUrl(twitter),
              experience: experience.trim() === "" ? null : experience.trim(),
              rulesAcknowledged: rulesRead,
              ticketOpened,
            },
          ),
          message: trimmedMessage === "" ? null : trimmedMessage,
        },
        members: toImportedMembers(members),
      });
    },
    onSuccess: async (result: TeamApplication) => {
      await qc.invalidateQueries({ queryKey: queryRoots.applications });
      const count = result.members?.length ?? members.length;
      onDone(
        `Imported ${result.teamName} for ${submitter?.name ?? "the submitter"}. ${
          count === 0
            ? "Nobody is on the roster yet."
            : `${count} invitation${count === 1 ? " is" : "s are"} staged; nobody has been messaged.`
        }`,
      );
    },
  });

  const refusal = save.isError ? refusalOf(save.error) : null;

  const addMember = () => {
    setMembers(current => [...current, { key: nextKey, person: null, roles: [] }]);
    setNextKey(k => k + 1);
  };

  const updateMember = (key: number, patch: Partial<Omit<StagedMember, "key">>) =>
    setMembers(current => current.map(m => (m.key === key ? { ...m, ...patch } : m)));

  return (
    <form
      className="rounded-lg border border-border bg-bg3 p-4"
      onSubmit={e => {
        e.preventDefault();
        if (canSave && !save.isPending) save.mutate();
      }}
    >
      <SettingsRow
        label="Submitter"
        hint="The captain. The application is theirs from the moment it exists: it appears on their My applications page, and only they can edit, submit or withdraw it. If they also play, add them to the roster below as well."
      >
        <PersonPicker id="import-submitter" value={submitter} onChange={setSubmitter} taken={taken} />
      </SettingsRow>

      <SettingsRow
        label="Team name"
        hint={`As it should appear in the standings. Up to ${APPLICATION_NAME_MAX} characters.`}
      >
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={APPLICATION_NAME_MAX}
          aria-label="Team name"
          className={CONTROL_CLASS}
        />
      </SettingsRow>

      <SettingsRow
        label="Tag"
        hint={`Up to ${APPLICATION_CODE_MAX} characters, unique in this league.`}
      >
        <input
          value={code}
          onChange={e => setCode(e.target.value)}
          maxLength={APPLICATION_CODE_MAX}
          aria-label="Tag"
          className={`${CONTROL_CLASS} font-mono`}
        />
      </SettingsRow>

      <SettingsRow label="Logo" hint="Optional. The captain can add or replace it from their own page later.">
        <ImageUpload value={logo} onChange={setLogo} maxLength={APPLICATION_LOGO_MAX} label="Logo" />
      </SettingsRow>

      <SettingsRow label="Primary Color">
        <ColorField id="import-primary-color" value={primary} onChange={setPrimary} />
      </SettingsRow>

      <SettingsRow label="Secondary Color">
        <ColorField id="import-secondary-color" value={secondary} onChange={setSecondary} />
      </SettingsRow>

      <SettingsRow label="Preview" hint="How the pair reads on a team card. Updates as you type.">
        <TeamStylePreview name={name} code={code} logo={logo} primary={primary} secondary={secondary} />
      </SettingsRow>

      <SettingsRow label="Organization" hint="Optional. The org behind the team, if the form named one.">
        <input
          value={organization}
          onChange={e => setOrganization(e.target.value)}
          maxLength={ORGANIZATION_NAME_MAX}
          aria-label="Organization"
          className={CONTROL_CLASS}
        />
      </SettingsRow>

      <SettingsRow label="Twitter / X" hint="Optional. A link or a handle; a bare handle is saved as a link.">
        <input
          value={twitter}
          onChange={e => setTwitter(e.target.value)}
          maxLength={TWITTER_URL_MAX}
          placeholder="@team"
          aria-label="Twitter or X account"
          className={CONTROL_CLASS}
        />
        {twitterUrl(twitter) !== null && twitterUrl(twitter) !== twitter.trim() && (
          <p className="mt-1.5 font-mono text-xs text-text-dim">Saved as {twitterUrl(twitter)}</p>
        )}
      </SettingsRow>

      <SettingsRow
        label="Experience and accomplishments"
        hint="Optional. Paste the form's answer as written; reviewers read it verbatim."
      >
        <textarea
          value={experience}
          onChange={e => setExperience(e.target.value)}
          maxLength={EXPERIENCE_MAX}
          rows={5}
          aria-label="Experience and accomplishments"
          className={CONTROL_CLASS}
        />
      </SettingsRow>

      <SettingsRow
        label="Applicant's note to staff"
        hint="Optional. Shown to reviewers as the applicant's own message, so keep it to what they wrote."
      >
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          maxLength={APPLICATION_MESSAGE_MAX}
          rows={3}
          aria-label="Applicant's note to staff"
          className={CONTROL_CLASS}
        />
      </SettingsRow>

      {/* The two client-side blockers on Submit. They record what the captain confirmed on the
          external form, not what the admin thinks; left unticked, the captain ticks them on their own
          page before they can submit, which is the right place for an answer nobody gave. */}
      <SettingsRow
        label="Confirmed on the external form"
        hint="Both are required before the captain can submit. Tick only what the form actually recorded; anything left unticked they confirm themselves."
      >
        <div className="flex flex-col gap-2">
          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-text">
            <input
              type="checkbox"
              checked={rulesRead}
              onChange={e => setRulesRead(e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-brand"
            />
            They confirmed they have read the league rules
          </label>
          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-text">
            <input
              type="checkbox"
              checked={ticketOpened}
              onChange={e => setTicketOpened(e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-brand"
            />
            They confirmed they opened a team-apps ticket in the Discord
          </label>
        </div>
      </SettingsRow>

      <div className="mb-5">
        <div className="flex items-center justify-between gap-2">
          <span className={LABEL_CLASS}>Roster</span>
          <button type="button" onClick={addMember} className={ACTION_SM}>
            <UserPlus size={13} aria-hidden="true" />
            Add a person
          </button>
        </div>

        {members.length === 0 ? (
          <p className="text-sm text-text-dim">
            Nobody yet. The application can be imported without a roster; the captain invites people
            from their own page in that case.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {members.map((member, index) => (
              <li key={member.key} className="rounded-md border border-border bg-bg2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-heading text-xs text-text-secondary">Person {index + 1}</span>
                  <button
                    type="button"
                    onClick={() => setMembers(current => current.filter(m => m.key !== member.key))}
                    title="Remove from the roster"
                    className={ACTION_SM_DANGER}
                  >
                    <Trash2 size={13} aria-hidden="true" />
                    Remove
                  </button>
                </div>
                <div className="mt-2">
                  <PersonPicker
                    id={`import-member-${member.key}`}
                    value={member.person}
                    onChange={person => updateMember(member.key, { person })}
                    taken={taken}
                  />
                </div>
                <RolePicker
                  roles={member.roles}
                  onToggle={role =>
                    updateMember(member.key, {
                      roles: member.roles.includes(role)
                        ? member.roles.filter(r => r !== role)
                        : [...member.roles, role],
                    })
                  }
                  ownerNote={ADMIN_OWNER_NOTE}
                />
              </li>
            ))}
          </ul>
        )}

        <p className="mt-1.5 text-xs text-text-dim">
          Everyone here is staged as a pending invitation from the submitter. They can see and answer
          it in their inbox on the site right away; nobody is messaged on Discord until you press Send
          invites on the team's card below.
        </p>
      </div>

      <button type="submit" disabled={!canSave || save.isPending} className={ACTION_PRIMARY}>
        <Import size={15} aria-hidden="true" />
        {save.isPending ? "Importing…" : "Import application"}
      </button>

      {!save.isPending && !canSave && (
        <p className="mt-2 text-xs text-text-dim">
          {submitter === null
            ? "Pick a submitter."
            : trimmedName === "" || trimmedCode === ""
              ? "A team name and a tag are required."
              : `${incomplete.length} roster ${incomplete.length === 1 ? "entry" : "entries"} still ${
                  incomplete.length === 1 ? "needs" : "need"
                } a person and a position.`}
        </p>
      )}

      {refusal ? (
        <div role="alert" className="mt-2">
          <p className="text-sm text-ccs-red">{refusal.message}</p>
          {refusal.issues.length > 0 && (
            <ul className="mt-1.5 list-disc pl-5 text-xs text-ccs-red">
              {refusal.issues.map(issue => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <ErrorLine message={save.isError ? errorMessage(save.error) : null} />
      )}
    </form>
  );
}

/**
 * The staged rows as the wire wants them, with bench ordinals assigned in list order.
 *
 * Only substitutes take a nonzero ordinal and upstream `400`s on any other role carrying one. A sixth
 * substitute lands on the cap rather than refusing here; the readiness checklist on the captain's
 * page says "five at most", which is the place that rule is explained.
 */
function toImportedMembers(members: readonly StagedMember[]): ImportedMember[] {
  let subs = 0;
  return members.flatMap(member => {
    if (member.person === null) return [];
    const roles: MemberRoleAssignment[] = member.roles.map(role => ({
      role,
      ordinal: role === "sub" ? Math.min(subs++, SUB_ORDINAL_MAX) : 0,
    }));
    // Built as a literal per branch rather than spread from `toPersonRef`, so the one-of-two rule in
    // `InvitationInput` is checked against a concrete shape.
    const identity = member.person.identity;
    return [
      identity.kind === "discord"
        ? { discordUserId: identity.userId, roles }
        : { profileId: identity.profileId, roles },
    ];
  });
}
