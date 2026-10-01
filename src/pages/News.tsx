/** The all-seasons archive. A one-row lookahead avoids linking to an empty final page. */
import { Fragment } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageShell } from "../components/layout/PageShell";
import { ArticleCardTile } from "../components/news/ArticleCardTile";
import { usePageMetadata } from "../components/seo/MetadataProvider";
import { queries } from "../lib/queries";
import { errorMessage } from "../lib/api";
import { NEWS_PAGE_SIZE, newsPagePath, parseNewsPage } from "../lib/seo/site";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

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
          <Pagination aria-label="News pagination" className="mt-8">
            <PaginationContent className="flex-wrap justify-center">
              {page! > 1 && (
                <PaginationItem>
                  <PaginationPrevious to={newsPagePath(page! - 1)} rel="prev" />
                </PaginationItem>
              )}
              {pages.map((number, index) => (
                <Fragment key={number}>
                  {/* Page 1 is always offered, so a jump past page 2 leaves a gap worth marking. */}
                  {index > 0 && number - pages[index - 1] > 1 && (
                    <PaginationItem>
                      <PaginationEllipsis />
                    </PaginationItem>
                  )}
                  <PaginationItem>
                    <PaginationLink to={newsPagePath(number)} isActive={number === page} aria-label={`News page ${number}`}>
                      {number}
                    </PaginationLink>
                  </PaginationItem>
                </Fragment>
              ))}
              {hasNext && (
                <PaginationItem>
                  <PaginationNext to={newsPagePath(page! + 1)} rel="next" />
                </PaginationItem>
              )}
            </PaginationContent>
          </Pagination>
        </>
      )}
    </PageShell>
  );
}
