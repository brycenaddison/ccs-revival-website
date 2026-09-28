import type { ArticleRecord } from "../api/articles";
import type { PageMetadata } from "./metadata";
import { articlePath, httpsImage, publicUrl, SITE_NAME } from "./site.ts";

/** A short plain-text fallback, never Markdown syntax or an inferred author identity. */
export function articleExcerpt(body: string): string {
  const plain = body
    .replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1")
    .replace(/^\s*\[[^\]]+\]:.*$/gm, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/(^|\n)\s*(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+\.\s+)/g, " ")
    .replace(/[*_`~|]/g, "")
    .replace(/\s+/g, " ").trim();
  return plain.length > 170 ? `${plain.slice(0, 167).replace(/\s+\S*$/, "")}…` : plain;
}

function validDate(value: string | null): string | undefined {
  return value && Number.isFinite(Date.parse(value)) ? value : undefined;
}

export function articleModifiedAt(article: ArticleRecord): string | undefined {
  const published = validDate(article.publishedAt);
  const updated = validDate(article.updatedAt);
  return published && updated && Date.parse(updated) > Date.parse(published) ? updated : undefined;
}

export function articleMetadata(article: ArticleRecord, origin: string): PageMetadata {
  const path = articlePath(article.slug);
  const description = article.subtitle?.trim() || articleExcerpt(article.body ?? "") || `Read ${article.title} on CCS.`;
  const image = httpsImage(article.imageUrl, origin);
  const publishedAt = validDate(article.publishedAt);
  const modifiedAt = articleModifiedAt(article);
  const native = article.kind === "native" && article.isPublished;
  return {
    title: `${article.title} | CCS`, description, path, noindex: !native,
    type: native ? "article" : "website",
    image: image ? { url: image, alt: article.title } : undefined,
    publishedAt: native ? publishedAt : undefined,
    modifiedAt: native ? modifiedAt : undefined,
    structuredData: native ? {
      "@context": "https://schema.org", "@type": "BlogPosting",
      headline: article.title, description, url: publicUrl(origin, path),
      mainEntityOfPage: publicUrl(origin, path),
      ...(article.author ? { author: { "@type": "Person", name: article.author } } : {}),
      ...(image ? { image: [image] } : {}),
      ...(publishedAt ? { datePublished: publishedAt } : {}),
      ...(modifiedAt ? { dateModified: modifiedAt } : {}),
      publisher: { "@type": "Organization", name: SITE_NAME },
    } : undefined,
  };
}
