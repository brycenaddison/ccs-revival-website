import type { UseQueryOptions } from "@tanstack/react-query";
import type {
  PlayerSummary, ProfileSearchResult, RiotAccountInput, RosterRiotAcceptance,
  RosterRiotPreview, RosterDiscordAcceptance, RosterDiscordSearch,
} from "../../lib/api";

/** Query factories live in lib/queries; an adapter can use any authorized context's key family. */
export type PickerQueryOptions<T> = Omit<UseQueryOptions<T>, "enabled"> & { enabled: boolean };

interface PlayerSource {
  /** Changes whenever authorization or the caller's context changes; remounts pending work. */
  contextKey: string;
  enabled: boolean;
}

export interface RiotPlayerSource extends PlayerSource {
  searchOptions: (q: string) => PickerQueryOptions<ProfileSearchResult[]>;
  previewOptions: (input: RiotAccountInput) => PickerQueryOptions<RosterRiotPreview>;
  accept: (input: RosterRiotAcceptance) => Promise<PlayerSummary>;
}

export interface DiscordPlayerSource extends PlayerSource {
  searchOptions: (q: string) => PickerQueryOptions<RosterDiscordSearch>;
  accept: (input: RosterDiscordAcceptance) => Promise<PlayerSummary>;
}

export type PlayerPickerMode =
  | { mode: "profile"; source?: never }
  | { mode: "riot"; source: RiotPlayerSource }
  | { mode: "discord"; source: DiscordPlayerSource };

export interface PlayerPickerOptions {
  placed?: ReadonlySet<number>;
  placedText?: string;
}

export function pickerContext(config: PlayerPickerMode): string {
  return config.mode === "profile" ? "profile" : `${config.mode}:${config.source.contextKey}`;
}
