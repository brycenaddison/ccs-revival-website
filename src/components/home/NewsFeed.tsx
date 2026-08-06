/**
 * The two middle tiers of the home page's news column: feature cards, then the compact list.
 *
 * Takes the tiers already partitioned rather than filtering a flat array itself — that decision is
 * `lib/articleTiers.ts`'s, and it involves a fallback this component has no business knowing about.
 * The hero is `HeroArticle`, rendered by the page above this.
 *
 * There used to be a modal here. Articles have URLs now: a link article opens its source and a
 * native one routes to `/news/:slug`, both through `ArticleLink`. An overlay that couldn't be
 * linked to, shared, or closed with the back button was the wrong shape for a news post.
 */

import { ArrowUpRight } from "lucide-react";
import { timeAgo } from "../../lib/utils";
import type { ArticleCard } from "../../lib/api";
import { ArticleLink, isExternal } from "../news/ArticleLink";

interface Props {
  features: readonly ArticleCard[];
  news: readonly ArticleCard[];
  isMobile: boolean;
}

function FeatureCard({ article, isMobile }: { article: ArticleCard; isMobile: boolean }) {
  return (
    <ArticleLink
      article={article}
      className="bg-bg2 rounded-lg border border-border overflow-hidden hover:border-border2 transition-colors group no-underline block"
    >
      {article.imageUrl ? (
        <div className="w-full overflow-hidden" style={{ height: isMobile ? 140 : 160 }}>
          <img
            src={article.imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        </div>
      ) : (
        <div
          className="w-full flex items-center justify-center"
          style={{
            height: isMobile ? 100 : 120,
            background: "linear-gradient(135deg, var(--accent) 0%, #3f0008 100%)",
          }}
        >
          <span className="font-display text-white/30 text-4xl tracking-widest">CCS</span>
        </div>
      )}

      <div className="p-4">
        {article.tag && (
          <span className="text-[9px] font-bold text-accent tracking-wider font-display uppercase">
            {article.tag}
          </span>
        )}

        <h3
          className="font-heading font-semibold text-text-bright leading-tight mt-1 mb-1.5 group-hover:text-accent transition-colors"
          style={{ fontSize: isMobile ? 14 : 16 }}
        >
          {article.title}
        </h3>

        {article.subtitle && (
          <p className="text-xs text-text-secondary leading-snug line-clamp-2">
            {article.subtitle}
          </p>
        )}

        <div className="flex items-center gap-2 mt-3 text-[10px] text-text-muted">
          {article.author && (
            <span className="font-heading uppercase tracking-wider">{article.author}</span>
          )}
          {article.publishedAt && (
            <>
              {article.author && <span>·</span>}
              <span>{timeAgo(article.publishedAt)}</span>
            </>
          )}
          {isExternal(article) && (
            <ArrowUpRight
              size={12}
              className="ml-auto text-text-dim group-hover:text-accent transition-colors"
              aria-label="Opens on another site"
            />
          )}
        </div>
      </div>
    </ArticleLink>
  );
}

function NewsItem({ article, isLast }: { article: ArticleCard; isLast: boolean }) {
  return (
    <ArticleLink
      article={article}
      className={`flex gap-4 py-3.5 group no-underline ${!isLast ? "border-b border-border" : ""}`}
    >
      {article.imageUrl ? (
        <div className="w-20 h-14 rounded overflow-hidden shrink-0">
          <img
            src={article.imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        <div className="w-20 h-14 rounded shrink-0 bg-bg3 flex items-center justify-center">
          <span className="text-text-subtle text-[10px] font-display tracking-wider">CCS</span>
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {article.tag && (
            <span className="text-[9px] font-bold text-accent tracking-wider font-display uppercase">
              {article.tag}
            </span>
          )}
          {article.publishedAt && (
            <span className="text-[10px] text-text-muted">{timeAgo(article.publishedAt)}</span>
          )}
          {isExternal(article) && (
            <ArrowUpRight size={11} className="text-text-subtle" aria-label="Opens on another site" />
          )}
        </div>

        <h4 className="font-heading text-[13px] text-text font-medium leading-snug group-hover:text-accent transition-colors truncate">
          {article.title}
        </h4>

        {article.subtitle && (
          <p className="text-[11px] text-text-muted leading-snug mt-0.5 truncate">
            {article.subtitle}
          </p>
        )}
      </div>
    </ArticleLink>
  );
}

export function NewsFeed({ features, news, isMobile }: Props) {
  if (features.length === 0 && news.length === 0) return null;

  return (
    <div>
      {/* One card per row, at every width.
          These sit in the home page's 280px left rail, and two across it gave each card about
          130px — narrower than its own thumbnail wants to be, with the title wrapping to four
          lines. A feature card's whole job is to be bigger than a news row, which it wasn't. */}
      {features.length > 0 && (
        <div className="flex flex-col gap-4 mb-5">
          {features.map(f => (
            <FeatureCard key={f.slug} article={f} isMobile={isMobile} />
          ))}
        </div>
      )}

      {news.length > 0 && (
        <div className="bg-bg2 rounded-lg border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <span className="font-display text-[14px] text-text-bright tracking-widest">
              LATEST NEWS
            </span>
          </div>
          <div className="px-4">
            {news.map((n, i) => (
              <NewsItem key={n.slug} article={n} isLast={i === news.length - 1} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
