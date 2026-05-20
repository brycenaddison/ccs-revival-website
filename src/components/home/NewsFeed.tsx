import { useState } from "react";
import { timeAgo } from "../../lib/utils";
import type { Article } from "../../hooks/useLeagueData";

interface Props {
  articles: Article[];
  isMobile: boolean;
}

function ArticleModal({ article, onClose }: { article: Article; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center"
      style={{ background: "var(--overlay)" }}
      onClick={onClose}
    >
      <div
        className="bg-bg2 border border-border rounded-lg w-full max-h-[85vh] overflow-y-auto relative"
        style={{ maxWidth: 700 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header image */}
        {article.image_url && (
          <div className="w-full h-48 overflow-hidden rounded-t-lg">
            <img src={article.image_url} alt="" className="w-full h-full object-cover" />
          </div>
        )}

        <div className="p-6">
          {/* Tag */}
          {article.tag && (
            <span className="inline-block bg-accent text-white text-[10px] font-bold font-display tracking-wider px-2.5 py-1 rounded mb-3">
              {article.tag}
            </span>
          )}

          {/* Title */}
          <h2 className="font-display text-text-bright tracking-wider leading-tight mb-2" style={{ fontSize: 28 }}>
            {article.title}
          </h2>

          {/* Meta */}
          <div className="flex items-center gap-2 text-text-muted text-xs mb-4">
            {article.author && <span className="font-heading">{article.author}</span>}
            {article.author && article.published_at && <span>·</span>}
            {article.published_at && (
              <span>{new Date(article.published_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
            )}
          </div>

          {/* Subtitle */}
          {article.subtitle && (
            <p className="text-text-secondary text-sm leading-relaxed mb-4 font-medium italic">
              {article.subtitle}
            </p>
          )}

          {/* Body */}
          {article.body && (
            <div className="text-text text-sm leading-relaxed whitespace-pre-wrap">
              {article.body}
            </div>
          )}
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-bg/80 border border-border flex items-center justify-center text-text-muted hover:text-text-bright cursor-pointer text-lg leading-none"
        >
          ×
        </button>
      </div>
    </div>
  );
}

function FeatureCard({ article, isMobile, onClick }: { article: Article; isMobile: boolean; onClick: () => void }) {
  return (
    <div
      className="bg-bg2 rounded-lg border border-border overflow-hidden cursor-pointer hover:border-border2 transition-colors group"
      onClick={onClick}
    >
      {/* Image */}
      {article.image_url ? (
        <div className="w-full overflow-hidden" style={{ height: isMobile ? 140 : 160 }}>
          <img
            src={article.image_url}
            alt=""
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        </div>
      ) : (
        <div
          className="w-full flex items-center justify-center"
          style={{ height: isMobile ? 100 : 120, background: "linear-gradient(135deg, var(--accent) 0%, #3f0008 100%)" }}
        >
          <span className="font-display text-white/30 text-4xl tracking-widest">CCS</span>
        </div>
      )}

      <div className="p-4">
        {/* Tag */}
        {article.tag && (
          <span className="text-[9px] font-bold text-accent tracking-wider font-display uppercase">
            {article.tag}
          </span>
        )}

        {/* Title */}
        <h3 className="font-heading font-semibold text-text-bright leading-tight mt-1 mb-1.5 group-hover:text-accent transition-colors" style={{ fontSize: isMobile ? 14 : 16 }}>
          {article.title}
        </h3>

        {/* Subtitle / body preview */}
        <p className="text-xs text-text-secondary leading-snug line-clamp-2">
          {article.subtitle || article.body?.slice(0, 120)}
        </p>

        {/* Meta */}
        <div className="flex items-center gap-2 mt-3 text-[10px] text-text-muted">
          {article.author && <span className="font-heading uppercase tracking-wider">{article.author}</span>}
          {article.published_at && (
            <>
              {article.author && <span>·</span>}
              <span>{timeAgo(article.published_at)}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function NewsItem({ article, isLast, onClick }: { article: Article; isLast: boolean; onClick: () => void }) {
  return (
    <div
      className={`flex gap-4 py-3.5 cursor-pointer group ${!isLast ? "border-b border-border" : ""}`}
      onClick={onClick}
    >
      {/* Thumbnail */}
      {article.image_url ? (
        <div className="w-20 h-14 rounded overflow-hidden shrink-0">
          <img src={article.image_url} alt="" className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="w-20 h-14 rounded shrink-0 bg-bg3 flex items-center justify-center">
          <span className="text-text-subtle text-[10px] font-display tracking-wider">CCS</span>
        </div>
      )}

      <div className="flex-1 min-w-0">
        {/* Tag + time on same line */}
        <div className="flex items-center gap-2 mb-1">
          {article.tag && (
            <span className="text-[9px] font-bold text-accent tracking-wider font-display uppercase">{article.tag}</span>
          )}
          {article.published_at && (
            <span className="text-[10px] text-text-muted">{timeAgo(article.published_at)}</span>
          )}
        </div>

        {/* Title */}
        <h4 className="font-heading text-[13px] text-text font-medium leading-snug group-hover:text-accent transition-colors truncate">
          {article.title}
        </h4>

        {/* Body preview */}
        {(article.subtitle || article.body) && (
          <p className="text-[11px] text-text-muted leading-snug mt-0.5 truncate">
            {article.subtitle || article.body?.slice(0, 80)}
          </p>
        )}
      </div>
    </div>
  );
}

export function NewsFeed({ articles, isMobile }: Props) {
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);

  const features = articles.filter(a => a.article_type === "feature").slice(0, 2);
  const news = articles.filter(a => !["hero", "feature"].includes(a.article_type || "")).slice(0, 8);

  if (!articles.length) {
    return <div className="p-8 text-center text-text-subtle text-[13px]">No articles yet.</div>;
  }

  return (
    <>
      <div>
        {/* Feature cards */}
        {features.length > 0 && (
          <div className={`grid gap-4 mb-5 ${isMobile ? "grid-cols-1" : "grid-cols-2"}`}>
            {features.map(f => (
              <FeatureCard key={f.id} article={f} isMobile={isMobile} onClick={() => setSelectedArticle(f)} />
            ))}
          </div>
        )}

        {/* News items */}
        {news.length > 0 && (
          <div className="bg-bg2 rounded-lg border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <span className="font-display text-[14px] text-text-bright tracking-widest">LATEST NEWS</span>
            </div>
            <div className="px-4">
              {news.map((n, i) => (
                <NewsItem key={n.id} article={n} isLast={i === news.length - 1} onClick={() => setSelectedArticle(n)} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Article modal */}
      {selectedArticle && (
        <ArticleModal article={selectedArticle} onClose={() => setSelectedArticle(null)} />
      )}
    </>
  );
}
