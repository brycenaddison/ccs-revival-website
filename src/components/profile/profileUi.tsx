/**
 * The small vocabulary the player profile is written in.
 *
 * What lives here is what more than one section needs and no single section owns: the rail card
 * frame, the conf→league-name resolver, the team logo, and the number formatting the page has to
 * agree on — `kdaText`'s "Perfect", and the two colour scales that make a 320px rail skimmable.
 *
 * The formatters are the reason this file exists rather than a folder of self-contained components.
 * The same KDA appears in the header, the champion pool, the role split and every game row; if any
 * one of them printed `∞` while the others said "Perfect", the page would look broken.
 */

import { useCallback, useMemo, type ReactNode } from "react";
import { fmtRatio, recencyKey, type TeamMetadata, type TeamRecord } from "../../lib/api";
import { useLeague } from "../../lib/leagueContext";
import { TeamLink } from "../league/TeamLink";
import { teamInitial } from "../../lib/utils";

/** A left-rail panel: heading outside the frame, content inside it. */
export function RailCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-5 last:mb-0">
      <h2 className="mb-2 font-display text-base tracking-widest text-text-bright">{title}</h2>
      <div className="rounded-lg border border-border bg-bg2">{children}</div>
    </section>
  );
}

/** A wide-column section, with the site's standard heading treatment. */
export function ProfileSection({
  title,
  aside,
  children,
}: {
  title: string;
  /** Optional trailing content on the heading line — a count, a toggle. */
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mb-7 last:mb-0">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-display text-[22px] tracking-widest text-text-bright">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export interface ConfLabel {
  /** The tournament's full name — what a reader should see wherever there is room. */
  name: string;
  /** `Spring '25`, for tight slots. Falls back to the full name, never to the slug. */
  short: string;
}

/**
 * Resolve a conf slug to the league's name.
 *
 * The profile spans every season a player has appeared in, and `useLeague().tournaments` is the
 * complete list, so this resolves historical confs too. The slug is the label of last resort: it is
 * a three-character database key and means nothing to a reader.
 */
export function useConfLabel(): (conf: string | null | undefined) => ConfLabel {
  const { tournaments } = useLeague();
  const index = useMemo(
    () => new Map(tournaments.map(t => [t.conf, t] as const)),
    [tournaments],
  );

  return useCallback(
    (conf: string | null | undefined): ConfLabel => {
      if (!conf) return { name: "", short: "" };
      const found = index.get(conf);
      if (!found) return { name: conf, short: conf };
      return { name: found.name, short: found.shortname ?? found.name };
    },
    [index],
  );
}

/**
 * Conf slugs, newest league first.
 *
 * `filter.availableConferences` arrives sorted by conf id, which is a three-character database key
 * — so `3sx` lands next to `3sn` and the selector reads in no order a person recognises. The
 * league's own chronology is not in the slug at all; it is parsed out of the tournament name by
 * `recencyKey`, which is the same ordering the season picker and `resolveActiveConfs` use.
 *
 * A slug with no matching tournament sorts last rather than first: `recencyKey` returns 0 for a
 * name it cannot parse, and an unrecognised league at the top of the list looks like the newest one.
 */
export function useSortedConfs(): (confs: readonly string[]) => string[] {
  const { tournaments } = useLeague();
  const recency = useMemo(
    () => new Map(tournaments.map(t => [t.conf, recencyKey(t)] as const)),
    [tournaments],
  );

  return useCallback(
    (confs: readonly string[]) =>
      [...confs].sort(
        (a, b) => (recency.get(b) ?? 0) - (recency.get(a) ?? 0) || a.localeCompare(b),
      ),
    [recency],
  );
}

/**
 * A team's logo, or a coloured initial block when it has none.
 *
 * Takes the whole nullable team rather than a URL because the fallback needs the name and the colour
 * too. Typed as `TeamMetadata`, which the fuller `TeamRecord` satisfies — so the player's own team
 * and an opponent both go through here and cannot end up drawn differently.
 */
export function TeamLogo({
  team,
  code,
  size = 22,
}: {
  team: TeamMetadata | null;
  code: string;
  size?: number;
}) {
  if (team?.logo) {
    return (
      <img
        src={team.logo}
        alt=""
        loading="lazy"
        decoding="async"
        width={size}
        height={size}
        className="shrink-0 rounded object-contain"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      className="flex shrink-0 items-center justify-center rounded font-heading font-bold text-white"
      style={{
        width: size,
        height: size,
        // `colorHex` already falls back when the team's colour is unset, and an absent team has no
        // colour at all — the neutral bar token is the same one `StatTile` uses for that case.
        background: team?.colorHex ?? "var(--bar-unset)",
        fontSize: Math.max(8, size * 0.42),
      }}
    >
      {teamInitial(team?.name ?? code)}
    </span>
  );
}

/** Logo plus name, linked to the team page. Falls back to the bare code when nothing is hydrated. */
export function TeamChip({
  conf,
  code,
  team,
  size = 22,
  className,
}: {
  conf: string;
  code: string;
  team: TeamMetadata | null;
  size?: number;
  className?: string;
}) {
  return (
    <TeamLink
      conf={conf}
      code={code}
      className={`flex min-w-0 items-center gap-2 no-underline ${className ?? ""}`}
    >
      <TeamLogo team={team} code={code} size={size} />
      <span className="truncate font-heading text-text-bright hover:text-accent">
        {team?.name ?? code}
      </span>
    </TeamLink>
  );
}

/**
 * `Infinity` is the API's convention for a deathless aggregate, and `metric()` preserves it all the
 * way here. `toFixed` would print "Infinity"; the glyph is what the rest of the site shows.
 */
export function metricText(value: number | null | undefined, format: (v: number) => string): string {
  if (value === null || value === undefined) return "—";
  if (!Number.isFinite(value)) return value > 0 ? "∞" : "—";
  return format(value);
}

/**
 * KDA, which gets its own formatter because its infinity means something a symbol doesn't convey.
 *
 * A deathless aggregate is not an unbounded quantity — it is a specific, legible achievement, and
 * on a profile it is common: any single game without a death produces one, so the best-KDA card and
 * a one-game champion both hit it. `∞` in that slot reads as a rendering failure; "Perfect" reads as
 * what happened. The rest of the site keeps `fmtRatio`'s `∞` — there the value is one cell of a
 * leaderboard being sorted, not a statement about a player.
 */
export function kdaText(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (!Number.isFinite(value)) return value > 0 ? "Perfect" : "—";
  return fmtRatio(value);
}

/**
 * Colour scales for the only two numbers on this page with an agreed basis: KDA and win rate.
 *
 * **Both scales only ever go up.** There is no red tier and no orange one — a value below the first
 * threshold is left neutral rather than marked as bad. Colour here highlights what stands out; it
 * does not grade the player, and a losing champion in a small sample is not a finding.
 *
 * Nothing else on the page is colour-coded. Per-stat colours looked meaningful and weren't, so the
 * career tiles and personal bests are deliberately monotone until there is a basis for them.
 *
 * **Both return `font-bold` at every tier**, neutral included. At the 10–11px these appear at, a
 * mid-blue or gold on `bg2` is genuinely hard to read at normal weight; and bolding only the
 * coloured tiers would make weight a second, redundant encoding of the same threshold — the column
 * would jump around as values crossed 3.0. Bold everywhere means colour carries the meaning and
 * weight just makes the two highlighted stats legible.
 *
 * `neutral` is a parameter because the baseline differs by context — a headline number sits on
 * `text-bright`, a dense table cell on `text-secondary` — and the tone must replace that class
 * rather than compete with it. Two conflicting Tailwind colour utilities on one element resolve by
 * stylesheet order, not by which was written last.
 */
export function winRateTone(value: number | null | undefined, neutral = "text-text-bright"): string {
  if (value === null || value === undefined) return "font-bold text-text-dim";
  if (value >= 0.7) return "font-bold text-ccs-gold";
  if (value >= 0.6) return "font-bold text-ccs-blue";
  return `font-bold ${neutral}`;
}

export function kdaTone(value: number | null | undefined, neutral = "text-text-bright"): string {
  if (value === null || value === undefined) return "font-bold text-text-dim";
  // A deathless aggregate is unbounded, so it clears the top threshold by definition.
  if (!Number.isFinite(value)) return "font-bold text-ccs-gold";
  if (value >= 5) return "font-bold text-ccs-gold";
  if (value >= 3) return "font-bold text-ccs-blue";
  return `font-bold ${neutral}`;
}

/**
 * Per-game kills, deaths and assists from the served totals.
 *
 * The one derivation on this page, and it is division by a count the same row carries — not a rate
 * the API computes differently. `career.champions` serves totals because that is what aggregates
 * correctly; a pool is read per game.
 */
export function avgKdaText(row: { games: number; kills: number; deaths: number; assists: number }): string {
  if (row.games <= 0) return "—";
  const per = (total: number) => (total / row.games).toFixed(1);
  return `${per(row.kills)}/${per(row.deaths)}/${per(row.assists)}`;
}

/**
 * Resolve a `(conf, code)` pair to its hydrated team.
 *
 * Built once per page from `career.teams`, which is by construction every team the player has
 * appeared for — so it answers for the *player's* side of any game or series row. It is not needed
 * for opponents: those carry their own `opponent` metadata on the row.
 */
export type TeamIndex = (conf: string, code: string | null | undefined) => TeamRecord | null;
