/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the tournament-bot HTTP API. */
  readonly VITE_API_BASE_URL?: string;
  /**
   * Comma-separated conf ids to treat as the current league, e.g. "4" or "wed,thu".
   * Takes precedence over the `active` flag on /tournaments (which does not exist yet).
   */
  readonly VITE_ACTIVE_CONFS?: string;
  /**
   * Invite URL for the CCS Discord, e.g. "https://discord.gg/ccslol".
   *
   * Read through `lib/siteLinks.ts`, which resolves an unset or blank value to `null` — the surfaces
   * that offer it drop the link rather than rendering a dead one.
   */
  readonly VITE_DISCORD_INVITE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
