/**
 * Riot IDs as text, and the OP.GG multisearch links people paste them in.
 *
 * A Riot ID is written `Name#TAG` everywhere a player sees one — in the client, on OP.GG, in the
 * rows this site renders — so every field that takes one has to accept it written that way. The
 * splitting used to live in the claims form; it is here because the import below needs exactly the
 * same rule, and two spellings of "where does the tag start" would eventually disagree.
 *
 * **Nothing here validates.** `splitRiotId` will hand back a name Riot has never heard of, and the
 * import will happily pass one along. Resolution is `POST /profiles/me/accounts`, which runs the ID
 * through Account-v1 and answers with Riot's canonical spelling — the only authority on whether an
 * account exists. What this module refuses is only what *cannot be sent*: an entry with no tag at
 * all, because the route takes `gameName` and `tagLine` as separate required fields.
 */

import { RIOT_GAME_NAME_MAX, RIOT_TAG_LINE_MAX, type RiotAccountInput } from "./api";

/**
 * Split one written Riot ID into the two fields the API wants.
 *
 * The tag is everything after the **first** `#`: a name cannot contain one, so a second is the
 * player's typo rather than a delimiter, and keeping it in the tag lets the server say so instead of
 * this quietly changing what they typed.
 */
export function splitRiotId(text: string): RiotAccountInput {
  const hash = text.indexOf("#");
  if (hash < 0) return { gameName: text.trim(), tagLine: "" };
  return {
    gameName: text.slice(0, hash).trim(),
    tagLine: text.slice(hash + 1).trim().replace(/^#+/, ""),
  };
}

/** Why an entry in a pasted link could not be turned into a claim. */
export type SkipReason =
  /** No `#tag`. Old multisearch links are summoner names, which Riot IDs replaced. */
  | "no-tag"
  /** Longer than Riot allows on that half, so the route would refuse it. */
  | "too-long";

export interface SkippedEntry {
  /** Exactly what was in the link, decoded — so the player can see which one to fix. */
  text: string;
  reason: SkipReason;
}

export interface OpggImport {
  accounts: RiotAccountInput[];
  skipped: SkippedEntry[];
}

const EMPTY: OpggImport = { accounts: [], skipped: [] };

/**
 * Undo query-string encoding across the whole `summoners` value.
 *
 * `URLSearchParams` would be the obvious tool and is the wrong one here — see `parseOpggImport` for
 * why this never becomes a `URL`. So the two encodings are undone by hand: `+` for a space, then
 * percent-escapes. A malformed escape (`%zz`, or a bare `%` somebody typed) throws out of
 * `decodeURIComponent`, and the raw text is a better answer than losing the whole paste.
 *
 * **Whole value, before splitting, and that order is the point.** The separator OP.GG writes is
 * `%2C`, not a literal comma — `summoners=Someone%23NA1%2CAlt+Account%23NA1%2C` — so splitting first
 * finds nothing to split on and yields one entry with four accounts crammed into its tag. Decoding
 * first turns every separator, encoded or not, into the comma the split is looking for.
 */
function decodeList(raw: string): string {
  const plus = raw.replace(/\+/g, " ");
  try {
    return decodeURIComponent(plus);
  } catch {
    return plus;
  }
}

/**
 * Pull every Riot ID out of an OP.GG multisearch link.
 *
 * Also accepts a bare list — comma or newline separated — because that is what someone who copied
 * the names rather than the link will paste, and refusing it would send them back to OP.GG for a URL
 * whose contents they already have.
 *
 * **The link is read as text, never as a `URL`.** A multisearch link's `summoners` value contains
 * `#` once per account, and only OP.GG's own copy button percent-encodes them: paste one out of the
 * address bar, or type one, and every `#` is a fragment delimiter. `new URL(…).searchParams` honors
 * that and returns the first account with everything after it thrown away — which looks like the
 * import working and silently dropping four of five accounts. Scanning for `summoners=` and reading
 * to the next `&` treats those `#`s as the data they are.
 *
 * Deduplicates case-insensitively, because Riot IDs are: a link pasted twice, or one holding both
 * `Faker#KR1` and `faker#kr1`, is one account and should offer to add one.
 */
export function parseOpggImport(text: string): OpggImport {
  const trimmed = text.trim();
  if (trimmed === "") return EMPTY;

  // Case-insensitive: the parameter is `summoners` from every generator we know of, but a URL that
  // came back through something that title-cased its query is still the link the player copied.
  const marker = trimmed.search(/[?&]summoners=/i);
  let list = trimmed;
  if (marker >= 0) {
    const start = trimmed.indexOf("=", marker) + 1;
    const end = trimmed.indexOf("&", start);
    list = end < 0 ? trimmed.slice(start) : trimmed.slice(start, end);
  } else if (/^https?:\/\//i.test(trimmed)) {
    // A link with no `summoners` at all is a single-summoner page or something else entirely.
    // Splitting it on commas would produce nonsense claims out of path segments.
    return EMPTY;
  }

  const accounts: RiotAccountInput[] = [];
  const skipped: SkippedEntry[] = [];
  const seen = new Set<string>();

  for (const raw of decodeList(list).split(/[,\n]/)) {
    const entry = raw.trim();
    // The trailing comma every generated multisearch ends with, and any the player left in.
    if (entry === "") continue;

    const account = splitRiotId(entry);
    if (!account.gameName || !account.tagLine) {
      skipped.push({ text: entry, reason: "no-tag" });
      continue;
    }
    if (
      account.gameName.length > RIOT_GAME_NAME_MAX ||
      account.tagLine.length > RIOT_TAG_LINE_MAX
    ) {
      skipped.push({ text: entry, reason: "too-long" });
      continue;
    }

    const key = riotIdText(account).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    accounts.push(account);
  }

  return { accounts, skipped };
}

/** `Name#TAG`, the way a Riot ID is written. The key both sides of the import compare on. */
export function riotIdText(account: RiotAccountInput): string {
  return `${account.gameName}#${account.tagLine}`;
}
