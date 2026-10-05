/**
 * One team in League Admin > Discord: its recorded role and channels, what the next sync would
 * change, warnings, any queued sync, confirmed role holders and unconfirmed recipients.
 *
 * Role holders are served by Discord account. A holder with a saved website profile renders through
 * `PlayerIdentity`; one with only a server username shows the handle; otherwise the recipient is an
 * Unnamed Discord member, never an id. DiscordMemberList keeps both lists' presentation and esub
 * removal shared. Unconfirmed records stay removable; roster recipients are changed in Teams.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { ErrorLine } from "../../admin/adminUi";
import { relativeInstant } from "../../predictions/PredictionUi";
import type { DiscordPlayerSource } from "../../players/pickerTypes";
import { queries } from "../../../lib/queries";
import { useAuth } from "../../../lib/authContext";
import {
  errorMessage,
  removeEsub,
  type TeamDiscordMember,
  type TeamDiscordTeam,
} from "../../../lib/api";
import { DRIFT_LABEL } from "./discordLabels";
import { DiscordResourceBadge } from "./DiscordResourceBadge";
import { DiscordMemberList, discordMemberLabel } from "./DiscordMemberList";
import { IssueText, type RosterNames } from "./discordIssues";
import { EsubGrant } from "./EsubGrant";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function TeamDiscordCard({ conf, team, canEdit, source, people, working, onProvision, onResync }: {
  conf: string;
  team: TeamDiscordTeam;
  /** Roster scope and a connected Discord, required for every action here. */
  canEdit: boolean;
  source: DiscordPlayerSource;
  people: RosterNames;
  working: boolean;
  /** Null when this viewer cannot provision right now. */
  onProvision: (() => void) | null;
  onResync: (() => void) | null;
}) {
  const [open, setOpen] = useState(false);
  const [granting, setGranting] = useState(false);
  const { profile } = useAuth();
  const qc = useQueryClient();
  const statusKey = queries.teamDiscord(conf, profile?.id ?? null).queryKey;

  const remove = useMutation({
    mutationFn: (member: TeamDiscordMember) => removeEsub(conf, team.teamId, member.snowflake),
    retry: false,
    onSuccess: async (_, member) => {
      await qc.invalidateQueries({ queryKey: statusKey });
      toast.success(`Esub removed from ${team.name || team.code}: ${discordMemberLabel(member)}.`);
    },
  });

  const resources = [team.role, team.text, team.voice] as const;
  const attention = team.drift.length + team.warnings.length + team.unconfirmedMembers.length + (team.queued ? 1 : 0)
    + resources.filter(resource => resource?.diagnostic === "uncertain" || resource?.exists === false).length;
  const memberListProps = {
    teamName: team.name || team.code,
    canRemove: canEdit,
    removing: remove.isPending,
    onRemove: (member: TeamDiscordMember) => remove.mutate(member),
  };

  return (
    <section className="rounded-lg border border-border bg-bg2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
        className="flex w-full min-w-0 cursor-pointer flex-wrap items-center gap-x-3 gap-y-2 border-none bg-transparent p-4 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-brand"
      >
        {open ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronRight size={15} aria-hidden="true" />}
        <span className="font-mono text-xs text-text-secondary">{team.code}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-text-bright">{team.name || team.code}</span>
        <span className="flex flex-wrap items-center gap-1.5">
          {(["role", "text", "voice"] as const).map((kind, index) => (
            <DiscordResourceBadge key={kind} kind={kind} resource={resources[index]} />
          ))}
          {attention > 0 && <Badge variant="destructive">Needs attention</Badge>}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-4 border-t border-border p-4">
          {canEdit && (
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" size="sm" type="button" disabled={working || !onProvision} onClick={() => onProvision?.()}>
                Provision this team
              </Button>
              <Button variant="outline" size="sm" type="button" disabled={working || !onResync} onClick={() => onResync?.()}>
                Resync roles
              </Button>
            </div>
          )}

          {team.drift.length > 0 && (
            <div>
              <p className="text-sm text-text-bright">The next sync will update</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-text-secondary">
                {team.drift.map(drift => <li key={drift}>{DRIFT_LABEL[drift]}</li>)}
              </ul>
            </div>
          )}

          {team.warnings.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-sm text-ccs-gold">
              {team.warnings.map((warning, index) => (
                <li key={`${warning.code}-${index}`}><IssueText issue={warning} people={people} /></li>
              ))}
            </ul>
          )}

          {team.queued && (
            <div className="text-sm text-text-secondary">
              <p>
                Background sync queued
                {team.queued.attempts > 0 && <> · {team.queued.attempts} {team.queued.attempts === 1 ? "attempt" : "attempts"} so far</>}
                {team.queued.retryAt && <> · next try {relativeInstant(team.queued.retryAt, null)}</>}
              </p>
              {(team.queued.membership === true || team.queued.resources === true) && (
                <p className="text-xs text-text-dim">
                  Pending: {[team.queued.membership === true ? "role membership" : null, team.queued.resources === true ? "roles and channels" : null].filter(Boolean).join(", ")}
                </p>
              )}
              <ErrorLine message={team.queued.lastError} />
            </div>
          )}

          <div>
            <p className="text-sm text-text-bright">Confirmed role holders</p>
            {team.members.length === 0 ? (
              <p className="mt-1 text-sm text-text-dim">No confirmed role holders.</p>
            ) : (
              <DiscordMemberList {...memberListProps} members={team.members} />
            )}
          </div>

          {team.unconfirmedMembers.length > 0 && (
            <div>
              <p className="text-sm text-text-bright">Unconfirmed recipients</p>
              <p className="mt-1 text-xs text-text-dim">
                These recorded recipients do not have a confirmed team role. Check again to refresh their status.
              </p>
              <DiscordMemberList {...memberListProps} members={team.unconfirmedMembers} />
            </div>
          )}
          <ErrorLine message={remove.error ? errorMessage(remove.error) : null} />

          {canEdit && team.role && (
            granting ? (
              <EsubGrant
                conf={conf}
                team={team}
                source={source}
                onDone={message => { setGranting(false); toast.success(message); }}
                onCancel={() => setGranting(false)}
              />
            ) : (
              <div>
                <Button variant="outline" size="sm" type="button" onClick={() => setGranting(true)}>
                  <Plus size={13} aria-hidden="true" />
                  Add an esub
                </Button>
                <p className="mt-1 text-xs text-text-dim">
                  Gives a substitute this team&apos;s role and channels without changing the roster.
                </p>
              </div>
            )
          )}
        </div>
      )}
    </section>
  );
}
