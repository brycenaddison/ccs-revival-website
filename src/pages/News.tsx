/** The all-seasons archive. A one-row lookahead avoids linking to an empty final page. */
import { Link, Navigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageShell } from "../components/layout/PageShell";
import { ArticleCardTile } from "../components/news/ArticleCardTile";
import { usePageMetadata } from "../components/seo/MetadataProvider";
import { queries } from "../lib/queries";
import { errorMessage } from "../lib/api";
import { NEWS_PAGE_SIZE, newsPagePath, parseNewsPage } from "../lib/seo/site";

const PAGE_LINK = "rounded-md border border-border px-3 py-2 font-heading text-sm text-text-bright hover:border-brand";

export default function News() {
  const { page: rawPage } = useParams();
  const page = parseNewsPage(rawPage);
  const { data, isPending, error } = useQuery({
    ...queries.articles({ limit: NEWS_PAGE_SIZE + 1, offset: ((page ?? 1) - 1) * NEWS_PAGE_SIZE }),
    enabled: page !== null,
  });
  const missing = page === null || (page > 1 && !isPending && !error && !data?.length);
  usePageMetadata({
    title: missing ? "News page not found | CCS" : `News${page && page > 1 ? ` — Page ${page}` : ""} | CCS`,
    description: "Recaps, roster moves and announcements from every CCS season.",
    path: page ? newsPagePath(page) : undefined,
    noindex: missing || !!error,
  });
  if (rawPage === "1") return <Navigate to="/news" replace />;
  const articles = (data ?? []).slice(0, NEWS_PAGE_SIZE);
  const hasNext = (data?.length ?? 0) > NEWS_PAGE_SIZE;
  const pages = page ? [...new Set([1, ...(page > 1 ? [page - 1] : []), page, ...(hasNext ? [page + 1] : [])])] : [];

  return (
    <PageShell maxWidth={1100}>
      <header className="mb-6">
        <h1 className="font-display text-[22px] text-text-bright">{missing ? "News page not found" : "News"}</h1>
        <p className="text-text-secondary text-sm">Recaps, roster moves and announcements from every CCS season.</p>
      </header>
      {missing ? (
        <div className="py-16 text-center text-text-secondary">
          <p>This archive page doesn&apos;t exist.</p>
          <Link to="/news" className="mt-4 inline-block text-brand hover:underline">Back to all news</Link>
        </div>
      ) : error ? (
        <p className="py-16 text-center text-sm text-text-secondary">{errorMessage(error)}</p>
      ) : isPending ? (
        <div className="py-16 text-center text-text-subtle">Loading...</div>
      ) : !articles.length ? (
        <div className="py-16 text-center text-text-dim text-sm">Nothing published yet.</div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {articles.map(article => <ArticleCardTile key={article.slug} article={article} />)}
          </div>
          <nav aria-label="News pagination" className="mt-8 flex flex-wrap items-center justify-center gap-2">
            {page! > 1 && <Link to={newsPagePath(page! - 1)} rel="prev" className={PAGE_LINK}>Previous</Link>}
            {pages.map(number => number === page ? (
              <span key={number} aria-current="page" className="rounded-md border border-brand px-3 py-2 font-heading text-sm text-text-bright">{number}</span>
            ) : <Link key={number} to={newsPagePath(number)} aria-label={`News page ${number}`} className={PAGE_LINK}>{number}</Link>)}
            {hasNext && <Link to={newsPagePath(page! + 1)} rel="next" className={PAGE_LINK}>Next</Link>}
          </nav>
        </>
      )}
    </PageShell>
  );
}
