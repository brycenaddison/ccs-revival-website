/** Shared recipient rows for confirmed role holders and unconfirmed grant records. */

import { ConfirmButton } from "../../ConfirmButton";
import { PlayerIdentity, playerLabel } from "../../players/PlayerIdentity";
import { PlayerLink } from "../../profile/PlayerLink";
import { fmtLocalDateTime } from "../../../lib/utils";
import type { TeamDiscordMember, TeamDiscordUnconfirmedMember } from "../../../lib/api";
import { UNCONFIRMED_MEMBER_LABEL } from "./discordLabels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function discordMemberLabel(member: Pick<TeamDiscordMember, "profile" | "handle">): string {
  return member.profile?.name ?? (member.handle ? `@${member.handle}` : "Unnamed Discord member");
}

export function DiscordMemberList({ members, teamName, canRemove, removing, onRemove }: {
  members: readonly (TeamDiscordMember | TeamDiscordUnconfirmedMember)[];
  teamName: string;
  canRemove: boolean;
  removing: boolean;
  onRemove: (member: TeamDiscordMember) => void;
}) {
  return (
    <ul className="mt-2 flex flex-col gap-2">
      {members.map(member => (
        <li key={`${member.source}:${member.snowflake}`} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          {member.profile ? <PlayerIdentity player={member.profile} small /> : (
            <span className="min-w-0 truncate text-text">{discordMemberLabel(member)}</span>
          )}
          <Badge variant={member.source === "esub" ? "default" : "muted"}>
            {member.source === "esub" ? "Esub" : "Roster"}
          </Badge>
          {"reason" in member && (
            <Badge variant={member.reason === "unavailable" ? "muted" : "destructive"}>
              {UNCONFIRMED_MEMBER_LABEL[member.reason]}
            </Badge>
          )}
          {member.source === "esub" && (
            <span className="text-xs text-text-secondary">
              {member.expiresAt ? `Until ${fmtLocalDateTime(member.expiresAt)}` : "Until removed"}
              {member.grantedByProfile && (
                <>
                  {" · Added by "}
                  <PlayerLink profileId={member.grantedByProfile.profileId} className="text-brand hover:underline">
                    {playerLabel(member.grantedByProfile)}
                  </PlayerLink>
                  {member.grantedAt && ` on ${fmtLocalDateTime(member.grantedAt)}`}
                </>
              )}
            </span>
          )}
          {member.source === "esub" && canRemove && (
            <ConfirmButton
              title="Remove this esub?"
              description={`Removes the esub grant for ${discordMemberLabel(member)} and revokes the ${teamName} role unless they are also on the roster.`}
              confirmLabel="Remove esub"
              disabled={removing}
              onConfirm={() => onRemove(member)}
              trigger={<Button variant="quiet" size="inline" type="button">Remove</Button>}
            />
          )}
        </li>
      ))}
    </ul>
  );
}
