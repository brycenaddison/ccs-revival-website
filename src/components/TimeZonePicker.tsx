/**
 * A searchable IANA timezone picker, from the browser's own zone list, on the shared Combobox.
 *
 * `Intl.supportedValuesOf` is newer than this project's TypeScript lib target, so it is read through
 * a guarded cast. On a browser without it the typed search itself is offered as the value, and the
 * API validates the zone.
 */

import { useMemo } from "react";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";

function supportedZones(): ComboboxOption[] {
  const supportedValuesOf = (Intl as { supportedValuesOf?: (key: "timeZone") => string[] }).supportedValuesOf;
  try {
    return (supportedValuesOf ? supportedValuesOf("timeZone") : []).map(zone => ({ value: zone, label: zone }));
  } catch {
    return [];
  }
}

export function TimeZonePicker({ id, value, onChange, disabled }: {
  id?: string;
  value: string | null;
  onChange: (zone: string) => void;
  disabled?: boolean;
}) {
  const zones = useMemo(supportedZones, []);
  return (
    <Combobox
      id={id}
      options={zones}
      value={value}
      onChange={onChange}
      disabled={disabled}
      aria-label={id ? undefined : "Timezone"}
      placeholder="Choose a timezone"
      searchPlaceholder="Search timezones"
      emptyText="No timezone matches."
      createOption={zones.length === 0 ? search => ({ value: search, label: `Use ${search}` }) : undefined}
      className="sm:w-80"
    />
  );
}
