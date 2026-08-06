/**
 * Which articles get the big slots on the home page.
 *
 * The rail is three sizes — one hero, up to two feature cards, then a compact list — and the split
 * is driven by `articleType`, a field the writer sets. Two rules the server deliberately does not
 * enforce, and therefore this file must:
 *
 *  - **Several rows may be `hero`.** Upstream doesn't constrain it, on purpose: promoting an
 *    article should be one write rather than a demote-then-promote transaction. The newest wins,
 *    the same rule `announcements.current()` applies to banners.
 *  - **The tiers are caps, not guarantees.** A week with three `feature`s shows two; a week with
 *    none shows none, and the hero sits alone above the list. Nothing is promoted to fill a slot,
 *    because a writer who tiered everything `news` meant it.
 *
 * Rows arrive `publishedAt DESC` and are **not re-sorted here** — the ordering is the server's, per
 * the rule in CLAUDE.md. Everything below is a stable partition of that order.
 */

import type { ArticleCard } from "./api";

/** How many of each size the home rail has room for. */
const FEATURE_SLOTS = 2;
const NEWS_SLOTS = 8;

export interface ArticleTiers {
  hero: ArticleCard | null;
  /** At most `FEATURE_SLOTS`. */
  features: ArticleCard[];
  /** At most `NEWS_SLOTS`. */
  news: ArticleCard[];
}

const EMPTY: ArticleTiers = { hero: null, features: [], news: [] };

/**
 * Partition a rail into its three sizes.
 *
 * **Falls back to position when nothing is tiered.** A response in which every card is `news` is
 * ambiguous: it is what a deployment whose API predates `articleType` serves, and also what a
 * league that has never promoted anything serves. Both want the same thing — a page with a focal
 * point — so the first card becomes the hero, the next two the features, and the rest the list.
 *
 * The moment a writer promotes anything, the explicit reading takes over completely. That is the
 * point: the fallback must not blend with real tiers, or promoting one article to `feature` would
 * leave a positional hero above it that nobody chose.
 */
export function tierArticles(cards: readonly ArticleCard[]): ArticleTiers {
  if (cards.length === 0) return EMPTY;

  const tiered = cards.some(c => c.articleType !== "news");
  if (!tiered) {
    return {
      hero: cards[0] ?? null,
      features: cards.slice(1, 1 + FEATURE_SLOTS),
      news: cards.slice(1 + FEATURE_SLOTS, 1 + FEATURE_SLOTS + NEWS_SLOTS),
    };
  }

  const hero = cards.find(c => c.articleType === "hero") ?? null;
  const features = cards.filter(c => c.articleType === "feature").slice(0, FEATURE_SLOTS);

  // Everything not actually shown above falls to the list — including the runners-up when a writer
  // has posted two heroes or three features. Dropping them would silently hide a published article,
  // which is worse than showing it small.
  const shown = new Set<string>([...(hero ? [hero.slug] : []), ...features.map(f => f.slug)]);
  const news = cards.filter(c => !shown.has(c.slug)).slice(0, NEWS_SLOTS);

  return { hero, features, news };
}
