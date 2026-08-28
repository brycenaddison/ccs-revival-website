/**
 * Proving one claimed Riot account, by changing its profile icon to the one the server picked.
 *
 * The flow is a conversation with a deadline rather than a form: the server names an icon, the player
 * changes it in the League client, and we ask Riot whether it moved. Three limits run at once and each
 * is upstream's rule, not ours — the challenge expires after fifteen minutes, checks are refused for
 * ten seconds after the last one, and there are thirty checks in total. All three are surfaced,
 * because a disabled button with no reason beside it is what makes a player reload the page and
 * abandon a challenge they were halfway through.
 *
 * **Riot's copy of a profile lags the client by around two minutes, and the instructions say so.**
 * Saving the icon in League does not make it visible to the API — that read is served from a cache
 * that catches up a couple of minutes later, so the first checks after a save are *expected* to come
 * back `pending`. Left unsaid, that reads as the flow being broken, and the player answers it the way
 * anyone would: by checking again. The ten-second cooldown means twelve of the thirty checks fit
 * inside the two minutes where Riot cannot say yes, which is how a challenge reaches `exhausted`
 * before it was ever going to succeed. So the wait is a numbered step ahead of the Check step, the
 * `pending` note names the two minutes rather than saying "a moment", and the `exhausted` note
 * explains that asking faster doesn't help. The number is Riot's behavior, not a served value —
 * if upstream ever publishes one, that is the thing to render here.
 *
 * **Every limit is held as a wall-clock instant, never as a counter we decrement.** `expiresAt` and
 * `retryAfterSeconds` become `Date.now()`-based targets the moment they arrive, and one interval
 * re-renders against them. A decremented counter drifts, and worse, it stops when the tab is
 * backgrounded — which is exactly when the player is in League doing the thing we asked.
 *
 * **The challenge is a prop, and starting one is the parent's job.** This panel used to start its own
 * on mount, which does not survive StrictMode: React tears the subscription down between its two
 * effect passes, and `MutationObserver.onUnsubscribe` detaches the observer from the mutation it just
 * launched (`query-core/mutationObserver.js`). Nothing re-attaches it, so the POST succeeds, the cache
 * holds the result, and the component sits on `isPending` forever. A mutation has to be fired from a
 * component that stays subscribed while it runs — in practice, from a real user event. So the Verify
 * click starts it and this panel only appears once there is something to show.
 *
 * **`exhausted` is the one outcome that must not offer "start again".** Thirty checks are spent but
 * the challenge has not expired, and starting again returns *that same* challenge — still exhausted.
 * The only real advice is to wait for the clock, so the button is withheld until it runs out.
 *
 * State resets between challenges by remounting: the parent keys this on the challenge, so a restart
 * clears an expired verdict and a stale note without an effect that reaches back into props.
 */

import { useEffect, useMemo, useState } from "react";
import { ImageOff, RefreshCw, ShieldCheck, X } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import {
  checkIconVerification,
  errorMessage,
  type IconChallenge,
  type IconCheckResult,
  type UnverifiedAccount,
} from "../../../lib/api";
import { ACTION_SM, ACTION_SM_PRIMARY, ErrorLine } from "../../admin/adminUi";
import { profileIconUrl } from "../../profile/RiotAccountCards";

/** The statuses that end a challenge rather than describing its progress. */
type DeadStatus = Exclude<IconCheckResult["status"], "verified" | "pending" | "cooldown">;

interface Props {
  claim: UnverifiedAccount;
  challenge: IconChallenge;
  /** Mint or resume a challenge for this claim. Owned by the parent — see the header. */
  onRestart: () => void;
  restarting: boolean;
  /** The claim is now a verified account: the caller refetches the list and closes this panel. */
  onVerified: (result: Extract<IconCheckResult, { status: "verified" }>) => void;
  onClose: () => void;
}

/**
 * A once-a-second re-render, and only while something is still counting down.
 *
 * `until` is the latest instant any clock on screen is waiting for. Once it passes, the effect stops
 * scheduling itself — a settings panel that leaves an interval running is a page that never idles,
 * and there is nothing left to recompute after the last deadline.
 */
function useNow(until: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (until <= now) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [until, now]);

  return now;
}

const secondsUntil = (target: number, now: number): number =>
  Math.max(0, Math.ceil((target - now) / 1000));

/** `4:31` — the shape a countdown is read in. Minutes unpadded, seconds always padded. */
const countdownText = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

export function IconVerification({
  claim,
  challenge,
  onRestart,
  restarting,
  onVerified,
  onClose,
}: Props) {
  /** When the next check is allowed — both a `pending` result and a `cooldown` refusal land here. */
  const [readyAt, setReadyAt] = useState(0);
  const [deadStatus, setDeadStatus] = useState<DeadStatus | null>(null);
  const [note, setNote] = useState<string | null>(null);
  /**
   * The artwork didn't load.
   *
   * Worth its own state rather than leaving the browser's broken-image glyph to speak, because the
   * icon *is* the instruction here: a panel telling someone to pick an icon it cannot show them is
   * unusable, and silence reads as the challenge having failed rather than the picture. There is no
   * fallback to fall back *to* — the numeric icon id is a join key between us and Riot and means
   * nothing to a player — so this says the picture is missing and to try again, which is the only
   * honest instruction left.
   */
  const [artworkFailed, setArtworkFailed] = useState(false);

  /**
   * When the challenge stops being accepted.
   *
   * `expiresAt` is authoritative. `secondsRemaining` is only its value at the moment the response was
   * written, so it is read *once*, against the arrival of this challenge — which is what the memo's
   * dependency pins it to. Recomputing it every render would push the deadline forward a second at a
   * time and the clock would never move.
   */
  const deadline = useMemo(() => {
    const expires = challenge.expiresAt ? Date.parse(challenge.expiresAt) : NaN;
    return Number.isNaN(expires) ? Date.now() + challenge.secondsRemaining * 1000 : expires;
  }, [challenge]);

  const check = useMutation({
    mutationFn: () => checkIconVerification(claim.claimId),
    onSuccess: result => {
      if (result.status === "verified") {
        onVerified(result);
        return;
      }
      if (result.status === "pending") {
        setReadyAt(Date.now() + result.retryAfterSeconds * 1000);
        setNote(
          "Riot is still showing the old icon. Its copy of your profile catches up about two minutes after you save, so if you've only just changed it, wait a little longer before checking again.",
        );
        return;
      }
      if (result.status === "cooldown") {
        setReadyAt(Date.now() + result.retryAfterSeconds * 1000);
        setNote(null);
        return;
      }
      setDeadStatus(result.status);
      setNote(DEAD_NOTE[result.status]);
    },
  });

  const now = useNow(Math.max(deadline, readyAt));
  const secondsLeft = secondsUntil(deadline, now);
  const cooldown = secondsUntil(readyAt, now);
  const expired = deadStatus === "expired" || secondsLeft === 0;

  /** Nothing this panel can do about it: the claim or the session is gone, and a reload is the fix. */
  const fatal = deadStatus === "not_found" || deadStatus === "no_profile";
  const canCheck = !fatal && !expired && deadStatus === null;
  const canRestart = !fatal && (expired || deadStatus === "missing");

  return (
    <div className="mt-2 rounded-md border border-accent/40 bg-bg2 p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-heading text-sm uppercase tracking-wider text-text-bright">
            Verify {claim.riotId ?? "this account"}
          </p>
          <p className="mt-0.5 text-xs text-text-secondary">
            Verify your account by setting this account's profile icon to the one below.
          </p>
        </div>
        <button type="button" onClick={onClose} className={ACTION_SM} aria-label="Close verification">
          <X size={13} aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="shrink-0 text-center">
          {/* Not `ChampionIcon`: that is for champion squares, a different Community Dragon path.
              The URL is built from the id by the site's own builder rather than read from the
              payload — one spelling of the CDragon path for every profile icon on the site, the same
              rule champion squares follow. `targetIconUrl` stays on the type because it is what
              upstream sends, but a served string cannot be more correct than the id it was built
              from, and preferring it would make a bad one unfixable from here. */}
          {artworkFailed ? (
            <div className="grid h-[88px] w-[88px] place-items-center rounded-md border border-dashed border-border2 bg-bg px-2">
              <ImageOff size={20} className="text-text-dim" aria-hidden="true" />
            </div>
          ) : (
            <img
              src={profileIconUrl(challenge.targetIconId)}
              alt="The profile icon to set on this account"
              width={88}
              height={88}
              decoding="async"
              onError={() => setArtworkFailed(true)}
              className={`h-[88px] w-[88px] rounded-md border border-border2 ${canCheck ? "" : "opacity-40"}`}
            />
          )}
        </div>

        <ol className="min-w-[240px] flex-1 list-decimal pl-5 text-sm text-text-secondary">
          <li>Open the League client, signed in as this account.</li>
          <li>Edit your icon, pick the icon shown here, and save.</li>
          <li>Wait a couple minutes, then press Check. Still showing the old icon? Give it another minute and check again.</li>
          {/* Worth saying: the icon is proof at one moment, not a badge the profile has to keep
              wearing. Without this, the flow reads as a permanent cost and people don't finish it. */}
          <li>Once your account is verified, feel free to change your icon back.</li>
        </ol>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border pt-3">
        {canCheck ? (
          <button
            type="button"
            onClick={() => check.mutate()}
            disabled={check.isPending || cooldown > 0}
            className={ACTION_SM_PRIMARY}
          >
            <ShieldCheck size={13} aria-hidden="true" />
            {check.isPending ? "Checking…" : cooldown > 0 ? `Check in ${cooldown}s` : "Check"}
          </button>
        ) : canRestart ? (
          <button type="button" onClick={onRestart} disabled={restarting} className={ACTION_SM_PRIMARY}>
            <RefreshCw size={13} aria-hidden="true" className={restarting ? "animate-spin" : ""} />
            {restarting ? "Starting…" : "Start again"}
          </button>
        ) : null}

        {/* The clock is the reason a button is missing or disabled, so it stays on screen for every
            state that has one — including `exhausted`, where waiting is the whole advice. */}
        {!fatal && (
          <span className="font-mono text-[11px] text-text-dim">
            {expired ? "Challenge expired" : `${countdownText(secondsLeft)} left`}
          </span>
        )}
      </div>

      {artworkFailed && (
        <p className="mt-2 text-xs text-ccs-red">
          The icon's picture didn't load, so there's nothing to copy — reload the page and start
          again.
        </p>
      )}
      {note ? (
        <p className="mt-2 text-xs text-text-secondary">{note}</p>
      ) : (
        challenge.reused && (
          <p className="mt-2 text-xs text-text-secondary">
            Picking up the challenge already running for this account — this icon isn't a new one.
          </p>
        )
      )}
      {expired && deadStatus === null && (
        <p className="mt-2 text-xs text-text-secondary">
          The fifteen minutes ran out. Starting again picks a fresh icon.
        </p>
      )}
      {check.error && (
        <div className="mt-1">
          <ErrorLine message={errorMessage(check.error)} />
        </div>
      )}
    </div>
  );
}

/** What each dead end means for the player, in their terms. See the header on `exhausted`. */
const DEAD_NOTE: Record<DeadStatus, string> = {
  expired: "That challenge expired. Start again to get a fresh icon.",
  exhausted:
    "Thirty checks used on this challenge. It won't accept any more until it expires — wait for the clock, then start again. Riot's copy of your profile only catches up a couple of minutes after you save the icon, so checking more often never makes it arrive sooner.",
  missing: "There's no challenge running for this account. Start one to get an icon.",
  not_found: "That account is no longer on your profile. Reload the page and add it again.",
  no_profile: "Your profile is no longer available. Sign in again.",
};

/**
 * The sentence a successful verification is announced with.
 *
 * Lives beside the flow rather than at the call site because `merged` has to be said out loud: it
 * absorbed another profile and is not reversible. Same rule the RSO notice follows in `authContext`.
 */
export function verifiedText(result: Extract<IconCheckResult, { status: "verified" }>): string {
  const who = result.riotId?.trim() || "that account";
  if (result.linkStatus === "already_linked") return `${who} was already verified on your profile.`;
  if (result.linkStatus === "merged") return `Verified ${who}, merging in the profile that held it.`;
  return `Verified ${who}.`;
}
