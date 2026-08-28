/**
 * The vocabulary the applicant surfaces are written in — the apply page and the invitation inbox.
 *
 * Both render the same three things: a role, an application's status, and an invitation's status. A
 * player reads these, not an admin, so the wording is different from the admin screens on purpose:
 * `sup` is "Support", `submitted` is "Waiting on staff", and a `pending` invitation is "Waiting for
 * them" or "Waiting for you" depending on which side of it you are.
 */

import { type ReactNode } from "react";
import { Check, X } from "lucide-react";
import { LABEL_CLASS } from "../stats/FilterBar";
import {
  TEAM_MEMBER_ROLES,
  type ApplicationDetails,
  type ApplicationMember,
  type ApplicationStatus,
  type InvitationStatus,
  type MemberRoleAssignment,
  type TeamMemberRole,
} from "../../lib/api";

/** Player-facing names for the role vocabulary. */
export const ROLE_LABEL: Readonly<Record<TeamMemberRole, string>> = {
  owner: "Owner",
  contact: "Contact",
  top: "Top",
  jg: "Jungle",
  mid: "Mid",
  bot: "Bot",
  sup: "Support",
  sub: "Substitute",
};

/**
 * The five starting positions, in lane order.
 *
 * Upstream requires exactly one accepted member in each, which is what makes them different from
 * `owner`, `contact` and `sub` — those are counted, not slotted.
 */
export const STARTER_ROLES = ["top", "jg", "mid", "bot", "sup"] as const;

/** Display order for a member's roles: who they are, then where they play. */
export function sortRoles(roles: readonly MemberRoleAssignment[]): MemberRoleAssignment[] {
  const rank = (role: TeamMemberRole) => TEAM_MEMBER_ROLES.indexOf(role);
  return [...roles].sort((a, b) => rank(a.role) - rank(b.role) || a.ordinal - b.ordinal);
}

/** A member's roles as one readable phrase: "Owner · Contact · Mid". */
export function roleSummary(roles: readonly MemberRoleAssignment[]): string {
  return sortRoles(roles)
    .map(r => (r.role === "sub" ? `${ROLE_LABEL.sub} ${r.ordinal + 1}` : ROLE_LABEL[r.role]))
    .join(" · ");
}

interface StatusLook {
  label: string;
  /** Border and text tone. Deliberately not filled: these sit inside dense lists. */
  tone: string;
}

const APPLICATION_LOOK: Readonly<Record<ApplicationStatus, StatusLook>> = {
  draft: { label: "Draft", tone: "border-border text-text-secondary" },
  submitted: { label: "Waiting on staff", tone: "border-ccs-blue/50 text-ccs-blue" },
  approved: { label: "Approved", tone: "border-ccs-green/50 text-ccs-green" },
  rejected: { label: "Changes needed", tone: "border-ccs-orange/50 text-ccs-orange" },
  withdrawn: { label: "Withdrawn", tone: "border-border text-text-dim" },
  published: { label: "In the league", tone: "border-ccs-gold/50 text-ccs-gold" },
};

/**
 * `rejected` reads as "Changes needed" rather than "Rejected".
 *
 * It is not a final answer: upstream lets the applicant edit a rejected application, which returns
 * it to `draft` and clears the previous decision, and resubmit while intake is open. "Rejected" would
 * tell a captain their season is over when the actual instruction is to fix something and try again.
 */
export function ApplicationStatusPill({ status }: { status: ApplicationStatus }) {
  const look = APPLICATION_LOOK[status];
  return <Chip tone={look.tone}>{look.label}</Chip>;
}

const INVITATION_LOOK: Readonly<Record<InvitationStatus, StatusLook>> = {
  pending: { label: "Pending", tone: "border-ccs-blue/50 text-ccs-blue" },
  accepted: { label: "Accepted", tone: "border-ccs-green/50 text-ccs-green" },
  declined: { label: "Declined", tone: "border-ccs-red/50 text-ccs-red" },
  revoked: { label: "Removed", tone: "border-border text-text-dim" },
};

/**
 * An invitation's state. `perspective` changes only `pending`, which is the one state that means
 * something different to each side — the captain is waiting for them, the invitee for themselves.
 */
export function InvitationStatusPill({
  status,
  perspective,
}: {
  status: InvitationStatus;
  perspective?: "owner" | "invitee";
}) {
  const look = INVITATION_LOOK[status];
  const label =
    status === "pending" && perspective
      ? perspective === "owner"
        ? "Waiting for them"
        : "Needs your answer"
      : look.label;
  return <Chip tone={look.tone}>{label}</Chip>;
}

function Chip({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span
      className={`inline-block shrink-0 rounded-full border px-2.5 py-0.5 font-heading text-[10px] uppercase tracking-wider ${tone}`}
    >
      {children}
    </span>
  );
}

/**
 * A member's Discord avatar, or a placeholder of the same size.
 *
 * `avatar` is a finished CDN url from upstream, never a hash — see `ApplicationMember`. A member
 * invited by guild search always has one, because the invitation resolved them through Discord.
 */
export function MemberAvatar({ member }: { member: Pick<ApplicationMember, "avatar" | "name"> }) {
  if (!member.avatar) {
    return <div className="h-7 w-7 shrink-0 rounded-full border border-border bg-bg3" />;
  }
  return (
    <img
      src={member.avatar}
      alt=""
      width={28}
      height={28}
      loading="lazy"
      decoding="async"
      className="h-7 w-7 shrink-0 rounded-full border border-border"
    />
  );
}

/**
 * The supplementary answers, read-only.
 *
 * Shared by the applicant's own card and the roster-staff review queue, because they want to see the
 * same thing — the experience write-up is the single most useful field a reviewer has, and an
 * applicant should be looking at exactly what staff will read. Renders nothing when every field is
 * empty, so an application that skipped all of them costs no vertical space.
 */
export function ApplicationDetailsBlock({ details }: { details: ApplicationDetails }) {
  const hasAny =
    details.organizationName !== null ||
    details.twitter !== null ||
    details.experience !== null ||
    details.rulesAcknowledged;
  if (!hasAny) return null;

  return (
    <dl className="mt-3 flex flex-col gap-2 border-t border-border pt-3 text-sm">
      {details.organizationName && (
        <div className="flex flex-wrap gap-x-2">
          <dt className={LABEL_CLASS}>Organization</dt>
          <dd className="text-text">{details.organizationName}</dd>
        </div>
      )}
      {details.twitter && (
        <div className="flex flex-wrap gap-x-2">
          <dt className={LABEL_CLASS}>Twitter / X</dt>
          <dd className="min-w-0">
            <a
              href={details.twitter}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-accent no-underline hover:text-text-bright"
            >
              {details.twitter}
            </a>
          </dd>
        </div>
      )}
      {details.experience && (
        <div>
          <dt className={LABEL_CLASS}>Experience</dt>
          {/* `whitespace-pre-wrap`, not Markdown: this is a free-text answer from a form, and running
              it through the shared renderer would let an applicant style a review queue. */}
          <dd className="whitespace-pre-wrap text-text-secondary">{details.experience}</dd>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <dt className={LABEL_CLASS}>Rules</dt>
        <dd
          className={`flex items-center gap-1.5 ${
            details.rulesAcknowledged ? "text-ccs-green" : "text-ccs-orange"
          }`}
        >
          {details.rulesAcknowledged ? (
            <>
              <Check size={14} aria-hidden="true" />
              Confirmed as read
            </>
          ) : (
            <>
              <X size={14} aria-hidden="true" />
              Not confirmed
            </>
          )}
        </dd>
      </div>
    </dl>
  );
}

/** How a member should be named, in descending order of how much it tells you. */
export function memberLabel(member: Pick<ApplicationMember, "name" | "handle" | "profileId">): string {
  return member.name ?? member.handle ?? `Profile ${member.profileId}`;
}
