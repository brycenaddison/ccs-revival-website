/**
 * Every reader-facing label for prediction wire values: event states, review and skip reasons,
 * ledger kinds, site operations and reward cadences and modes. Components never print a raw wire
 * value.
 *
 * Keyed by the API enums in `api/predictions.ts`, so a new upstream value is a type error here
 * rather than an underscored code on screen. The mapper drops values it does not recognize.
 */

import {
  NO_WINNING_POOL,
  type PredictionLedgerKind,
  type PredictionReviewReason,
  type PredictionRewardCadence,
  type PredictionRewardMode,
  type PredictionSkipReason,
  type PredictionState,
  type PredictionSwitch,
} from "../../lib/api";

export const STATE_LABEL: Record<PredictionState, string> = {
  scheduled: "Scheduled",
  open: "Open",
  locked: "Awaiting result",
  review: "Under review",
  settled: "Settled",
  voided: "Voided",
};

export const REVIEW_REASON_LABEL: Record<PredictionReviewReason, string> = {
  ambiguous_linkage: "Games need linking",
  conflicting_conference: "Games from another league",
  visibility_lost: "League or phase hidden",
  fixture_changed: "Match details changed",
  undated_fixture: "No kickoff time",
  stakes_after_start: "Predictions after kickoff",
  invalid_fixture: "Match no longer valid",
  invalid_game_numbers: "Game numbers need review",
  games_after_clinch: "Games after the series was decided",
  conflicting_teams: "Games list other teams",
  result_changed: "Result changed",
};

export const SKIP_REASON_LABEL: Record<PredictionSkipReason, string> = {
  already_published: "Published",
  predictions_disabled: "Predictions off",
  ambiguous_linkage: "Games need linking",
  hidden_conference: "League not listed",
  inactive_conference: "League not active",
  unpublished_phase: "Phase not published",
  not_a_match: "Not a match",
  unknown_teams: "Teams not set",
  undated_fixture: "No kickoff time",
  deadline_passed: "Already started",
  play_recorded: "Games already recorded",
};

/** `daily` is the reward ledger kind for both cadences, so it reads "Reward". */
export const LEDGER_KIND_LABEL: Record<PredictionLedgerKind, string> = {
  starting: "Starting points",
  daily: "Reward",
  stake: "Prediction placed",
  settlement: "Payout",
  correction: "Correction",
  transfer: "Transfer",
  adjustment: "Adjustment",
  season_close: "Season reset",
};

export const SWITCH_LABEL: Record<PredictionSwitch, { label: string; detail: string }> = {
  publicationEnabled: { label: "Publishing", detail: "League staff can publish new predictions." },
  stakingEnabled: { label: "Placing predictions", detail: "Participants can place new predictions." },
  settlementEnabled: { label: "Automatic settlement", detail: "Finished matches pay out automatically." },
  rewardsEnabled: { label: "Rewards", detail: "Participants can claim their reward points." },
};

export const CADENCE_LABEL: Record<PredictionRewardCadence, string> = {
  daily: "Daily",
  weekly: "Weekly",
};

export const MODE_LABEL: Record<PredictionRewardMode, { label: string; detail: string }> = {
  flat: { label: "Flat", detail: "Every claim pays the same amount." },
  scaling: { label: "Growing", detail: "Each claim in a streak pays one more step, up to the cap." },
};

/** An automatic void has a label; a staff void shows the reason they entered, verbatim. */
export function voidReasonText(reason: string | null): string | null {
  return reason === NO_WINNING_POOL ? "No one picked the winner" : reason;
}
