/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the tournament-bot HTTP API. */
  readonly VITE_API_BASE_URL?: string;
  /**
   * Comma-separated conf ids to treat as the current league, e.g. "4" or "wed,thu".
   * Takes precedence over the `active` flag on /tournaments (which does not exist yet).
   */
  readonly VITE_ACTIVE_CONFS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
