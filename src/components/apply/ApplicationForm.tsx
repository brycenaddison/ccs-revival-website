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
import { ACTION, ACTION_PRIMARY, ErrorLine } from "../admin/adminUi";
import { CONTROL_CLASS } from "../stats/FilterBar";
import { SettingsRow } from "../settings/SettingsSection";
import { ImageUpload } from "../ImageUpload";
import { queries, queryRoots } from "../../lib/queries";
import {
  createApplication,
  errorMessage,
  hexFromInt,
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

/**
 * Both colors are required, so there is no clearing and no empty state to represent.
 *
 * That is what removed the "Set" checkbox each one used to carry: `<input type="color">` always
 * reports a value, and the checkbox existed only to distinguish "no color chosen" from "chose
 * black" — a distinction that stops mattering once a team must have both. An application saved
 * before they were required arrives with `null`, which seeds a default rather than an empty control.
 *
 * Upstream reads `0` (black) as unset, so pure black is nudged to `#010101`: visually identical, and
 * it survives the round trip instead of coming back as "no color".
 */
const NEARLY_BLACK = 0x010101;

function colorFromHex(hex: string): number {
  const parsed = Number.parseInt(hex.replace("#", ""), 16);
  if (!Number.isFinite(parsed)) return NEARLY_BLACK;
  return parsed === 0 ? NEARLY_BLACK : parsed;
}

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
        color: colorFromHex(primary),
        colorSecondary: colorFromHex(secondary),
        // Merged over what was there rather than rebuilt: `PUT` replaces the whole application
        // document, so a question this build doesn't know about would be erased by a save. See
        // `writeApplicationDetails`.
        applicationMetadata: writeApplicationDetails(existing, {
          organizationName: organization.trim() === "" ? null : organization.trim(),
          twitter: twitterUrl(twitter),
          experience: experience.trim() === "" ? null : experience.trim(),
          rulesAcknowledged: rulesRead,
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

      {/* Case is the applicant's. It used to be forced to upper, which made "DoG" impossible to
          write — and mixed case is a real branding choice, not a typo. Uniqueness upstream is
          checked case-insensitively, so "DoG" and "DOG" still can't both exist in one league. */}
      <SettingsRow
        label="Tag"
        hint={`The short form used on scoreboards and brackets, e.g. “TSM” or “DoG”. Up to ${APPLICATION_CODE_MAX} characters, capitalized however you like, and it has to be unique in this league.`}
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
        hint="A square image works best — it fills your badge on scoreboards and brackets."
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
        hint="Your team's main color — it fills your badge and your side of a bracket line. Required."
      >
        <ColorField id="primary-color" value={primary} onChange={setPrimary} />
      </SettingsRow>

      <SettingsRow
        label="Secondary Color"
        hint="The accent that goes with it. Pick something that reads against the primary rather than beside it. Required."
      >
        <ColorField id="secondary-color" value={secondary} onChange={setSecondary} />
      </SettingsRow>

      <SettingsRow
        label="Organization"
        hint="The org behind the team, if there is one. Leave it empty if the team is the whole of it."
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
        hint="A link or a handle — “@yourteam” works. Optional, and it's for the league to find you, not a requirement to have one."
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
        hint="Other leagues you've played, placements, how long the org has been around — whatever helps staff place you. Optional, and a first-time team is not at a disadvantage for leaving it empty."
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
        hint="Optional. Anything they should know while reviewing — a preferred match night, a returning roster, a question."
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

        The link is the league's own `rulebookUrl`, read straight off its Info document — see
        `RulesAcknowledgement`. It deliberately does **not** route through `/info?conf=`: an unlisted
        season cannot be selected there, and teaching the site-wide season param to accept one so this
        link could work meant letting it name a league with no teams and no name for the selector.
      */}
      <SettingsRow label="League rules">
        <RulesAcknowledgement
          conf={conf}
          checked={rulesRead}
          onChange={setRulesRead}
        />
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

      {isNew && (
        <p className="mt-2 text-xs text-text-dim">
          Nothing is sent to the league until you submit it. You'll be set as the team's owner, and
          you can invite your players next.
        </p>
      )}

      <ErrorLine message={save.isError ? errorMessage(save.error) : null} />
    </form>
  );
}

interface ColorFieldProps {
  id: string;
  value: string;
  onChange: (hex: string) => void;
}

/**
 * The rules confirmation, pointed at the league's own rulebook.
 *
 * The URL comes from the league's published Info document, which the League Admin editor requires —
 * so this is the document the league actually published rather than a hardcoded link or a quick link
 * matched by label. `GET /:conf/info` is public and **not gated on the season being listed**, which
 * is what lets an unlisted season being applied to answer this at all.
 *
 * **A missing link here does not mean the league has no rulebook.** `GET /:conf/info` is
 * published-only — `getPublished` filters on `isPublished` — so a league that has filled in its
 * rulebook and left its Info page as a draft reads exactly like a league that never set one. The
 * applicant cannot tell those apart, and neither can this component: the draft-aware read is
 * league-admin only. So the copy below says the link is unavailable rather than accusing the league of
 * not having one, and League Admin → Team Applications warns the person who can actually fix it.
 *
 * Two degradations, both deliberate:
 *
 *  - **While the read is in flight** the checkbox is offered anyway, unlinked. Blocking it would gate
 *    the whole form on a request that has nothing to do with the answer.
 *  - **With no link** the confirmation stays and says where to ask. Refusing to let anybody apply
 *    because a league admin hasn't published a page is the league's mistake landing on the applicant,
 *    and the acknowledgement is still an accurate record of what they were shown.
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
  const { data: info, isPending } = useQuery(queries.leagueInfo(conf));
  const rulebook = info?.rulebookUrl ?? null;

  return (
    <>
      <label className="flex cursor-pointer items-start gap-2.5 text-sm text-text">
        <input
          type="checkbox"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-accent"
        />
        <span>
          I have read{" "}
          {rulebook === null ? (
            <>this league's rules</>
          ) : (
            <a
              href={rulebook}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent no-underline hover:text-text-bright"
            >
              this league's rulebook
            </a>
          )}{" "}
          and my team will follow them.
        </span>
      </label>
      {rulebook === null && !isPending && (
        <p className="mt-1.5 text-xs text-text-dim">
          The rulebook link isn't available on the site yet — ask staff on Discord for a copy before
          you confirm.
        </p>
      )}
    </>
  );
}

/** The swatch, with its hex beside it as a read-only caption so the value is legible at a glance. */
function ColorField({ id, value, onChange }: ColorFieldProps) {
  return (
    <div className="flex items-center gap-2.5">
      <input
        id={id}
        type="color"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-9 w-14 shrink-0 cursor-pointer rounded border border-border bg-bg2"
      />
      <span className="font-mono text-xs text-text-secondary">{value.toUpperCase()}</span>
    </div>
  );
}
