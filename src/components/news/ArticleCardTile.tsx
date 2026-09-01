/**
 * The article card the `/news` index is a grid of.
 *
 * Deliberately not shared with the home rail's `FeatureCard`. They look similar and are not the
 * same job: the rail's card is sized for a 280px column with a fixed image height, while this one
 * flexes across a full-width grid and carries the conf and the outbound marker the rail has no room
 * for. Folding them together would mean a component with three layout props, which is how the
 * pre-`PageShell` chrome drifted.
 */

import { ArrowUpRight } from "lucide-react";
import { timeAgo } from "../../lib/utils";
import type { ArticleCard } from "../../lib/api";
import { ArticleLink, isExternal } from "./ArticleLink";

interface Props {
  article: ArticleCard;
}

export function ArticleCardTile({ article }: Props) {
  return (
    <ArticleLink
      article={article}
      className="bg-bg2 rounded-lg border border-border overflow-hidden hover:border-border2 transition-colors group flex flex-col no-underline"
    >
      {article.imageUrl ? (
        <div className="w-full h-40 overflow-hidden shrink-0">
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
          className="w-full h-40 shrink-0 flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, var(--accent) 0%, #3f0008 100%)" }}
        >
          <span className="font-display text-white/30 text-4xl tracking-widest">CCS</span>
        </div>
      )}

      <div className="p-4 flex flex-col flex-1">
        <div className="flex items-center gap-2 mb-1.5">
          {article.tag && (
            <span className="text-[9px] font-bold text-brand tracking-wider font-display uppercase">
              {article.tag}
            </span>
          )}
          {article.conf && (
            <span className="text-[9px] font-heading tracking-wider uppercase text-text-dim">
              {article.conf}
            </span>
          )}
        </div>

        <h3 className="font-heading font-semibold text-[16px] text-text-bright leading-tight mb-1.5 group-hover:text-brand transition-colors">
          {article.title}
        </h3>

        {article.subtitle && (
          <p className="text-xs text-text-secondary leading-snug line-clamp-2">
            {article.subtitle}
          </p>
        )}

        <div className="flex items-center gap-2 mt-auto pt-3 text-[10px] text-text-muted">
          {article.author && (
            <span className="font-heading uppercase tracking-wider">{article.author}</span>
          )}
          {article.author && article.publishedAt && <span>·</span>}
          {article.publishedAt && <span>{timeAgo(article.publishedAt)}</span>}
          {isExternal(article) && (
            <ArrowUpRight
              size={12}
              className="ml-auto text-text-dim group-hover:text-brand transition-colors"
              aria-label="Opens on another site"
            />
          )}
        </div>
      </div>
    </ArticleLink>
  );
}
