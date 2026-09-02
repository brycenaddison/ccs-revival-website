/**
 * Inviting somebody to a proposed team: find them in the CCS Discord, pick their roles, send.
 *
 * Search is against the one configured guild and capped at ten results upstream — it is a REST
 * lookup per settled query, not a member list this page holds, which is why it is debounced and
 * refuses anything under two characters rather than fetching on the first letter.
 *
 * **Identity is the Discord user id, never the label.** The server re-fetches the selected member
 * from the guild before writing, so editing a response value cannot invite an arbitrary Discord
 * user, and the profile is created or reused by snowflake — an invitee does not need to have signed
 * in to the website before.
 *
 * Sending the same person again is how a resend is expressed: upstream upserts on
 * `(application, profile)`, replaces the whole role set and returns the invitation to `pending`.
 * There is deliberately no separate resend route.
 *
 * The panel handles both halves of that. A **new** invitee is found by guild search and sent by
 * `discordUserId`; somebody **already on the roster** is re-sent by `profileId`, which is what makes
 * changing a position possible without remove-and-reinvite. See `InvitationInput` for why the route
 * takes one or the other rather than either.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Search, UserPlus, X } from "lucide-react";
import { ACTION, ACTION_PRIMARY, ACTION_QUIET, ACTION_SM, ErrorLine } from "../admin/adminUi";
import { CONTROL_CLASS, LABEL_CLASS } from "../stats/FilterBar";
import { discordAvatarUrl, ROLE_LABEL, STARTER_ROLES } from "./applyUi";
import { useDebounced } from "../../hooks/useDebounced";
import { DISCORD_INVITE } from "../../lib/siteLinks";
import { queryRoots } from "../../lib/queries";
import {
  errorMessage,
  inviteMember,
  refusalOf,
  searchGuildMembers,
  SUB_ORDINAL_MAX,
  type ApplicationMember,
  type GuildMemberCandidate,
  type MemberRoleAssignment,
  type TeamMemberRole,
} from "../../lib/api";

interface Props {
  conf: string;
  applicationId: number;
  /** Everyone already on the application, so a search result can say who is already invited. */
  members: readonly ApplicationMember[];
  /**
   * When set, this edits an existing member's roles instead of inviting a new person: the search box
   * is hidden and the upsert is aimed by `profileId`.
   */
  editing?: ApplicationMember;
  onDone: (message: string) => void;
  onCancel: () => void;
}

export function InviteMember({ conf, applicationId, members, editing, onDone, onCancel }: Props) {
  const qc = useQueryClient();

  // Copied to a local so the `invite &&` guard below narrows away the `null` *inside* the copy
  // handler. TypeScript does not carry a narrowing on an imported binding into a closure — another
  // module could reassign it between the check and the click, as far as the checker knows.
  const invite = DISCORD_INVITE;

  const [term, setTerm] = useState("");
  const [picked, setPicked] = useState<GuildMemberCandidate | null>(null);
  const [roles, setRoles] = useState<TeamMemberRole[]>(
    editing ? editing.roles.map(r => r.role) : [],
  );

  const query = useDebounced(term, 300).trim();

  const { data: results, isFetching, error: searchError } = useQuery({
    queryKey: ["applications", "memberSearch", conf, applicationId, query] as const,
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      searchGuildMembers(conf, applicationId, query, { signal }),
    // Two characters is upstream's own floor — a shorter query is a `400`, not an empty result.
    // Editing an existing member never searches: the target is already known.
    enabled: editing === undefined && query.length >= 2,
    staleTime: 30_000,
  });

  const send = useMutation({
    mutationFn: () => {
      const assignments: MemberRoleAssignment[] = roles.map(role => ({
        role,
        // Only substitutes take a nonzero ordinal; upstream `400`s on any other role carrying one.
        // The applicant never sees or picks it: see `nextSubOrdinal`.
        ordinal: role === "sub" ? nextSubOrdinal(members, editing) : 0,
      }));
      // One or the other, never both — see `InvitationInput`.
      return inviteMember(
        conf,
        applicationId,
        editing
          ? { profileId: editing.profileId, roles: assignments }
          : { discordUserId: picked?.userId ?? "", roles: assignments },
      );
    },
    onSuccess: async (member: ApplicationMember) => {
      await qc.invalidateQueries({ queryKey: queryRoots.applications });
      // A failed DM is not a failed invitation — the website inbox is the authority — so this is
      // reported as a caveat on a success rather than as an error.
      onDone(
        member.dmStatus === "failed"
          ? `Invited ${member.name ?? "them"}, but the Discord DM didn't send. They'll still see it on the site.`
          : `Invited ${member.name ?? "them"}.`,
      );
    },
  });

  const refusal = send.isError ? refusalOf(send.error) : null;
  const canSend = roles.length > 0 && (editing !== undefined || picked !== null);

  return (
    <div className="rounded-lg border border-border bg-bg3 p-4">
      <p className="font-heading text-sm text-text-bright">
        {editing ? `Change ${editing.name ?? "their"} roles` : "Invite a player"}
      </p>

      {editing ? (
        <p className="mt-2 text-xs text-ccs-orange">
          Changing somebody's roles asks them again — their invitation goes back to pending until they
          accept the new ones.
        </p>
      ) : (
        <label className={`${LABEL_CLASS} mt-3`} htmlFor={`search-${applicationId}`}>
          Find them in the CCS Discord
        </label>
      )}

      {editing ? null : picked ? (
        <div className="flex items-center gap-2.5 rounded-md border border-brand/50 bg-bg2 px-3 py-2">
          <CandidateFace candidate={picked} />
          <span className="min-w-0 flex-1 truncate text-sm text-text-bright">
            {picked.displayName}
            <span className="ml-2 text-xs text-text-dim">@{picked.username}</span>
          </span>
          <button
            type="button"
            onClick={() => setPicked(null)}
            title="Pick somebody else"
            className={ACTION_SM}
          >
            <X size={13} aria-hidden="true" />
            Change
          </button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search
              size={14}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-dim"
            />
            <input
              id={`search-${applicationId}`}
              value={term}
              onChange={e => setTerm(e.target.value)}
              placeholder="Discord name or username"
              autoComplete="off"
              className={`${CONTROL_CLASS} pl-8`}
            />
          </div>

          {term.trim().length > 0 && query.length < 2 && (
            <p className="mt-1.5 text-xs text-text-dim">Keep typing — two characters minimum.</p>
          )}
          {isFetching && <p className="mt-1.5 text-xs text-text-dim">Searching Discord…</p>}
          {/* A `503` here means the bot is offline, which is the one failure that doesn't implicate
              the rest of the site — say so rather than showing a bare error. */}
          {searchError && (
            <ErrorLine
              message={`Couldn't search Discord: ${errorMessage(searchError)}. The bot may be offline; the rest of this form still works.`}
            />
          )}
          {results && results.length > 0 && (
            <ul className="mt-2 max-h-56 overflow-y-auto rounded-md border border-border">
              {results.map(candidate => {
                // Matched on the Discord **username**, not the guild display name: the display name
                // is per-server and editable, while `handle` on a member is the cached username. A
                // member who has never signed in has no handle, so this can miss — which costs
                // nothing worse than a re-send, since a repeat invitation is an upsert.
                const already = members.some(
                  m => m.handle !== null && m.handle === candidate.username,
                );
                return (
                  <li key={candidate.userId}>
                    <button
                      type="button"
                      onClick={() => {
                        setPicked(candidate);
                        setTerm("");
                      }}
                      className="flex w-full items-center gap-2.5 border-none bg-transparent px-3 py-2 text-left text-sm text-text hover:bg-bg-input"
                    >
                      <CandidateFace candidate={candidate} />
                      <span className="min-w-0 flex-1 truncate">
                        {candidate.displayName}
                        <span className="ml-2 text-xs text-text-dim">@{candidate.username}</span>
                      </span>
                      {already && (
                        <span className="shrink-0 text-[10px] text-text-dim">
                          already invited
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {/* The most common reason a search comes back empty, and the one the captain can act on:
              this searches the CCS Discord and nothing else, so somebody who has never joined it
              cannot be found — or invited — until they do. Handing over the invite link is the whole
              fix, so it is offered here rather than described. */}
          {results && results.length === 0 && query.length >= 2 && !isFetching && (
            <div className="mt-1.5 rounded-md border border-border bg-bg2 px-3 py-2">
              <p className="text-xs text-text-secondary">
                Nobody in the CCS Discord matches that. They have to join the server before you can
                invite them — send them the link, then search again once they're in.
              </p>
              {invite && (
                <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                  <a
                    href={invite}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-brand no-underline hover:text-text-bright"
                  >
                    {invite}
                  </a>
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard?.writeText(invite)}
                    className={ACTION_QUIET}
                  >
                    <Copy size={11} aria-hidden="true" />
                    Copy
                  </button>
                </p>
              )}
            </div>
          )}
        </>
      )}

      <RolePicker
        roles={roles}
        onToggle={role =>
          setRoles(current =>
            current.includes(role) ? current.filter(r => r !== role) : [...current, role],
          )
        }
      />

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={!canSend || send.isPending}
          onClick={() => send.mutate()}
          className={ACTION_PRIMARY}
        >
          <UserPlus size={15} aria-hidden="true" />
          {send.isPending ? "Sending…" : editing ? "Save roles and re-ask" : "Send invitation"}
        </button>
        <button type="button" onClick={onCancel} className={ACTION}>
          Cancel
        </button>
      </div>

      {(picked !== null || editing !== undefined) && roles.length === 0 && (
        <p className="mt-2 text-xs text-text-dim">Pick at least one role for them.</p>
      )}

      <ErrorLine
        message={refusal ? refusal.message : send.isError ? errorMessage(send.error) : null}
      />
    </div>
  );
}

/**
 * A search result's Discord avatar.
 *
 * The guild search returns a raw avatar **hash**, unlike a member on an application whose avatar
 * upstream has already resolved to a url — so this is the one face on the site the client builds
 * itself, through `discordAvatarUrl`. It used to render an initial for exactly that reason, which
 * left the picker showing letters beside a roster of real photographs.
 *
 * The initial survives as the fallback for a hash the CDN no longer serves — an avatar changed
 * between the search and the render — rather than a broken image in a list of faces.
 */
function CandidateFace({ candidate }: { candidate: GuildMemberCandidate }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-bg3 font-heading text-[11px] text-text-secondary">
        {candidate.displayName.slice(0, 1)}
      </span>
    );
  }

  return (
    <img
      src={discordAvatarUrl(candidate.userId, candidate.avatar)}
      alt=""
      width={28}
      height={28}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className="h-7 w-7 shrink-0 rounded-full border border-border"
    />
  );
}

/**
 * The bench position a substitute is sent with: the one they already hold when their roles are being
 * edited, otherwise the lowest ordinal no other live substitute on this roster holds.
 *
 * Never shown and never asked for. The picker used to offer "Substitute 1" through "Substitute 5"
 * and warn that two could not share a slot, which made a captain choose a number that meant nothing
 * to them and was not even true: upstream keys roles on `(member, role)` with no uniqueness on the
 * slot and only counts substitutes (see `SUB_ORDINAL_MAX`). The ordinal orders the bench for display
 * and that is all, so spreading live subs across distinct positions is a courtesy to that order, and
 * when all five are taken the sixth lands on zero and the readiness checklist says "five at most".
 *
 * Only `accepted` and `pending` members hold a position. A declined or revoked substitute is history,
 * and keeping their slot reserved would leave the bench with a hole nobody can see.
 */
function nextSubOrdinal(
  members: readonly ApplicationMember[],
  editing?: ApplicationMember,
): number {
  const own = editing?.roles.find(r => r.role === "sub");
  if (own) return own.ordinal;

  const taken = new Set(
    members
      .filter(m => m.id !== editing?.id && (m.status === "accepted" || m.status === "pending"))
      .flatMap(m => m.roles.filter(r => r.role === "sub").map(r => r.ordinal)),
  );
  for (let ordinal = 0; ordinal <= SUB_ORDINAL_MAX; ordinal++) {
    if (!taken.has(ordinal)) return ordinal;
  }
  return 0;
}

interface RolePickerProps {
  roles: readonly TeamMemberRole[];
  onToggle: (role: TeamMemberRole) => void;
}

/**
 * The roles being asked for, in two groups, because the two groups behave differently.
 *
 * One person may hold an administrative role *and* a playing role — the owner is often the mid
 * laner — but only ever **one** playing role. That is enforced here as a single-choice control
 * rather than left for the server to refuse after the invitation was already sent.
 *
 * Neither administrative role is required and neither confers anything on this page: `owner` is a
 * label for the league's records, and an application is run by whoever created it.
 */
function RolePicker({ roles, onToggle }: RolePickerProps) {
  const playing = roles.find(
    role => role === "sub" || (STARTER_ROLES as readonly string[]).includes(role),
  );

  const chip = (selected: boolean) =>
    `rounded-md border px-3 py-1.5 bg-transparent cursor-pointer font-heading text-xs ${
      selected ? "border-brand text-text-bright" : "border-border text-text-secondary"
    }`;

  return (
    <div className="mt-4">
      <span className={LABEL_CLASS}>Position</span>
      <div className="flex flex-wrap gap-1.5">
        {[...STARTER_ROLES, "sub" as const].map(role => (
          <button
            key={role}
            type="button"
            aria-pressed={playing === role}
            onClick={() => {
              if (playing === role) {
                onToggle(role);
                return;
              }
              // Picking a position replaces the previous one rather than adding to it.
              if (playing) onToggle(playing);
              onToggle(role);
            }}
            className={chip(playing === role)}
          >
            {ROLE_LABEL[role]}
          </button>
        ))}
      </div>

      {playing === "sub" && (
        <p className="mt-1.5 text-xs text-text-dim">Up to five substitutes.</p>
      )}

      <span className={`${LABEL_CLASS} mt-4`}>Also</span>
      <div className="flex flex-wrap gap-1.5">
        {(["owner", "contact"] as const).map(role => (
          <button
            key={role}
            type="button"
            aria-pressed={roles.includes(role)}
            onClick={() => onToggle(role)}
            className={chip(roles.includes(role))}
          >
            {ROLE_LABEL[role]}
          </button>
        ))}
      </div>
      {/* Deliberately reassuring rather than a warning. Inviting an owner used to be described as
          handing over the application, which was never true: every write gates on whoever created
          it, so the role records who runs the team for the league and changes nothing here. */}
      {roles.includes("owner") && (
        <p className="mt-1.5 text-xs text-text-dim">
          Owner is how the league records who runs the team. You keep control of this application
          either way — you started it.
        </p>
      )}
    </div>
  );
}
