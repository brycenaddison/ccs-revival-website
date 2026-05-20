interface TwitterFeedItem {
  id: string;
  feed_type: "timeline" | "tweet";
  handle?: string;
  tweet_url?: string;
  title?: string;
  is_active: boolean;
  sort_order: number;
}

interface Props {
  feeds: TwitterFeedItem[];
}

function extractHandle(url: string): string | null {
  const match = url.match(/(?:twitter\.com|x\.com)\/(\w+)/);
  return match ? match[1] : null;
}

export function SocialLinks({ feeds }: Props) {
  const activeFeeds = feeds
    .filter((f) => f.is_active)
    .sort((a, b) => a.sort_order - b.sort_order);

  const timelines = activeFeeds.filter(f => f.feed_type === "timeline" && f.handle);
  const tweets = activeFeeds.filter(f => f.feed_type === "tweet" && f.tweet_url);
  const hasFeeds = activeFeeds.length > 0;

  return (
    <div className="bg-bg2 rounded-lg border border-border overflow-hidden">
      <div className="px-4 py-3.5 border-b border-border">
        <span className="font-display text-[15px] text-text-bright tracking-widest">
          SOCIALS
        </span>
      </div>
      <div className="flex flex-col gap-3 p-4">
        {/* Profile cards */}
        {timelines.map(feed => (
          <a
            key={feed.id}
            href={`https://x.com/${feed.handle}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 bg-bg3 rounded-lg p-4 border border-border hover:border-accent/40 transition-colors no-underline group"
          >
            <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold text-lg font-heading shrink-0">
              {(feed.handle || "?").charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-heading text-sm text-text-bright font-medium group-hover:text-accent transition-colors">
                @{feed.handle}
              </div>
              {feed.title && (
                <div className="text-text-secondary text-xs mt-0.5">{feed.title}</div>
              )}
            </div>
            <div className="bg-accent text-white text-xs font-heading font-medium px-4 py-2 rounded-full tracking-wider uppercase shrink-0 group-hover:opacity-90 transition-opacity">
              Follow
            </div>
          </a>
        ))}

        {/* Pinned tweet link cards */}
        {tweets.map(feed => {
          const handle = extractHandle(feed.tweet_url!) || "X";
          return (
            <a
              key={feed.id}
              href={feed.tweet_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-3 bg-bg3 rounded-lg p-4 border border-border hover:border-accent/40 transition-colors no-underline group"
            >
              <div className="w-8 h-8 rounded-full bg-bg-input flex items-center justify-center text-text-muted font-bold text-xs font-heading shrink-0 mt-0.5">
                {handle.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-heading text-[13px] text-text-bright font-medium">@{handle}</span>
                  {feed.title && (
                    <span className="text-text-dim text-[11px]">· {feed.title}</span>
                  )}
                </div>
                <div className="text-text-secondary text-xs group-hover:text-accent transition-colors">
                  View post on X →
                </div>
              </div>
              <svg viewBox="0 0 24 24" className="w-4 h-4 text-text-dim shrink-0 mt-1" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
          );
        })}

        {/* YouTube */}
        <a
          href="https://www.youtube.com/channel/UCGqyv9sQMj655WFm2NvSGzQ"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 bg-bg3 rounded-lg p-4 border border-border hover:border-ccs-red/40 transition-colors no-underline group"
        >
          <div className="w-12 h-12 rounded-full bg-ccs-red/20 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" className="w-6 h-6 text-ccs-red" fill="currentColor">
              <path d="M23.5 6.19a3.02 3.02 0 00-2.12-2.14C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.38.55A3.02 3.02 0 00.5 6.19 31.5 31.5 0 000 12a31.5 31.5 0 00.5 5.81 3.02 3.02 0 002.12 2.14c1.88.55 9.38.55 9.38.55s7.5 0 9.38-.55a3.02 3.02 0 002.12-2.14A31.5 31.5 0 0024 12a31.5 31.5 0 00-.5-5.81zM9.75 15.02V8.98L15.5 12l-5.75 3.02z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-heading text-sm text-text-bright font-medium group-hover:text-ccs-red transition-colors">
              CCS on YouTube
            </div>
            <div className="text-text-secondary text-xs mt-0.5">Watch VODs & highlights</div>
          </div>
          <div className="bg-ccs-red text-white text-xs font-heading font-medium px-4 py-2 rounded-full tracking-wider uppercase shrink-0 group-hover:opacity-90 transition-opacity">
            Subscribe
          </div>
        </a>
      </div>
    </div>
  );
}
