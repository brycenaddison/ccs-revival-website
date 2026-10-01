/**
 * A labelled radio list for choosing one of a few named options, each with an optional line saying
 * what it means. Put it inside a `SettingsRow`, which labels the group.
 */

import { useId } from "react";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export function RadioOptions<T extends string>({ name, options, value, disabled, onChange }: {
  name: string;
  options: readonly { value: T; label: string; detail?: string }[];
  value: T;
  disabled: boolean;
  onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <RadioGroup value={value} onValueChange={next => onChange(next as T)} disabled={disabled} className="gap-2">
      {options.map(option => (
        <div key={option.value} className="flex items-start gap-2">
          <RadioGroupItem id={`${id}-${name}-${option.value}`} value={option.value} className="mt-0.5" />
          <Label htmlFor={`${id}-${name}-${option.value}`} className="flex-col items-start gap-0.5 font-normal">
            <span className="text-sm text-text-bright">{option.label}</span>
            {option.detail && <span className="text-xs text-text-dim">{option.detail}</span>}
          </Label>
        </div>
      ))}
    </RadioGroup>
  );
}
