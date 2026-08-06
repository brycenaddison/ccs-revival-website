/**
 * Where an article card goes when it is clicked.
 *
 * Three surfaces need identical behaviour — the home rail, the `/news` index and the related list
 * on a reader page — and the branch is not obvious enough to re-derive in each: a **link** article
 * lives in Google Docs and opens off-site, while a **native** one is a route on this site. Getting
 * it wrong is silent, because both render a perfectly good card.
 *
 * Branches on `kind` rather than on `url !== null`. They agree today (upstream sets `url` to the
 * external URL for a link and `null` for a native one), but `kind` is the field that *says* which
 * this is, and a link article that somehow lost its URL should fall through to a dead card rather
 * than route to a `/news/:slug` page that will 404.
 */

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { ArticleCard } from "../../lib/api";

interface Props {
  article: ArticleCard;
  className?: string;
  children: ReactNode;
}

export function ArticleLink({ article, className, children }: Props) {
  if (article.kind === "link") {
    // `noopener` is the load-bearing half — without it the opened tab gets a handle on ours through
    // `window.opener`. These are writer-supplied URLs, so it is not optional.
    return (
      <a
        href={article.url ?? "#"}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {children}
      </a>
    );
  }

  return (
    <Link to={`/news/${encodeURIComponent(article.slug)}`} className={className}>
      {children}
    </Link>
  );
}

/** True when following this card leaves the site — for the little outbound arrow on a card. */
export function isExternal(article: ArticleCard): boolean {
  return article.kind === "link";
}
