import { timeAgo } from "../../lib/utils";
import type { Article } from "../../hooks/useLeagueData";

interface Props {
  article: Article;
  isMobile: boolean;
  onClick?: () => void;
}

export function HeroArticle({ article, isMobile, onClick }: Props) {
  return (
    <div
      className="relative overflow-hidden cursor-pointer flex flex-col justify-end group"
      style={{
        borderRadius: isMobile ? 6 : 8,
        minHeight: isMobile ? 200 : 300,
      }}
      onClick={onClick}
    >
      {/* Background image or gradient */}
      {article.image_url ? (
        <img
          src={article.image_url}
          alt=""
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
      ) : (
        <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, #d20708 0%, #3f0008 100%)" }} />
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0" style={{ background: "linear-gradient(0deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.4) 40%, rgba(0,0,0,0.1) 100%)" }} />

      <div className="relative z-[2]" style={{ padding: isMobile ? "20px 16px" : "32px 28px" }}>
        {article.tag && (
          <span className="inline-block bg-accent text-white font-extrabold rounded font-display tracking-wider mb-2" style={{ fontSize: isMobile ? 9 : 10, padding: "3px 8px" }}>
            {article.tag}
          </span>
        )}
        <h2 className="font-display font-normal text-white leading-tight mb-1.5 group-hover:text-accent transition-colors" style={{ fontSize: isMobile ? 22 : 32 }}>
          {article.title}
        </h2>
        {article.subtitle && (
          <p className="text-text-secondary leading-normal m-0" style={{ fontSize: isMobile ? 12 : 14 }}>
            {article.subtitle}
          </p>
        )}
        <div className="flex items-center gap-2 mt-2 text-[11px] text-text-muted">
          {article.author && <span>{article.author}</span>}
          {article.published_at && (
            <>
              {article.author && <span>·</span>}
              <span>{timeAgo(article.published_at)}</span>
            </>
          )}
          <span className="ml-auto text-accent text-[10px] font-heading tracking-wider uppercase opacity-0 group-hover:opacity-100 transition-opacity">
            Read more →
          </span>
        </div>
      </div>
    </div>
  );
}
