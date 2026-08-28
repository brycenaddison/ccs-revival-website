/**
 * Off-site destinations the league configures rather than the code deciding.
 *
 * The Discord invite was hardcoded in the registration page, and by the time the invitation inbox
 * and the member-invite panel each needed it there were three copies of one URL that changes when
 * the server's vanity link does. A build-time variable is the right shape for it: it is the same for
 * every visitor, it is not secret, and a deployment that points at a test server should be able to
 * say so without a code change.
 *
 * **`null` when unset, and every call site has to handle that.** Rendering a dead `href` is worse
 * than rendering no link — a "join the Discord" button that goes nowhere is the one thing more
 * confusing than not offering it — so callers drop the affordance instead of showing a broken one.
 */

/**
 * The CCS Discord invite, or `null` when this deployment wasn't given one.
 *
 * Trailing whitespace is trimmed because a `.env` value pasted from a browser often carries some,
 * and an empty string is treated as unset rather than as a URL.
 */
export const DISCORD_INVITE: string | null =
  import.meta.env.VITE_DISCORD_INVITE?.trim() || null;
