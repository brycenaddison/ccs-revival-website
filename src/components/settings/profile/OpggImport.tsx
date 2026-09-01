/**
 * Claiming several Riot accounts at once, from a pasted OP.GG multisearch link.
 *
 * Every player who has ever been on a roster already has this link — it is how teams share who is
 * playing, and this site builds one on every profile page. Typing five Riot IDs into a two-field
 * form when the list is already on the clipboard is the kind of work software should be doing.
 *
 * **Parsed here, not upstream.** There is no bulk claim route and this does not need one: the link
 * is a string the browser already has, so the parse costs a render, and each account still goes
 * through the same `POST /profiles/me/accounts` that resolves it through Account-v1. Sending the URL
 * to the server would only move a `split(",")` across the network and invent a second way to create
 * a claim.
 *
 * The parse runs on every keystroke and shows what it found *before* anything is sent. A paste that
 * silently claims the wrong five accounts costs ten clicks to undo, and an import is exactly the
 * shape of feature people distrust — so it says what it will do, and then does that.
 *
 * Adds run **one at a time, and a failure does not stop the rest.** Each one resolves against Riot,
 * so a five-account import is five round trips; firing them together would spike the shared key that
 * match ingest depends on. And the common failure is one dead account in an otherwise good list —
 * aborting there would leave the import half-applied with no record of where it stopped.
 */

import { useMemo, useState } from "react";
import { ClipboardPaste, Import } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  addUnverifiedAccount,
  errorMessage,
  MAX_UNVERIFIED_ACCOUNTS,
  type RiotAccountInput,
  type UnverifiedAccount,
} from "../../../lib/api";
import { parseOpggImport, riotIdText, type SkippedEntry } from "../../../lib/riotId";
import { queryRoots } from "../../../lib/queries";
import { ACTION_SM, ACTION_SM_PRIMARY, ErrorLine } from "../../admin/adminUi";
import { LABEL_CLASS } from "../../stats/FilterBar";

interface Props {
  /** The claims already on the profile, so the preview can say which of these are new. */
  accounts: readonly UnverifiedAccount[];
  /** Fired once the whole batch has been attempted and the list refetched. */
  onDone: (summary: string) => void;
}

/** What one skipped entry gets told to the player, grouped by reason rather than listed one by one. */
function skipNote(skipped: SkippedEntry[]): string {
  const untagged = skipped.filter(s => s.reason === "no-tag");
  const oversized = skipped.filter(s => s.reason === "too-long");
  const parts: string[] = [];

  // Named rather than counted: an old-style link is *every* entry, and "5 skipped" without the
  // reason reads as the import being broken rather than the link being from before Riot IDs.
  if (untagged.length > 0) {
    parts.push(
      `${untagged.map(s => s.text).join(", ")} — no #tag, so ${untagged.length === 1 ? "it isn't" : "they aren't"} a full Riot ID`,
    );
  }
  if (oversized.length > 0) {
    parts.push(`${oversized.map(s => s.text).join(", ")} — longer than Riot allows`);
  }
  return `Skipped ${parts.join("; ")}.`;
}

export function OpggImport({ accounts, onDone }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  const remaining = MAX_UNVERIFIED_ACCOUNTS - accounts.length;

  const { fresh, known, skipped, dropped } = useMemo(() => {
    const parsed = parseOpggImport(text);
    // Riot's canonical spelling on an existing claim, against the typed one here. Both lowercased:
    // Riot IDs are case-insensitive, and a claim added as `faker#kr1` comes back as `Faker#KR1`.
    const held = new Set(
      accounts.flatMap(a => (a.riotId ? [a.riotId.toLowerCase()] : [])),
    );
    const isHeld = (account: RiotAccountInput) => held.has(riotIdText(account).toLowerCase());
    const all = parsed.accounts.filter(a => !isHeld(a));
    return {
      fresh: all.slice(0, Math.max(0, remaining)),
      known: parsed.accounts.filter(isHeld),
      skipped: parsed.skipped,
      // Over the ceiling. Named separately so the button's count and the note agree — a silent
      // truncation here would read as the import having added everything.
      dropped: Math.max(0, all.length - Math.max(0, remaining)),
    };
  }, [text, accounts, remaining]);

  const run = useMutation({
    mutationFn: async (inputs: RiotAccountInput[]) => {
      let added = 0;
      const failed: string[] = [];

      for (const input of inputs) {
        try {
          const result = await addUnverifiedAccount(input);
          // `existing` and `already_verified` both mean the account is accounted for; only a fresh
          // claim is worth counting, or the summary would congratulate the player on nothing.
          if (result.status === "created") added += 1;
        } catch (failure) {
          failed.push(`${riotIdText(input)} (${errorMessage(failure)})`);
        }
      }

      return { added, failed };
    },
    onSuccess: async ({ added, failed }) => {
      await qc.invalidateQueries({ queryKey: queryRoots.profiles });
      setText("");
      setOpen(false);

      const parts = [added === 1 ? "Added 1 account." : `Added ${added} accounts.`];
      if (failed.length > 0) parts.push(`Couldn't add ${failed.join("; ")}.`);
      onDone(parts.join(" "));
    },
  });

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={`${ACTION_SM} mt-3`}>
        <Import size={13} aria-hidden="true" />
        Import from an OP.GG link
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-md border border-border bg-bg3 p-3">
      <label htmlFor="opgg-import" className={LABEL_CLASS}>
        OP.GG multisearch link
      </label>
      <textarea
        id="opgg-import"
        value={text}
        onChange={event => setText(event.target.value)}
        rows={2}
        autoFocus
        placeholder="https://op.gg/lol/multisearch/na?summoners=…"
        spellCheck={false}
        // Not `CONTROL_CLASS`: that token is sized for a single-line input and pins the height.
        className="mt-1 w-full resize-y rounded-md border border-border bg-bg-input px-3 py-2 font-mono text-xs text-text placeholder:text-text-dim focus:border-brand focus:outline-none"
      />
      <p className="mt-1.5 text-xs text-text-dim">
        Paste the whole link, or just the Riot IDs separated by commas. Nothing is added until you
        press the button.
      </p>

      {text.trim() !== "" && (
        <div className="mt-2 flex flex-col gap-1 text-xs">
          {fresh.length > 0 && (
            <p className="flex flex-wrap items-center gap-1.5 text-text-secondary">
              <ClipboardPaste size={12} aria-hidden="true" className="text-text-dim" />
              {fresh.map(account => (
                <span
                  key={riotIdText(account)}
                  className="rounded bg-bg2 px-1.5 py-0.5 font-mono text-text-bright"
                >
                  {riotIdText(account)}
                </span>
              ))}
            </p>
          )}
          {fresh.length === 0 && (
            <p className="text-text-dim">
              {known.length > 0
                ? "Every account in that link is already on your list."
                : "No Riot IDs found in that. A multisearch link looks like op.gg/lol/multisearch/na?summoners=…"}
            </p>
          )}
          {known.length > 0 && fresh.length > 0 && (
            <p className="text-text-dim">
              {known.length === 1
                ? "1 more is already on your list."
                : `${known.length} more are already on your list.`}
            </p>
          )}
          {dropped > 0 && (
            <p className="text-ccs-orange">
              {dropped === 1 ? "1 account won't fit" : `${dropped} accounts won't fit`} — you can
              hold {MAX_UNVERIFIED_ACCOUNTS} unverified at a time. Verify or remove some, then import
              the rest.
            </p>
          )}
          {skipped.length > 0 && <p className="text-text-dim">{skipNote(skipped)}</p>}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={fresh.length === 0 || run.isPending}
          onClick={() => run.mutate(fresh)}
          className={ACTION_SM_PRIMARY}
        >
          <Import size={13} aria-hidden="true" />
          {run.isPending
            ? "Adding…"
            : fresh.length <= 1
              ? "Add account"
              : `Add ${fresh.length} accounts`}
        </button>
        <button
          type="button"
          disabled={run.isPending}
          onClick={() => {
            setText("");
            setOpen(false);
          }}
          className={ACTION_SM}
        >
          Cancel
        </button>
      </div>

      {run.error && <ErrorLine message={errorMessage(run.error)} />}
    </div>
  );
}
