import { timeAgo } from "../../lib/utils";
import type { ArticleCard } from "../../lib/api";
import { ArticleLink, isExternal } from "../news/ArticleLink";

interface Props {
  article: ArticleCard;
  isMobile: boolean;
}

/**
 * The one large card at the top of the home page's news column.
 *
 * Which article lands here is `lib/articleTiers.ts`'s decision, not this component's — it renders
 * whatever it is handed. Clicking it goes off-site for a link article and to `/news/:slug` for a
 * native one, which `ArticleLink` owns.
 */
export function HeroArticle({ article, isMobile }: Props) {
  return (
    <ArticleLink
      article={article}
      className="relative overflow-hidden flex flex-col justify-end group no-underline block"
    >
      <div
        className="relative overflow-hidden flex flex-col justify-end"
        style={{
          borderRadius: isMobile ? 6 : 8,
          minHeight: isMobile ? 200 : 300,
        }}
      >
        {/* Background image or gradient */}
        {article.imageUrl ? (
          /* The hero is the LCP element, so it loads eagerly and ahead of the other artwork —
             every other image on the page is lazy so they don't compete with it. */
          <img
            src={article.imageUrl}
            alt=""
            loading="eager"
            fetchPriority="high"
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(135deg, #d20708 0%, #3f0008 100%)" }}
          />
        )}

        {/* Gradient overlay */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(0deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.4) 40%, rgba(0,0,0,0.1) 100%)",
          }}
        />

        <div className="relative z-[2]" style={{ padding: isMobile ? "20px 16px" : "32px 28px" }}>
          {article.tag && (
            <span
              className="inline-block bg-brand text-white font-extrabold rounded font-display tracking-wider mb-2"
              style={{ fontSize: isMobile ? 9 : 10, padding: "3px 8px" }}
            >
              {article.tag}
            </span>
          )}
          <h2
            className="font-display font-normal text-white leading-tight mb-1.5 group-hover:text-brand transition-colors"
            style={{ fontSize: isMobile ? 22 : 32 }}
          >
            {article.title}
          </h2>
          {article.subtitle && (
            <p
              className="text-text-secondary leading-normal m-0"
              style={{ fontSize: isMobile ? 12 : 14 }}
            >
              {article.subtitle}
            </p>
          )}
          <div className="flex items-center gap-2 mt-2 text-[11px] text-text-muted">
            {article.author && <span>{article.author}</span>}
            {article.publishedAt && (
              <>
                {article.author && <span>·</span>}
                <span>{timeAgo(article.publishedAt)}</span>
              </>
            )}
            <span className="ml-auto text-brand text-[10px] font-heading tracking-wider uppercase opacity-0 group-hover:opacity-100 transition-opacity">
              {isExternal(article) ? "Read more ↗" : "Read more →"}
            </span>
          </div>
        </div>
      </div>
    </ArticleLink>
  );
}
