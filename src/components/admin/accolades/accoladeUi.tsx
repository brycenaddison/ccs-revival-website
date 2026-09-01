/**
 * What the two accolade editors share.
 *
 * There is one definition document — `{kind, name, description, active}`, exact keys — and both
 * `/admin/accolades/definitions` and `/tournaments/:conf/accolades/definitions` take it verbatim.
 * So there is one form, and the only difference between the site-admin and league editors is which
 * mutation it is handed. A second copy would be the same four fields with the same four limits and
 * would drift the first time one of them changed.
 */

import { useState, type ReactNode } from "react";
import { Check, Plus, Trophy, Users } from "lucide-react";
import { CONTROL_CLASS } from "../../stats/FilterBar";
import { ACTION, ACTION_PRIMARY, ErrorLine } from "../adminUi";
import { SettingsRow } from "../../settings/SettingsSection";
import {
  ACCOLADE_DESCRIPTION_MAX,
  ACCOLADE_KINDS,
  ACCOLADE_NAME_MAX,
  isAccoladeKind,
  type AccoladeDefinition,
  type AccoladeDefinitionInput,
  type AccoladeKind,
} from "../../../lib/api";

/**
 * A definition's kind, with the icon the public profile strip uses for it.
 *
 * The same pairing as `components/profile/AccoladeStrip.tsx` on purpose: an admin choosing a kind
 * should be looking at the glyph a player will see, not at a different one that means the same thing.
 */
export function KindPill({ kind }: { kind: AccoladeKind }) {
  const Icon = kind === "team" ? Users : Trophy;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-ccs-gold/40 bg-ccs-gold/10 px-2.5 py-0.5 font-heading text-[10px] tracking-wider uppercase text-text-bright">
      <Icon size={11} aria-hidden="true" className="shrink-0 text-ccs-gold" />
      {kind}
    </span>
  );
}

/** A row in either definition list: the pill, the name, and whatever actions the caller offers. */
export function DefinitionRow({
  definition,
  scope,
  children,
}: {
  definition: AccoladeDefinition;
  /** A short note on where this definition comes from, when that is not obvious from the list. */
  scope?: string;
  children?: ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center gap-2.5 border-b border-border py-2.5 last:border-b-0">
      <KindPill kind={definition.kind} />
      <span
        className={`font-heading text-sm tracking-wider ${
          definition.active ? "text-text-bright" : "text-text-dim line-through"
        }`}
      >
        {definition.name}
      </span>
      {!definition.active && <span className="text-text-dim text-[10px] uppercase">retired</span>}
      {scope && <span className="text-text-dim text-[10px] uppercase tracking-wider">{scope}</span>}
      {definition.description && (
        <span className="min-w-0 flex-1 truncate text-text-secondary text-xs" title={definition.description}>
          {definition.description}
        </span>
      )}
      {children && <span className="ml-auto flex gap-2">{children}</span>}
    </li>
  );
}

interface FormProps {
  /** The definition being edited, or `null` to create one. */
  definition: AccoladeDefinition | null;
  onSave: (input: AccoladeDefinitionInput) => void;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
}

/**
 * The complete definition document as a form.
 *
 * Whole-document, so every field is sent on every save — that is the endpoint's contract, and the
 * usual "only what moved" `PATCH` reasoning does not apply here. Retiring is `active: false` rather
 * than a delete, because an accolade already awarded under a definition has to keep rendering.
 */
export function DefinitionForm({ definition, onSave, saving, error, onCancel }: FormProps) {
  const [kind, setKind] = useState<AccoladeKind>(definition?.kind ?? "individual");
  const [name, setName] = useState(definition?.name ?? "");
  const [description, setDescription] = useState(definition?.description ?? "");
  const [active, setActive] = useState(definition?.active !== false);

  const trimmedName = name.trim();
  const trimmedDescription = description.trim();
  const isNew = definition === null;
  const canSave = trimmedName !== "";

  return (
    <form
      className="bg-bg3 border border-border rounded-lg p-4"
      onSubmit={e => {
        e.preventDefault();
        if (!canSave || saving) return;
        onSave({
          kind,
          name: trimmedName,
          // Upstream refuses an empty string and reads `null` as "no description", so an emptied box
          // has to become `null` rather than "".
          description: trimmedDescription === "" ? null : trimmedDescription,
          active,
        });
      }}
    >
      <SettingsRow
        label="Awarded to"
        hint={
          kind === "team"
            ? "A team. The server expands that team's current roster into the recipient list when the accolade is issued — five starters plus substitutes, deduplicated."
            : "One or more named players. Co-winners are a single award with several recipients."
        }
      >
        <select
          value={kind}
          aria-label="Awarded to"
          onChange={e => isAccoladeKind(e.target.value) && setKind(e.target.value)}
          className={CONTROL_CLASS}
        >
          {ACCOLADE_KINDS.map(k => (
            <option key={k} value={k}>
              {k === "team" ? "A team" : "Individual players"}
            </option>
          ))}
        </select>
        {definition !== null && kind !== definition.kind && (
          <p className="text-ccs-orange text-xs mt-1.5">
            Changing the kind doesn't rewrite accolades already awarded under this definition — they
            keep the recipients they were issued with.
          </p>
        )}
      </SettingsRow>

      <SettingsRow
        label="Name"
        hint={`What a player sees on their profile, e.g. “First Team All-Pro” or “🏆 Champion”. Emoji count as one character, up to ${ACCOLADE_NAME_MAX}.`}
      >
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={ACCOLADE_NAME_MAX}
          aria-label="Name"
          className={CONTROL_CLASS}
        />
      </SettingsRow>

      <SettingsRow
        label="Description"
        hint="Optional. Shown as the pill's tooltip on a profile, so it's for the detail that doesn't fit in the name. Leave it empty to clear."
      >
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          maxLength={ACCOLADE_DESCRIPTION_MAX}
          rows={2}
          aria-label="Description"
          className={CONTROL_CLASS}
        />
      </SettingsRow>

      <SettingsRow
        label="Status"
        hint="Retiring a definition stops it being issued again. Every accolade already awarded under it is untouched and keeps showing on the players who won it — this is the only way to withdraw one, because there is no delete."
      >
        <label className="flex items-center gap-2.5 cursor-pointer text-sm text-text">
          <input
            type="checkbox"
            checked={active}
            onChange={e => setActive(e.target.checked)}
            className="accent-brand w-4 h-4 cursor-pointer"
          />
          Available to issue
        </label>
      </SettingsRow>

      <div className="flex gap-2">
        <button type="submit" disabled={!canSave || saving} className={ACTION_PRIMARY}>
          {isNew ? <Plus size={15} aria-hidden="true" /> : <Check size={15} aria-hidden="true" />}
          {saving ? "Saving…" : isNew ? "Create definition" : "Save definition"}
        </button>
        <button type="button" onClick={onCancel} className={ACTION}>
          Cancel
        </button>
      </div>

      <ErrorLine message={error} />
    </form>
  );
}
