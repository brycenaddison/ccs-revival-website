import { HOME_TITLE, SITE_DESCRIPTION, SITE_NAME, httpsImage, publicUrl, serializeJson } from "./site.ts";

export interface PageMetadata {
  title: string;
  description: string;
  path?: string;
  noindex?: boolean;
  type?: "website" | "article";
  image?: { url: string; alt: string; width?: number; height?: number; type?: string };
  publishedAt?: string;
  modifiedAt?: string;
  structuredData?: Record<string, unknown>;
}

export function defaultMetadata(): PageMetadata {
  return { title: HOME_TITLE, description: SITE_DESCRIPTION };
}

export function fallbackImage(origin: string) {
  return { url: publicUrl(origin, "/android-chrome-512x512.png"), alt: `${SITE_NAME} logo`, width: 512, height: 512, type: "image/png" };
}

/** The shell intentionally has no path, canonical, robots directive or homepage JSON-LD. */
export function metadataTags(metadata: PageMetadata, origin: string): Record<string, string | undefined> {
  const imageUrl = httpsImage(metadata.image?.url, origin);
  const image = imageUrl ? { ...metadata.image!, url: imageUrl } : fallbackImage(origin);
  const url = metadata.path && !metadata.noindex ? publicUrl(origin, metadata.path) : undefined;
  return {
    description: metadata.description,
    robots: metadata.noindex ? "noindex, follow" : undefined,
    "og:site_name": SITE_NAME,
    "og:title": metadata.title,
    "og:description": metadata.description,
    "og:type": metadata.type ?? "website",
    "og:url": url,
    "og:image": image.url,
    "og:image:alt": image.alt,
    "og:image:width": image.width?.toString(),
    "og:image:height": image.height?.toString(),
    "og:image:type": image.type,
    "article:published_time": metadata.publishedAt,
    "article:modified_time": metadata.modifiedAt,
    "twitter:card": "summary",
    "twitter:title": metadata.title,
    "twitter:description": metadata.description,
    "twitter:image": image.url,
    "twitter:image:alt": image.alt,
  };
}

export function applyMetadata(metadata: PageMetadata, origin: string): void {
  document.title = metadata.title;
  for (const [key, value] of Object.entries(metadataTags(metadata, origin))) {
    const attribute = key.startsWith("og:") || key.startsWith("article:") ? "property" : "name";
    const existing = [...document.head.querySelectorAll<HTMLMetaElement>(`meta[${attribute}="${key}"]`)];
    const tag = existing.shift() ?? document.createElement("meta");
    existing.forEach(node => node.remove());
    if (value === undefined) { tag.remove(); continue; }
    tag.setAttribute(attribute, key);
    tag.content = value;
    if (!tag.isConnected) document.head.appendChild(tag);
  }
  document.head.querySelectorAll('link[rel="canonical"], script[data-ccs-seo]').forEach(node => node.remove());
  if (metadata.path && !metadata.noindex) {
    const link = document.createElement("link");
    link.rel = "canonical";
    link.href = publicUrl(origin, metadata.path);
    document.head.appendChild(link);
  }
  if (metadata.structuredData && !metadata.noindex) {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.dataset.ccsSeo = "";
    script.textContent = serializeJson(metadata.structuredData);
    document.head.appendChild(script);
  }
}
