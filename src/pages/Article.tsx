/**
 * `/news/:slug` — one article.
 *
 * Mostly reached for a **native** article; a link article's cards go straight to their source, so
 * this route only sees one when a URL was pasted or shared. It handles that case rather than
 * redirecting: an automatic bounce to an off-site URL from a route the reader typed is hostile, and
 * a `<meta refresh>`-style jump makes the back button useless. It shows the header and a button.
 *
 * A draft is a `404` upstream, indistinguishable from a slug that never existed — deliberately, so
 * an anonymous visitor can't discover that a slug is spoken for. Both render the same notice here.
 */

import { useEffect, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { PageShell } from "../components/layout/PageShell";
import { NoticePanel } from "../components/auth/RequireAuth";
import { Markdown } from "../components/news/Markdown";
import { queries } from "../lib/queries";
import { bumpArticleView, errorMessage } from "../lib/api";
import { fmtDay } from "../lib/utils";

export default function Article() {
  const { slug } = useParams();
  const { data: article, isPending, error } = useQuery(queries.article(slug ?? null));

  /**
   * The view counter, bumped once per mount.
   *
   * Guarded by a ref keyed on the slug because StrictMode runs effects twice in development, and
   * an unguarded counter double-counts every local page load. Fire-and-forget: a failed bump is not
   * worth telling a reader about, and `void` marks that the rejection is intentionally unhandled.
   *
   * The counter predates the articles table and is not joined to it, so this is a page-view tally
   * keyed by slug rather than a field on the article — nothing reads it back today.
   */
  const counted = useRef<string | null>(null);
  useEffect(() => {
    if (!slug || counted.current === slug) return;
    counted.current = slug;
    void bumpArticleView(slug).catch(() => {});
  }, [slug]);

  if (isPending) {
    return (
      <PageShell maxWidth={760}>
        <div className="py-16 text-center text-text-subtle">Loading...</div>
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell maxWidth={760}>
        <NoticePanel title="COULDN'T LOAD THIS ARTICLE" body={errorMessage(error)} />
      </PageShell>
    );
  }

  if (!article) {
    return (
      <PageShell maxWidth={760}>
        <NoticePanel
          title="ARTICLE NOT FOUND"
          body="This article doesn't exist, or it hasn't been published yet."
        >
          <Link
            to="/news"
            className="inline-flex items-center gap-2 rounded-md border border-accent px-4 py-2 font-heading text-sm tracking-wider uppercase text-text-bright no-underline"
          >
            All news
          </Link>
        </NoticePanel>
      </PageShell>
    );
  }

  return (
    <PageShell maxWidth={760}>
      <Link
        to="/news"
        className="inline-flex items-center gap-1.5 font-heading text-[11px] tracking-wider uppercase text-text-dim hover:text-text-bright no-underline mb-5"
      >
        <ArrowLeft size={13} />
        All news
      </Link>

      {article.imageUrl && (
        <div className="w-full rounded-lg overflow-hidden mb-6" style={{ maxHeight: 380 }}>
          <img
            src={article.imageUrl}
            alt=""
            loading="eager"
            fetchPriority="high"
            decoding="async"
            className="w-full h-full object-cover"
          />
        </div>
      )}

      <header className="mb-7">
        {article.tag && (
          <span className="inline-block bg-accent text-white text-[10px] font-bold font-display tracking-wider px-2.5 py-1 rounded mb-3">
            {article.tag}
          </span>
        )}

        <h1 className="font-display text-[34px] text-text-bright tracking-wider leading-tight mb-2">
          {article.title}
        </h1>

        {article.subtitle && (
          <p className="text-text-secondary text-base leading-relaxed mb-3">{article.subtitle}</p>
        )}

        <div className="flex items-center gap-2 text-text-muted text-xs">
          {article.author && <span className="font-heading uppercase tracking-wider">{article.author}</span>}
          {article.author && article.publishedAt && <span>·</span>}
          {article.publishedAt && <span>{fmtDay(article.publishedAt)}</span>}
        </div>
      </header>

      {article.kind === "link" ? (
        <div className="bg-bg2 border border-border rounded-lg p-6 text-center">
          <p className="text-text-secondary text-sm mb-4">This article is published elsewhere.</p>
          <a
            href={article.url ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md border border-accent px-4 py-2 font-heading text-sm tracking-wider uppercase text-text-bright no-underline"
          >
            Read the full article
            <ArrowUpRight size={14} />
          </a>
        </div>
      ) : article.body ? (
        <Markdown body={article.body} />
      ) : (
        // The CHECK constraint upstream makes a bodyless native article impossible, so this is a
        // deploy-skew case rather than a real one — but an empty page with no explanation is worse.
        <p className="text-text-dim text-sm">This article has no content yet.</p>
      )}
    </PageShell>
  );
}
