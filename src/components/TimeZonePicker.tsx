/**
 * A searchable IANA timezone picker, from the browser's own zone list.
 *
 * Built from the shared popover and command primitives. `Intl.supportedValuesOf` is newer than this
 * project's TypeScript lib target, so it is read through a guarded cast. On a browser without it the
 * typed search itself is offered as the value, and the API validates the zone.
 */

import { useMemo, useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import { Button } from "./ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "./ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

function supportedZones(): string[] {
  const supportedValuesOf = (Intl as { supportedValuesOf?: (key: "timeZone") => string[] }).supportedValuesOf;
  try {
    return supportedValuesOf ? supportedValuesOf("timeZone") : [];
  } catch {
    return [];
  }
}

export function TimeZonePicker({ value, onChange, disabled }: {
  value: string | null;
  onChange: (zone: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const zones = useMemo(supportedZones, []);
  const pick = (zone: string) => { onChange(zone); setOpen(false); setSearch(""); };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" disabled={disabled} className="justify-between" aria-label="Timezone">
          {value ?? "Choose a timezone"}
          <ChevronsUpDown size={14} aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <Command>
          <CommandInput placeholder="Search timezones" value={search} onValueChange={setSearch} />
          <CommandList className="max-h-72">
            <CommandEmpty>No timezone matches.</CommandEmpty>
            {zones.length === 0 && search.trim() && (
              <CommandItem value={search.trim()} onSelect={() => pick(search.trim())}>Use {search.trim()}</CommandItem>
            )}
            {zones.map(zone => (
              <CommandItem key={zone} value={zone} onSelect={() => pick(zone)}>{zone}</CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
