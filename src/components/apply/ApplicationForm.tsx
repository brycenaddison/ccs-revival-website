/**
 * A proposed team's details — name, tag, logo, colors, and a note to the staff.
 *
 * One form for both create and replace, because upstream takes **one document** for both: the same
 * strict seven keys, and `PUT` is a complete replacement rather than a patch. A new application
 * starts with an **empty roster** — the captain invites everybody, themselves included — so nothing
 * here says anything about who owns it.
 *
 * Saving a **rejected** application returns it to `draft` and clears the previous decision. That is
 * upstream's behavior, not something this form arranges, and it is the whole reason a rejection is
 * presented as "changes needed" — see `applyUi.tsx`.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus } from "lucide-react";
import { ACTION, ACTION_PRIMARY, ColorField, ErrorLine, TeamStylePreview } from "../admin/adminUi";
import { CONTROL_CLASS } from "../stats/FilterBar";
import { SettingsRow } from "../settings/SettingsSection";
import { ImageUpload } from "../ImageUpload";
import { queries, queryRoots } from "../../lib/queries";
import { DISCORD_INVITE } from "../../lib/siteLinks";
import {
  createApplication,
  errorMessage,
  hexFromInt,
  intFromHex,
  readApplicationDetails,
  replaceApplication,
  twitterUrl,
  writeApplicationDetails,
  APPLICATION_CODE_MAX,
  APPLICATION_LOGO_MAX,
  APPLICATION_MESSAGE_MAX,
  APPLICATION_NAME_MAX,
  EXPERIENCE_MAX,
  ORGANIZATION_NAME_MAX,
  TWITTER_URL_MAX,
  type TeamApplication,
} from "../../lib/api";

interface Props {
  conf: string;
  /** The application being edited, or `null` to start one. */
  application?: TeamApplication | null;
  onDone: (message: string) => void;
  onCancel?: () => void;
}

/*
 * Both colors are required, so there is no clearing and no empty state to represent.
 *
 * That is what removed the "Set" checkbox each one used to carry: `<input type="color">` always
 * reports a value, and the checkbox existed only to distinguish "no color chosen" from "chose
 * black" — a distinction that stops mattering once a team must have both. An application saved
 * before they were required arrives with `null`, which seeds a default rather than an empty control.
 *
 * The hex-to-integer conversion and its pure-black nudge are `intFromHex` in the API layer, beside
 * the `hexFromInt` this form reads with — League Admin → Teams edits the same two columns and the
 * two forms must not disagree about what black means.
 */

export function ApplicationForm({ conf, application = null, onDone, onCancel }: Props) {
  const qc = useQueryClient();
  const isNew = application === null;

  const [name, setName] = useState(application?.teamName ?? "");
  const [code, setCode] = useState(application?.teamCode ?? "");
  const [logo, setLogo] = useState(application?.logo ?? "");
  const [primary, setPrimary] = useState(hexFromInt(application?.color ?? null, "#d20708"));
  const [secondary, setSecondary] = useState(
    hexFromInt(application?.colorSecondary ?? null, "#ffffff"),
  );
  const [message, setMessage] = useState(application?.applicantMessage ?? "");

  // The supplementary questions live inside `applicationMetadata`, whose schema is this client's own —
  // see `readApplicationDetails`. Read once into local state so the form is a form and not a series of
  // lookups into an opaque object.
  const existing = application?.applicationMetadata ?? {};
  const seeded = readApplicationDetails(existing);
  const [organization, setOrganization] = useState(seeded.organizationName ?? "");
  const [twitter, setTwitter] = useState(seeded.twitter ?? "");
  const [experience, setExperience] = useState(seeded.experience ?? "");
  const [rulesRead, setRulesRead] = useState(seeded.rulesAcknowledged);
  const [ticketOpened, setTicketOpened] = useState(seeded.ticketOpened);

  const trimmedName = name.trim();
  const trimmedCode = code.trim();
  const trimmedLogo = logo.trim();
  const trimmedMessage = message.trim();

  const save = useMutation({
    mutationFn: () => {
      const document = {
        name: trimmedName,
        code: trimmedCode,
        // Upstream reads `null` as "no logo" and refuses an empty string, so an emptied box has to
        // become `null`.
        logo: trimmedLogo === "" ? null : trimmedLogo,
        color: intFromHex(primary),
        colorSecondary: intFromHex(secondary),
        // Merged over what was there rather than rebuilt: `PUT` replaces the whole application
        // document, so a question this build doesn't know about would be erased by a save. See
        // `writeApplicationDetails`.
        applicationMetadata: writeApplicationDetails(existing, {
          organizationName: organization.trim() === "" ? null : organization.trim(),
          twitter: twitterUrl(twitter),
          experience: experience.trim() === "" ? null : experience.trim(),
          rulesAcknowledged: rulesRead,
          ticketOpened,
        }),
        message: trimmedMessage === "" ? null : trimmedMessage,
      };
      return application === null
        ? createApplication(conf, document)
        : replaceApplication(conf, application.id, document);
    },
    onSuccess: async (result: TeamApplication) => {
      await qc.invalidateQueries({ queryKey: queryRoots.applications });
      onDone(isNew ? `Started ${result.teamName}.` : `Saved ${result.teamName}.`);
    },
  });

  const canSave = trimmedName !== "" && trimmedCode !== "";

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
        hint={`The full name, as it should appear in the standings. Up to ${APPLICATION_NAME_MAX} characters.`}
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
        hint={`The short form used on scoreboards and brackets, e.g. “TSM”. Up to ${APPLICATION_CODE_MAX} characters, capitalized however you like, and it has to be unique in this league.`}
      >
        <input
          value={code}
          onChange={e => setCode(e.target.value)}
          maxLength={APPLICATION_CODE_MAX}
          aria-label="Tag"
          className={`${CONTROL_CLASS} font-mono`}
        />
      </SettingsRow>

      <SettingsRow
        label="Logo"
        hint="A square image with transparent background is recommended."
      >
        <ImageUpload
          value={logo}
          onChange={setLogo}
          maxLength={APPLICATION_LOGO_MAX}
          label="Logo"
        />
      </SettingsRow>

      <SettingsRow
        label="Primary Color"
        hint="Your team's main color. Required."
      >
        <ColorField id="primary-color" value={primary} onChange={setPrimary} />
      </SettingsRow>

      <SettingsRow
        label="Secondary Color"
        hint="Your team's accent color. Required."
      >
        <ColorField id="secondary-color" value={secondary} onChange={setSecondary} />
      </SettingsRow>

      {/* Drawn from the same gradient recipe the site uses, so what reads badly here reads badly on
          the standings too — which is the moment to change it, not after publication. */}
      <SettingsRow
        label="Preview"
        hint="How the pair reads on your badge and across a team card. Updates as you type."
      >
        <TeamStylePreview name={name} code={code} logo={logo} primary={primary} secondary={secondary} />
      </SettingsRow>

      <SettingsRow
        label="Organization"
        hint="The org behind the team, if there is one."
      >
        <input
          value={organization}
          onChange={e => setOrganization(e.target.value)}
          maxLength={ORGANIZATION_NAME_MAX}
          aria-label="Organization"
          className={CONTROL_CLASS}
        />
      </SettingsRow>

      <SettingsRow
        label="Twitter / X"
        hint="A link or a handle. Optional, and it's for the league to find you, not a requirement to have one."
      >
        <input
          value={twitter}
          onChange={e => setTwitter(e.target.value)}
          maxLength={TWITTER_URL_MAX}
          placeholder="@yourteam"
          aria-label="Twitter or X account"
          className={CONTROL_CLASS}
        />
        {/* Shown because the field rewrites what was typed: a bare handle becomes a URL, and seeing
            that before saving is better than discovering it afterwards. */}
        {twitterUrl(twitter) !== null && twitterUrl(twitter) !== twitter.trim() && (
          <p className="mt-1.5 font-mono text-xs text-text-dim">
            Saved as {twitterUrl(twitter)}
          </p>
        )}
      </SettingsRow>

      <SettingsRow
        label="Experience and accomplishments"
        hint="Other leagues you've played, placements, how long the org has been around, etc. Optional."
      >
        <textarea
          value={experience}
          onChange={e => setExperience(e.target.value)}
          maxLength={EXPERIENCE_MAX}
          rows={6}
          aria-label="Experience and accomplishments"
          className={CONTROL_CLASS}
        />
      </SettingsRow>

      <SettingsRow
        label="Note for the league staff"
        hint="Anything staff should know while reviewing. Optional."
      >
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          maxLength={APPLICATION_MESSAGE_MAX}
          rows={3}
          aria-label="Note for the league staff"
          className={CONTROL_CLASS}
        />
      </SettingsRow>

      {/*
        Required to **submit**, not to save. A draft is allowed to be half-finished — that is what a
        draft is for — but an application sent to staff has to carry a real acknowledgement, so the
        blocker for this lives beside the Submit button in `ApplicationCard` rather than disabling
        Save here. Ticking it and never saving would also be meaningless, since the box *is* the
        stored answer.

        The link is the league's own `rulebookUrl`, carried on the open-seasons list this page
        already loads — see `RulesAcknowledgement`. It deliberately does **not** route through
        `/info?conf=`: an unlisted season cannot be selected there, and teaching the site-wide season
        param to accept one so this link could work meant letting it name a league with no teams and
        no name for the selector.
      */}
      <SettingsRow label="League rules">
        <RulesAcknowledgement
          conf={conf}
          checked={rulesRead}
          onChange={setRulesRead}
        />
      </SettingsRow>

      {/* Same rules as the acknowledgement above: stored on save, required to submit, and the box is
          the record. Staff run team applications through a Discord ticket, and the site has no way to
          see whether one exists — so this is the applicant's word, and the readiness checklist on the
          card is what holds Submit until they give it. */}
      <SettingsRow label="Discord ticket">
        <TicketAcknowledgement checked={ticketOpened} onChange={setTicketOpened} />
      </SettingsRow>

      <div className="flex gap-2">
        <button type="submit" disabled={!canSave || save.isPending} className={ACTION_PRIMARY}>
          {isNew ? <Plus size={15} aria-hidden="true" /> : <Check size={15} aria-hidden="true" />}
          {save.isPending ? "Saving…" : isNew ? "Start my application" : "Save details"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className={ACTION}>
            Cancel
          </button>
        )}
      </div>

      {/* Says nothing about who owns the team. The roster starts empty and every member — the
          captain included — arrives through an invitation, so nothing here is decided by saving. */}
      {isNew && (
        <p className="mt-2 text-xs text-text-dim">
          Nothing is sent to the league until you submit it. You can invite your players next.
        </p>
      )}

      <ErrorLine message={save.isError ? errorMessage(save.error) : null} />
    </form>
  );
}

/**
 * The rules confirmation, pointed at the league's own rulebook.
 *
 * The URL rides on `GET /tournaments/applications/open` — the same list the page above reads to
 * decide which seasons are taking teams, so this costs no request of its own and the query is
 * already warm. It used to come from public `GET /:conf/info`, which was **published-only**: a
 * league that filled its rulebook in and left its Info page a draft showed every applicant no link
 * at all, indistinguishable from a league that had never set one. Upstream now serves the field
 * here regardless of publication, so `null` means exactly one thing — the league named no rulebook.
 *
 * Two degradations, both deliberate:
 *
 *  - **While the read is in flight** the checkbox is offered anyway, unlinked. Blocking it would gate
 *    the whole form on a request that has nothing to do with the answer.
 *  - **With no link** the confirmation stays and says where to ask. Refusing to let anybody apply
 *    because a league admin hasn't filled in a field is the league's mistake landing on the
 *    applicant, and the acknowledgement is still an accurate record of what they were shown.
 *    League Admin → Team Applications warns the person who can actually fix it.
 */
function RulesAcknowledgement({
  conf,
  checked,
  onChange,
}: {
  conf: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const { data: seasons, isPending } = useQuery(queries.openApplicationSeasons());
  const rulebook = seasons?.find(season => season.conf === conf)?.rulebookUrl ?? null;

  return (
    <>
      <label className="flex cursor-pointer items-start gap-2.5 text-sm text-text">
        <input
          type="checkbox"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-brand"
        />
        <span>
          I have read all{" "}
          {rulebook === null ? (
            <>CCS rules and procedures</>
          ) : (
            <a
              href={rulebook}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand no-underline hover:text-text-bright"
            >
              CCS rules and procedures
            </a>
          )}{" "}
          and acknowledge that failure to oblige with the rules can result in punishment.
        </span>
      </label>
      {rulebook === null && !isPending && (
        <p className="mt-1.5 text-xs text-text-dim">
          This league hasn't linked a rulebook. Ask staff on Discord for a copy before you confirm.
        </p>
      )}
    </>
  );
}

/**
 * The Discord ticket confirmation.
 *
 * The wording is a question on purpose — it is the instruction as much as the acknowledgement, and the
 * person who has not opened a ticket needs to be told where to go, not only asked. "The discord" links
 * to the server invite when the deployment has one configured (`lib/siteLinks.ts`); without one the
 * text stands on its own, same as the rulebook fallback above.
 */
function TicketAcknowledgement({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-sm text-text">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-brand"
      />
      <span>
        Have you opened a ticket in{" "}
        {DISCORD_INVITE ? (
          <a
            href={DISCORD_INVITE}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand no-underline hover:text-text-bright"
          >
            the discord
          </a>
        ) : (
          <>the discord</>
        )}{" "}
        under the <span className="font-mono text-[13px]">#ticket-questions</span> tab? If not, please
        go there and click the team apps button.
      </span>
    </label>
  );
}

