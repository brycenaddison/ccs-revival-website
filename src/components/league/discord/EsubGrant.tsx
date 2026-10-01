/**
 * Grants a team's Discord role to an esub: find the person, choose how long, then grant.
 *
 * Uses the roster Discord search, because an esub is a Discord account rather than a roster slot:
 * the chosen hit's account is sent as-is and no profile is resolved or created. The grant is a
 * separate click after the choice, since it changes who can see the team's channels.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ErrorLine } from "../../admin/adminUi";
import { SettingsRow } from "../../settings/SettingsSection";
import { DiscordSearch, type DiscordHit } from "../../players/PlayerPicker";
import { PlayerIdentity } from "../../players/PlayerIdentity";
import type { DiscordPlayerSource } from "../../players/pickerTypes";
import { useAuth } from "../../../lib/authContext";
import { queries } from "../../../lib/queries";
import { fmtLocalDateTime } from "../../../lib/utils";
import {
  errorMessage,
  ESUB_DAYS_MAX,
  ESUB_DAYS_MIN,
  grantEsub,
  type TeamDiscordTeam,
} from "../../../lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function EsubGrant({ conf, team, source, onDone, onCancel }: {
  conf: string;
  team: TeamDiscordTeam;
  source: DiscordPlayerSource;
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const [hit, setHit] = useState<DiscordHit | null>(null);
  const [days, setDays] = useState("");
  const { profile } = useAuth();
  const qc = useQueryClient();
  const teamName = team.name || team.code;

  const trimmed = days.trim();
  const parsed = trimmed === "" ? null : Number(trimmed);
  const daysError = parsed !== null && !(Number.isInteger(parsed) && parsed >= ESUB_DAYS_MIN && parsed <= ESUB_DAYS_MAX)
    ? `Enter a whole number of days from ${ESUB_DAYS_MIN} to ${ESUB_DAYS_MAX}, or leave it empty.`
    : null;

  const grant = useMutation({
    mutationFn: (selected: DiscordHit) => grantEsub(conf, team.teamId, selected.discordUserId, parsed),
    retry: false,
    onSuccess: async esub => {
      await qc.invalidateQueries({ queryKey: queries.teamDiscord(conf, profile?.id ?? null).queryKey });
      const until = esub.expiresAt ? ` until ${fmtLocalDateTime(esub.expiresAt)}` : "";
      onDone(`${hit?.player.name ?? "The esub"} has the ${teamName} role${until}.`);
    },
  });

  if (!hit) {
    return <DiscordSearch source={source} onSelect={setHit} onCancel={onCancel} />;
  }

  return (
    <div className="min-w-0 space-y-3 rounded-md border border-border bg-bg3 p-3" aria-busy={grant.isPending}>
      <p className="text-sm font-semibold text-text-bright">Esub for {teamName}</p>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <PlayerIdentity player={hit.player} />
        {hit.handle && <span className="text-xs text-text-dim">@{hit.handle}</span>}
      </div>
      <SettingsRow
        label="Days"
        hint="Leave empty to keep the role until you remove it. Granting again replaces the end date."
        error={daysError}
      >
        {field => (
          <Input {...field} inputMode="numeric" value={days} disabled={grant.isPending}
            placeholder="Until removed" className="max-w-40" onChange={event => setDays(event.target.value)} />
        )}
      </SettingsRow>
      <ErrorLine message={grant.error ? errorMessage(grant.error) : null} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" type="button" disabled={grant.isPending || daysError !== null} onClick={() => grant.mutate(hit)}>
          {grant.isPending ? "Granting…" : "Grant role"}
        </Button>
        <Button variant="outline" size="sm" type="button" disabled={grant.isPending}
          onClick={() => { grant.reset(); setHit(null); }}>Back</Button>
      </div>
    </div>
  );
}
