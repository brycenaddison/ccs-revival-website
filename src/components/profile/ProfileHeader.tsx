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
            <AccoladeStrip accolades={accolades} />
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-3 lg:items-end">
          <label className="min-w-[220px] font-heading text-xs uppercase tracking-wider text-text-secondary">
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

          {games > 0 && (
            <dl className="flex flex-wrap gap-x-5 gap-y-2">
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
      </div>
    </header>
  );
}

function Headline({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-left lg:text-right">
      <dd className="font-display text-[22px] leading-none tracking-wider text-text-bright">{value}</dd>
      <dt className="mt-1 font-heading text-[9px] uppercase tracking-wider text-text-dim">{label}</dt>
    </div>
  );
}
