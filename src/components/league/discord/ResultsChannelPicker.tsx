/**
 * The searchable results channel picker. Channels stay in served order; ineligible ones remain
 * listed, disabled, with the reason, so a reserved channel doesn't look missing.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ResultsChannel } from "../../../lib/api";
import { groupLabels } from "../../../lib/leagueAdapters";
import { queries } from "../../../lib/queries";
import { resultsChannelUnavailable } from "./resultsLabels";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";

export function ResultsChannelPicker({ id, describedBy, channels, value, onChange, disabled }: {
  id?: string;
  describedBy?: string;
  channels: readonly ResultsChannel[];
  value: string | null;
  onChange: (channelId: string) => void;
  disabled?: boolean;
}) {
  // Public listed leagues name most reservations; a hidden league falls back to its code.
  const leagues = useQuery(queries.tournaments());
  const options = useMemo<ComboboxOption[]>(() => {
    const reserved = channels.flatMap(c => c.assignedConf ? [c.assignedConf] : []);
    const names = groupLabels(leagues.data ?? [], reserved);
    return channels.map(c => {
      const reason = resultsChannelUnavailable(c, c.assignedConf ? names.get(c.assignedConf) ?? null : null);
      return {
        value: c.id,
        label: c.name ? `#${c.name}` : "Unnamed channel",
        keywords: c.name ? [c.name] : [],
        disabled: reason !== null,
        detail: reason ?? undefined,
      };
    });
  }, [channels, leagues.data]);

  return (
    <Combobox
      id={id}
      aria-describedby={describedBy}
      options={options}
      value={value}
      onChange={onChange}
      placeholder="Choose a channel"
      searchPlaceholder="Search channels"
      emptyText="No channel matches."
      disabled={disabled}
      contentClassName="min-w-80"
    />
  );
}
