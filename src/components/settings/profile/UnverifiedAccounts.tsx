/**
 * Adding Riot accounts by name, and the list of the ones not yet proven.
 *
 * A claim is cheap on purpose: the player types a Riot ID, upstream resolves it through Account-v1
 * and stores Riot's canonical spelling, and that is all it does — the account appears here and in the
 * OP.GG link, and nowhere else. It earns nothing until somebody proves control of it, because until
 * then several profiles may be claiming the same account. So the two steps are two steps on screen
 * as well: add, then verify. Collapsing them into one button would promise a link the add cannot
 * deliver.
 *
 * The add form takes a pasted `Name#TAG` in the name field and splits it, because that is how a Riot
 * ID is written everywhere else — including in the row this form produces. Rejecting the format we
 * ourselves display is the kind of small refusal that makes a form feel broken.
 *
 * Nothing here maintains its own copy of the list. Every write invalidates `queryRoots.profiles` and
 * the query above re-reads it, so the claims, the verified cards and the public profile page cannot
 * disagree — a locally-patched list would be the one place the ten-claim ceiling could be miscounted.
 *
 * **Starting a verification challenge lives here rather than in the panel it feeds.** A mutation has
 * to be fired from a component that stays subscribed for as long as it runs: React's StrictMode tears
 * the subscription down between its two effect passes, and `MutationObserver.onUnsubscribe` detaches
 * the observer from the mutation, so one launched by a mounting child's effect resolves into a cache
 * nobody is listening to and the child sits on `isPending` for good. This row survives the panel, and
 * a click is a real user event, so the challenge is started from the button and handed down.
 */

import { useState } from "react";
import { Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  addUnverifiedAccount,
  errorMessage,
  removeUnverifiedAccount,
  startIconVerification,
  MAX_UNVERIFIED_ACCOUNTS,
  RIOT_GAME_NAME_MAX,
  RIOT_TAG_LINE_MAX,
  type IconCheckResult,
  type RiotAccountInput,
  type UnverifiedAccount,
} from "../../../lib/api";
import { useAuth } from "../../../lib/authContext";
import { queryRoots } from "../../../lib/queries";
import { splitRiotId } from "../../../lib/riotId";
import { fmtDay } from "../../../lib/utils";
import { ACTION_SM, ACTION_SM_PRIMARY, ErrorLine } from "../../admin/adminUi";
import { UnverifiedAccountRow } from "../../profile/RiotAccountCards";
import { CONTROL_CLASS, LABEL_CLASS } from "../../stats/FilterBar";
import { IconVerification, verifiedText } from "./IconVerification";
import { OpggImport } from "./OpggImport";

interface Props {
  accounts: readonly UnverifiedAccount[];
  /** `verification.profileIcon` — false hides the Verify controls rather than offering a 503. */
  canVerify: boolean;
}

/**
 * Merge the two form fields into one Riot ID, so a paste into the name field works.
 *
 * The `#` in the name wins over the tag field when it carries a tag of its own: someone who pasted
 * `Faker#KR1` meant `KR1`, whatever was left in the smaller box. A bare trailing `#` falls back to
 * the tag field instead of submitting an empty tag. The split itself is `splitRiotId` — the import
 * beside this form has to read a Riot ID exactly the same way.
 */
function parseRiotId(name: string, tag: string): RiotAccountInput {
  const typed = tag.trim().replace(/^#+/, "");
  const pasted = splitRiotId(name);
  return { gameName: pasted.gameName, tagLine: pasted.tagLine || typed };
}

export function UnverifiedAccounts({ accounts, canVerify }: Props) {
  const qc = useQueryClient();
  const { refresh: refreshIdentity } = useAuth();
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [verifying, setVerifying] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [incomplete, setIncomplete] = useState(false);

  const full = accounts.length >= MAX_UNVERIFIED_ACCOUNTS;
  const refreshAccounts = () => qc.invalidateQueries({ queryKey: queryRoots.profiles });

  /**
   * Mint or resume the challenge for one claim, and open its panel on the answer.
   *
   * `verifying` is set from the *response*, not from the click, so the panel appears with an icon
   * already in hand — there is no half-open state to render, and the button carries the wait instead.
   */
  const start = useMutation({
    mutationFn: (claimId: number) => startIconVerification(claimId),
    onSuccess: challenge => setVerifying(challenge.claimId),
  });

  const challenge = start.data;

  const add = useMutation({
    mutationFn: (input: RiotAccountInput) => addUnverifiedAccount(input),
    onSuccess: async result => {
      // Awaited: the row this opens a panel for has to exist in the list first, or the panel is
      // attached to a claim the list hasn't heard of and disappears on the next render.
      await refreshAccounts();
      setName("");
      setTag("");

      if (result.status === "already_verified") {
        setNotice(`${result.riotId ?? "That account"} is already verified on your profile.`);
        return;
      }
      setNotice(
        result.status === "existing"
          ? `${result.account.riotId ?? "That account"} was already on your list.`
          : null,
      );
      // Straight into verification: adding an account is only ever a step towards proving it, and
      // the panel is where the icon is. Withheld when the deployment can't serve the challenge.
      // Safe to fire from here — this component stays mounted, unlike the panel it opens.
      if (canVerify) start.mutate(result.account.claimId);
    },
  });

  const remove = useMutation({
    mutationFn: (claimId: number) => removeUnverifiedAccount(claimId),
    onSuccess: async (_void, claimId) => {
      await refreshAccounts();
      if (verifying === claimId) setVerifying(null);
      setNotice(null);
    },
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const input = parseRiotId(name, tag);
    if (!input.gameName || !input.tagLine) {
      setIncomplete(true);
      return;
    }
    setIncomplete(false);
    setNotice(null);
    add.mutate(input);
  };

  const onVerified = async (result: Extract<IconCheckResult, { status: "verified" }>) => {
    setVerifying(null);
    setNotice(verifiedText(result));
    // The identity too, not just the list: the new puuid is on `/auth/me`, and this section's own
    // fallback copy counts it.
    await Promise.all([refreshAccounts(), refreshIdentity()]);
  };

  return (
    <div className="mt-6 border-t border-border pt-5">
      <h3 className="font-heading text-sm uppercase tracking-wider text-text-bright">
        Unverified accounts
      </h3>
      <p className="mt-1 text-xs text-text-dim">
        Accounts you've told us about. They show on your profile and in your OP.GG link, but they
        don't count towards rosters or stats until you verify them.
        {/* Adding a claim keeps working when the challenge is switched off upstream —
            `PROFILE_ICON_VERIFICATION_ENABLED=false` disables start and check, not the claim routes.
            So the list is still worth building, and the missing Verify button gets a reason. */}
        {!canVerify && " Icon verification is unavailable right now, so anything added here stays unverified for now."}
      </p>

      {accounts.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {accounts.map(account => (
            <div key={account.claimId}>
              <UnverifiedAccountRow
                account={account}
                actions={
                  <>
                    {account.addedAt && (
                      <span className="shrink-0 font-mono text-[10px] text-text-dim">
                        {fmtDay(account.addedAt)}
                      </span>
                    )}
                    {canVerify && (
                      <button
                        type="button"
                        onClick={() =>
                          verifying === account.claimId
                            ? setVerifying(null)
                            : start.mutate(account.claimId)
                        }
                        disabled={start.isPending}
                        className={ACTION_SM_PRIMARY}
                        aria-expanded={verifying === account.claimId}
                      >
                        <ShieldCheck size={13} aria-hidden="true" />
                        {start.isPending && start.variables === account.claimId
                          ? "Picking an icon…"
                          : "Verify"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => remove.mutate(account.claimId)}
                      disabled={remove.isPending && remove.variables === account.claimId}
                      className={ACTION_SM}
                      aria-label={`Remove ${account.riotId ?? "this account"}`}
                    >
                      <Trash2 size={13} aria-hidden="true" />
                    </button>
                  </>
                }
              />

              {/* Keyed on the challenge, so a restart remounts the panel with clean state rather
                  than carrying an expired verdict and a stale note into the new icon. Two distinct
                  challenges can't share both fields; a *reused* one can, and there the state is
                  worth keeping. */}
              {verifying === account.claimId && challenge?.claimId === account.claimId && (
                <IconVerification
                  key={`${challenge.targetIconId}:${challenge.expiresAt ?? ""}`}
                  claim={account}
                  challenge={challenge}
                  onRestart={() => start.mutate(account.claimId)}
                  restarting={start.isPending}
                  onVerified={onVerified}
                  onClose={() => setVerifying(null)}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {remove.error && <ErrorLine message={errorMessage(remove.error)} />}
      {/* Once, below the list: a challenge that can't be started has nothing to render a panel with,
          so the reason has to live on the row's own level. */}
      {start.error && <ErrorLine message={errorMessage(start.error)} />}

      <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-2" noValidate>
        <div className="min-w-[180px] flex-1">
          <label htmlFor="riot-game-name" className={LABEL_CLASS}>
            Riot ID
          </label>
          <input
            id="riot-game-name"
            value={name}
            onChange={event => setName(event.target.value)}
            placeholder="Name"
            // One over the limit, deliberately: a pasted `Name#TAG` is split before it is sent, so
            // capping the field at the name's own 16 would truncate the tag off the paste.
            maxLength={RIOT_GAME_NAME_MAX + RIOT_TAG_LINE_MAX + 1}
            autoComplete="off"
            disabled={full}
            className={CONTROL_CLASS}
            aria-invalid={incomplete}
          />
        </div>
        <div className="w-24">
          <label htmlFor="riot-tag-line" className={LABEL_CLASS}>
            Tag
          </label>
          <input
            id="riot-tag-line"
            value={tag}
            onChange={event => setTag(event.target.value)}
            placeholder="NA1"
            maxLength={RIOT_TAG_LINE_MAX + 1}
            autoComplete="off"
            disabled={full}
            className={CONTROL_CLASS}
            aria-invalid={incomplete}
          />
        </div>
        <button type="submit" disabled={add.isPending || full} className={ACTION_SM_PRIMARY}>
          <Plus size={13} aria-hidden="true" />
          {add.isPending ? "Adding…" : "Add account"}
        </button>
      </form>

      <p className="mt-2 text-xs text-text-dim">
        {full
          ? `That's all ${MAX_UNVERIFIED_ACCOUNTS} unverified accounts. Verify one, or remove one, to add another.`
          : "Riot IDs are case-insensitive but the tag matters — it's the part after the #."}
      </p>

      {/* Below the single-account form rather than above it: one account is the common case and the
          form is the thing to reach first, but anyone with a team's worth of alts has the link. It
          stays available when the list is full — the preview is what explains that they won't fit,
          which is more use than a hidden control. */}
      <OpggImport accounts={accounts} onDone={setNotice} />

      {incomplete && <ErrorLine message="Enter a Riot ID and its tag, for example Faker#KR1." />}
      {add.error && <ErrorLine message={errorMessage(add.error)} />}
      {notice && <p className="mt-2 text-xs text-text-secondary">{notice}</p>}
    </div>
  );
}
