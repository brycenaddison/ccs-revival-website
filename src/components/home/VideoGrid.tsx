/**
 * The newest YouTube uploads, at a size worth watching.
 *
 * Lives in the home page's centre column, which is the `1fr` track of `[280px_1fr_280px]` — around
 * 830px at the page's 1440px cap. That is the reason this exists as its own component rather than
 * as a wider variant of `SocialFeed`: the rail's job is to list *many* things compactly in 280px,
 * and this one's is to show a *few* things large. Same data, opposite priorities, so one component
 * with a `size` prop would be two layouts wearing a trench coat.
 *
 * **YouTube only.** `/home`'s feed merges YouTube and X, and the two want different treatments — a
 * video is a thumbnail you click to watch, a post is a line of text. `Home` splits the feed and
 * sends the remainder to `SocialFeed`, so nothing is dropped and neither surface shows a duplicate.
 */

import { Play } from "lucide-react";
import { timeAgo } from "../../lib/utils";
import type { FeedItem } from "../../lib/api";

interface Props {
  videos: readonly FeedItem[];
  isMobile: boolean;
}

/**
 * Three rows of two on desktop.
 *
 * The feed serves fifteen. All fifteen at this size is a page of nothing but YouTube below a
 * schedule nobody scrolled past — the rail exists to show the channel is active, not to be a
 * replacement for it.
 */
const MAX_VIDEOS = 6;

function VideoCard({ video }: { video: FeedItem }) {
  return (
    <a
      href={video.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group no-underline block"
    >
      <div className="relative aspect-video rounded-md overflow-hidden bg-bg3">
        {video.thumbnailUrl ? (
          <img
            src={video.thumbnailUrl}
            alt=""
            loading="lazy"
            decoding="async"
            /* `hqdefault` is 4:3 with letterbox bars baked in; cropping to 16:9 removes them
               rather than framing them. */
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-text-subtle">
            <Play size={28} aria-hidden />
          </div>
        )}

        {/* Play badge. Decorative — the whole card is already the link. */}
        <div
          className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: "rgba(0,0,0,0.35)" }}
          aria-hidden
        >
          <span className="flex items-center justify-center w-12 h-12 rounded-full bg-accent">
            <Play size={20} className="text-white ml-0.5" fill="currentColor" />
          </span>
        </div>
      </div>

      <p className="text-[13px] text-text leading-snug mt-2.5 mb-0 line-clamp-2 group-hover:text-accent transition-colors">
        {video.title}
      </p>
      <div className="flex items-center gap-2 mt-1 text-[10px] text-text-muted">
        {video.author && (
          <span className="font-heading uppercase tracking-wider">{video.author}</span>
        )}
        {video.author && video.publishedAt && <span>·</span>}
        {video.publishedAt && <span>{timeAgo(video.publishedAt)}</span>}
      </div>
    </a>
  );
}

export function VideoGrid({ videos, isMobile }: Props) {
  // Empty renders nothing, for the reason `SocialFeed` does: every source upstream fails soft, so
  // an empty feed is indistinguishable from a quiet week and a failure box would be a guess.
  if (videos.length === 0) return null;

  return (
    <div className="bg-bg2 rounded-lg border border-border overflow-hidden">
      <div className="px-4 py-3.5 border-b border-border">
        <span className="font-display text-[15px] text-text-bright tracking-widest">
          LATEST VIDEOS
        </span>
      </div>
      <div
        className="grid gap-4 p-4"
        style={{ gridTemplateColumns: `repeat(${isMobile ? 1 : 2}, minmax(0, 1fr))` }}
      >
        {videos.slice(0, MAX_VIDEOS).map(v => (
          <VideoCard key={v.id} video={v} />
        ))}
      </div>
    </div>
  );
}
