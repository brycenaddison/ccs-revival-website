/**
 * The Discord roles that see every team channel in this league, alongside each team.
 *
 * The draft is a list of role ids, named from the status read: saved roles from `staffRoles`, newly
 * picked ones from `assignableRoles`, which is also the picker's option list. A role the read cannot
 * name falls back to its id, since without Discord nothing else tells two roles apart. Saving
 * replaces the whole list and updates access on existing channels during the admin request. The
 * parent keys this panel by the served list, so a save or another admin's change resets the draft.
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { X } from "lucide-react";
import { toast } from "sonner";
import { ErrorLine } from "../../admin/adminUi";
import { SettingsRow } from "../../settings/SettingsSection";
import {
  errorMessage,
  hexFromInt,
  saveTeamDiscordStaffRoles,
  teamDiscordRefusal,
  TEAM_DISCORD_STAFF_ROLES_MAX,
  type TeamDiscordRoleOption,
  type TeamDiscordStaffRole,
} from "../../../lib/api";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";

interface RoleName { name: string | null; color: number | null }

export function StaffRolesPanel({
  conf, staffRoleIds, staffRoles, assignableRoles, available, provisioned, canEdit, onSaved,
}: {
  conf: string;
  staffRoleIds: readonly string[];
  staffRoles: readonly TeamDiscordStaffRole[];
  assignableRoles: readonly TeamDiscordRoleOption[];
  /** Discord answered, so an unnamed saved role has left the server. */
  available: boolean;
  provisioned: boolean;
  /** League admin scope and a connected Discord. */
  canEdit: boolean;
  onSaved: () => Promise<unknown>;
}) {
  const [draft, setDraft] = useState<string[]>([...staffRoleIds]);

  const save = useMutation({
    mutationFn: () => saveTeamDiscordStaffRoles(conf, draft),
    retry: false,
    onSuccess: async () => {
      await onSaved();
      toast.success(provisioned
        ? "Staff roles saved. Existing channel permissions updated."
        : "Staff roles saved.");
    },
  });
  const rejected = new Set(teamDiscordRefusal(save.error)?.roleIds ?? []);

  const names = new Map<string, RoleName>([
    ...staffRoles.map(role => [role.id, role] as const),
    ...assignableRoles.map(role => [role.id, role] as const),
  ]);
  const roleName = (id: string): RoleName => names.get(id) ?? { name: null, color: null };
  const options = assignableRoles
    .filter(role => !draft.includes(role.id))
    .map(role => ({ value: role.id, label: role.name }));
  const full = draft.length >= TEAM_DISCORD_STAFF_ROLES_MAX;
  const dirty = draft.length !== staffRoleIds.length || draft.some((id, index) => id !== staffRoleIds[index]);

  const edit = (next: (current: string[]) => string[]) => {
    setDraft(next);
    save.reset();
  };

  return (
    <section aria-labelledby="discord-staff-roles" className="flex flex-col gap-3">
      <h3 id="discord-staff-roles" className="font-heading text-sm text-text-bright">Staff roles</h3>
      <p className="text-sm text-text-secondary">
        Roles that can see every team&apos;s channels in this league, such as league staff.
        Saving updates access on existing channels during the request.
      </p>

      {draft.length === 0 ? (
        <p className="text-sm text-text-dim">No staff roles. Only each team sees its own channels.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {draft.map(id => {
            const role = roleName(id);
            return (
              <li key={id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <RoleLabel id={id} role={role} />
                {rejected.has(id) ? <span className="text-xs text-ccs-red">Not a role in this server</span>
                  : available && role.name === null && <span className="text-xs text-ccs-red">No longer in this server</span>}
                {canEdit && (
                  <Button variant="quiet" size="inline" type="button" disabled={save.isPending}
                    aria-label={`Remove ${role.name ?? "this role"}`}
                    onClick={() => edit(current => current.filter(other => other !== id))}>
                    <X aria-hidden="true" />
                    Remove
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canEdit && (
        <>
          <SettingsRow
            label="Add a role"
            hint={full ? `A league can have up to ${TEAM_DISCORD_STAFF_ROLES_MAX} staff roles.`
              : "Integration roles and this league's team roles are not offered."}
          >
            {field => (
              <Combobox
                id={field.id}
                aria-describedby={field["aria-describedby"]}
                options={options}
                value={null}
                onChange={id => edit(current => current.includes(id) ? current : [...current, id])}
                placeholder="Choose a role"
                searchPlaceholder="Search roles"
                emptyText={assignableRoles.length === 0 ? "No roles to offer." : "No other roles match."}
                disabled={save.isPending || full}
                className="max-w-72"
              />
            )}
          </SettingsRow>
          <ErrorLine message={save.error ? errorMessage(save.error) : null} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" type="button" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? "Saving…" : "Save staff roles"}
            </Button>
            {dirty && (
              <Button variant="outline" size="sm" type="button" disabled={save.isPending}
                onClick={() => edit(() => [...staffRoleIds])}>
                Discard changes
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

/** The role's name with its server color, or its id when the read could not name it. */
function RoleLabel({ id, role }: { id: string; role: RoleName }) {
  if (role.name === null) return <span className="font-mono text-xs text-text">{id}</span>;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-sm text-text">
      {/* Discord's own role color: data-driven, and 0 means the role has none. */}
      <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full border border-border"
        style={{ backgroundColor: hexFromInt(role.color, "transparent") }} />
      <span className="min-w-0 truncate">{role.name}</span>
    </span>
  );
}
