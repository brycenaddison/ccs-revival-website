/**
 * The merged YouTube/X rail.
 *
 * Upstream merges both sources into one newest-first list tagged with `source`, so this is one rail
 * rather than a panel per network — which is also why it survives one source going down.
 *
 * **An empty feed renders nothing at all, and that is deliberate.** Every source upstream fails
 * soft: a dead bridge serves the last good copy, and with nothing cached the field is `[]`. So an
 * empty rail is indistinguishable from a quiet week, and a "couldn't load posts" box would be a
 * guess — usually a wrong one. The server-side check for a genuinely misconfigured source is
 * `npm run home-smoke`, not anything this component could detect.
 */

import { Play, Youtube } from "lucide-react";
import { timeAgo } from "../../lib/utils";
import type { FeedItem } from "../../lib/api";

interface Props {
  items: readonly FeedItem[];
}

/**
 * `source` is a free string, not a union — the X bridge is a swappable config URL upstream, so a
 * third source is a config change and not a deploy. An unrecognized one gets the generic glyph
 * rather than being dropped.
 */
function SourceIcon({ source }: { source: string }) {
  const s = source.toLowerCase();
  if (s === "youtube") return <Youtube size={12} aria-hidden />;
  if (s === "x" || s === "twitter") {
    return (
      <svg viewBox="0 0 24 24" width={11} height={11} fill="currentColor" aria-hidden>
        <path d="M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.41l-5.8-7.58-6.64 7.58H.46l8.6-9.83L0 1.15h7.59l5.24 6.93zm-1.29 19.5h2.04L6.49 3.24H4.3z" />
      </svg>
    );
  }
  return <Play size={12} aria-hidden />;
}

function FeedRow({ item, isLast }: { item: FeedItem; isLast: boolean }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex gap-3 py-3 group no-underline ${!isLast ? "border-b border-border" : ""}`}
    >
      {item.thumbnailUrl ? (
        <div className="w-16 h-11 rounded overflow-hidden shrink-0">
          <img
            src={item.thumbnailUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        <div className="w-16 h-11 rounded shrink-0 bg-bg3 flex items-center justify-center text-text-subtle">
          <SourceIcon source={item.source} />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1 text-text-dim">
          <SourceIcon source={item.source} />
          <span className="font-heading text-[9px] ">
            {item.author || item.source}
          </span>
          {item.publishedAt && (
            <span className="text-[10px] text-text-muted">· {timeAgo(item.publishedAt)}</span>
          )}
        </div>
        <p className="text-[12px] text-text leading-snug line-clamp-2 m-0 group-hover:text-brand transition-colors">
          {item.title}
        </p>
      </div>
    </a>
  );
}

export function SocialFeed({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <div className="bg-bg2 rounded-lg border border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <span className="font-display text-[14px] text-text-bright ">Social</span>
      </div>
      <div className="px-4">
        {items.map((item, i) => (
          <FeedRow key={item.id} item={item} isLast={i === items.length - 1} />
        ))}
      </div>
    </div>
  );
}
