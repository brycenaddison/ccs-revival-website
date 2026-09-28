/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The canonical production origin; Vite supplies the shared CCS default when unset. */
  readonly VITE_SITE_ORIGIN: string;
  /** Base URL of the tournament-bot HTTP API. */
  readonly VITE_API_BASE_URL?: string;
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
