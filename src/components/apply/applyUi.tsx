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
import { fmtKickoff } from "../../lib/utils";
import {
  TEAM_MEMBER_ROLES,
  type ApplicationDetails,
  type ApplicationMember,
  type ApplicationStatus,
  type InvitationStatus,
  type MemberRiot,
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

/**
 * The starters plus the bench — everyone upstream calls a *player*.
 *
 * The distinction that matters: only these need a linked Riot account, because only these have to
 * be matched to a game. An owner or a contact who never plays is exempt, and saying otherwise would
 * block an org manager from a team they run.
 */
export const PLAYING_ROLES = [...STARTER_ROLES, "sub"] as const;

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
  /** "captain" is whoever runs the application, not the `owner` role — the two are unrelated. */
  perspective?: "captain" | "invitee";
}) {
  const look = INVITATION_LOOK[status];
  const label =
    status === "pending" && perspective
      ? perspective === "captain"
        ? "Waiting for them"
        : "Needs your answer"
      : look.label;
  return <Chip tone={look.tone}>{label}</Chip>;
}

/**
 * A member's Riot standing, or the reason there isn't one.
 *
 * Four states, because upstream serves four and any two of them collapsed together says something
 * untrue. **UNVERIFIED is red on purpose**: it is not a missing nicety, it is the thing stopping
 * this application being submitted, and the readiness checklist says so in words beside it.
 *
 * **PENDING is not UNRANKED.** Upstream has never fetched that account — the chips come from a
 * cache, not a live lookup — and showing "Unranked" there would put it under a Challenger nobody
 * has looked up yet. The refresh button on the application is what resolves it.
 */
export function RankChip({ riot }: { riot: MemberRiot }) {
  if (riot.verifiedAccounts === 0) {
    return (
      <Chip tone="border-ccs-red/50 text-ccs-red" title="No Riot account linked yet">
        Unverified
      </Chip>
    );
  }
  if (riot.rank) {
    return (
      <Chip
        tone="border-ccs-gold/50 text-ccs-gold"
        title={riot.fetchedAt ? `Checked ${fmtKickoff(riot.fetchedAt)}` : undefined}
      >
        {riot.rank.label}
      </Chip>
    );
  }
  return (
    <Chip
      tone="border-border text-text-dim"
      title={riot.cached ? "No ranked games this split" : "Not checked yet — use Refresh ranks"}
    >
      {riot.cached ? "Unranked" : "Rank pending"}
    </Chip>
  );
}

/** Whether this member's roles put them in the lineup, and therefore under the account rule. */
export function isPlaying(roles: readonly MemberRoleAssignment[]): boolean {
  return roles.some(r => (PLAYING_ROLES as readonly string[]).includes(r.role));
}

function Chip({
  tone,
  title,
  children,
}: {
  tone: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <span
      title={title}
      className={`inline-block shrink-0 rounded-full border px-2.5 py-0.5 font-heading text-[10px] uppercase tracking-wider ${tone}`}
    >
      {children}
    </span>
  );
}

/** How many default avatars Discord cycles through since the discriminator was retired. */
const DISCORD_DEFAULT_AVATARS = 6n;

/**
 * A displayable Discord avatar url, built from a raw hash.
 *
 * **This is the one place the client owns that rule**, and it exists because the guild member
 * search is the one Discord read whose `avatar` is a raw hash rather than a finished url — upstream
 * resolves it for a profile the moment it stores one, but a search hit has no profile yet. Without
 * this the invite picker showed an initial in a circle while every other face on the same screen
 * was a real photo.
 *
 * Two rules, both easy to get wrong, which is why they are written down rather than inlined:
 *
 *  - An animated avatar's hash starts with `a_` and must be requested as `.gif`. Asking for `.png`
 *    gets a still frame, which is fine; asking for `.gif` on a static hash 404s.
 *  - A user with no avatar has no CDN entry at all. The numbered default is keyed on the snowflake,
 *    in BigInt because a snowflake exceeds 2^53 and the shift would be meaningless on a double.
 *
 * Never returns null: a caller rendering a face always has something to point at.
 */
export function discordAvatarUrl(userId: string, hash: string | null, size = 64): string {
  if (hash) {
    const ext = hash.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${userId}/${hash}.${ext}?size=${size}`;
  }

  let index = 0n;
  try {
    index = (BigInt(userId) >> 22n) % DISCORD_DEFAULT_AVATARS;
  } catch {
    // A malformed snowflake should still yield a usable image. Index 0 is a real default avatar.
  }
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
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
    details.rulesAcknowledged ||
    details.ticketOpened;
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
              className="break-all text-brand no-underline hover:text-text-bright"
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
      {/* The applicant's word, not a lookup — nothing here can see Discord. A reviewer who finds no
          ticket for a team that says it opened one has learned something worth asking about. */}
      <div className="flex flex-wrap items-center gap-2">
        <dt className={LABEL_CLASS}>Discord ticket</dt>
        <dd
          className={`flex items-center gap-1.5 ${
            details.ticketOpened ? "text-ccs-green" : "text-ccs-orange"
          }`}
        >
          {details.ticketOpened ? (
            <>
              <Check size={14} aria-hidden="true" />
              Confirmed as opened
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
