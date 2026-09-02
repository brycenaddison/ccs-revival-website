/** Identity, trophies, the four numbers worth seeing first, and the league selector. */

import type { LinkedAccount, ProfileAccolade, ProfileMetrics, ProfilePresentation } from "../../lib/api";
import { fmtPct, primaryAccount } from "../../lib/api";
import { int } from "../../lib/statFormat";
import { CONTROL_CLASS } from "../stats/FilterBar";
import { AccoladeStrip } from "./AccoladeStrip";
import { kdaText, metricText, useConfLabel, useSortedConfs } from "./profileUi";

interface Props {
  profile: ProfilePresentation;
  accounts: readonly LinkedAccount[];
  accolades: readonly ProfileAccolade[];
  totals: ProfileMetrics;
  conf: string | null;
  availableConferences: readonly string[];
  onConfChange: (conf: string) => void;
}

export function ProfileHeader({
  profile,
  accounts,
  accolades,
  totals,
  conf,
  availableConferences,
  onConfChange,
}: Props) {
  const confLabel = useConfLabel();
  const sortConfs = useSortedConfs();
  // The player's highest-ranked account is the one that represents them — the same choice the
  // accounts card makes for which card to render tall. See `primaryAccount`.
  const avatar = primaryAccount(accounts)?.profileIconUrl ?? null;
  const games = totals.games ?? 0;

  return (
    <header className="mb-7 rounded-lg border border-border bg-bg2 p-5 sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 gap-4">
          {avatar ? (
            <img
              src={avatar}
              alt=""
              width={64}
              height={64}
              loading="lazy"
              decoding="async"
              className="h-16 w-16 shrink-0 rounded-lg border border-border"
            />
          ) : (
            <div className="h-16 w-16 shrink-0 rounded-lg border border-border bg-bg3" />
          )}

          <div className="min-w-0">
            <h1 className="mt-0.5 truncate font-display text-[34px] leading-none tracking-widest text-text-bright">
              {profile.nickname}
            </h1>
            <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1 text-sm text-text-secondary">
              {profile.pronouns && <span>{profile.pronouns}</span>}
              {profile.pronouns && profile.pronunciation && <span>•</span>}
              {profile.pronunciation && <span className="italic">{profile.pronunciation}</span>}
            </div>
          </div>
        </div>

        {/* The selector alone on the right of the identity row. The four headline numbers used to sit
            under it, which is what pushed the trophies down to a row of their own — see below. */}
        <label className="shrink-0 font-heading text-xs uppercase tracking-wider text-text-secondary lg:w-[220px]">
          League
          <select
            value={conf ?? ""}
            onChange={event => onConfChange(event.target.value)}
            className={`${CONTROL_CLASS} mt-1.5`}
          >
            <option value="">All leagues</option>
            {sortConfs(availableConferences).map(option => (
              <option key={option} value={option}>{confLabel(option).name}</option>
            ))}
          </select>
        </label>
      </div>

      {/*
        Trophies and headline numbers share one row along the bottom: trophies from the left edge,
        numbers at the right.

        Both were in the wrong place before. The trophies were nested inside the name column, so they
        started 80px in past the avatar and dead-ended where the selector begins — four of them wrapped
        to three cramped lines while the width under the avatar sat empty. The numbers were stacked
        under the selector, which is a 220px column, so four of them wrapped there too.

        Putting them on the same row fixes both and costs nothing: the trophies are a wrapping list
        that wants width, the numbers are a fixed set that wants little, so `flex-1` on the strip
        hands it every pixel the numbers don't need.

        `items-end` rather than `items-center`: each headline is a big value over a small caption, so
        its visual weight sits high — centring the row left the trophy pills floating above the
        numbers they line up against. Aligned on the bottom edge, the pills and the captions share a
        baseline, which is what makes the row read as one line rather than two things at similar
        heights.

        Below the mobile breakpoint the row gives up and stacks: trophies above, numbers beneath. A
        phone has no width to hand the strip, so sharing a row there meant the pills wrapped into a
        narrow ragged column beside the numbers, or the numbers dropped under a half-filled line of
        pills. Two full-width rows read as intended; one row that wraps unpredictably does not.
      */}
      {(accolades.length > 0 || games > 0) && (
        <div className="mt-5 flex flex-col gap-4 md:flex-row md:flex-wrap md:items-end md:gap-x-6 md:gap-y-4">
          <AccoladeStrip accolades={accolades} className="min-w-0 md:flex-1" />
          {/* `ml-auto` rather than `justify-between` on the row: the strip renders nothing at all for
              a player with no trophies, and with `justify-between` that left the numbers as the only
              child and slid them to the left edge. This keeps them at the right either way. */}
          {games > 0 && (
            <dl className="flex shrink-0 flex-wrap gap-x-5 gap-y-2 md:ml-auto">
              <Headline label="Games" value={metricText(totals.games, int)} />
              <Headline
                label="Record"
                value={`${metricText(totals.wins, int)}–${metricText(totals.losses, int)}`}
              />
              <Headline label="Win rate" value={metricText(totals.winPercent, fmtPct)} />
              <Headline label="KDA" value={kdaText(totals.kda)} />
            </dl>
          )}
        </div>
      )}
    </header>
  );
}

/**
 * One headline number: the value, then its caption.
 *
 * Left-aligned at every width. It used to flip to `lg:text-right`, which put each value against its
 * own right edge — so "Games 47" and "KDA Perfect" agreed on nothing, and the column of captions
 * underneath was ragged on both sides. Left-aligning them means the four values line up with each
 * other and each caption lines up with the value above it, which is the alignment a reader actually
 * follows. The group as a whole still sits at the right of the row.
 */
function Headline({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-left">
      <dd className="font-display text-[22px] leading-none tracking-wider text-text-bright">{value}</dd>
      <dt className="mt-1 font-heading text-[9px] uppercase tracking-wider text-text-dim">{label}</dt>
    </div>
  );
}
