import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { PillTabs } from "../../PillTabs";

const VIEWS = [
  { key: "bracket", label: "Bracket" },
  { key: "rounds", label: "Rounds (manual pairings)" },
] as const;

/** The bracket editor stages a persisted view choice before its separate save. */
export function PhaseViewField({ id, value, onChange, disabled = false, invalid }: {
  id: string;
  value: boolean | null;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  invalid?: true;
}) {
  return (
    <Field data-invalid={invalid}>
      <FieldLabel id={`${id}-label`}>Phase view</FieldLabel>
      <PillTabs
        tabs={VIEWS}
        selected={value === null ? null : value ? "bracket" : "rounds"}
        onSelect={key => onChange(key === "bracket")}
        disabled={disabled || value === null}
        aria-labelledby={`${id}-label`}
        aria-invalid={invalid}
        aria-describedby={`${id}-hint`}
      />
      <FieldDescription id={`${id}-hint`}>
        {value === null
          ? "This server does not support saving a phase view yet."
          : "Sets the public and league-admin view. Use rounds when later rounds are paired by hand. Wiring and seed sources work the same in either view."}
      </FieldDescription>
    </Field>
  );
}
