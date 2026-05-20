interface TwitchEmbed {
  id: string;
  embed_type: "channel" | "clip" | "youtube";
  channel_name?: string;
  clip_url?: string;
  title?: string;
  is_active: boolean;
  sort_order: number;
}

interface Props {
  embeds: TwitchEmbed[];
  parentDomain: string;
}

function extractClipSlug(url: string): string | null {
  const parts = url.split("/").filter(Boolean);
  return parts[parts.length - 1] || null;
}

function extractYoutubeId(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

export function TwitchStreams({ embeds, parentDomain }: Props) {
  const activeEmbeds = embeds
    .filter((e) => e.is_active)
    .sort((a, b) => a.sort_order - b.sort_order);

  const channels = activeEmbeds.filter((e) => e.embed_type === "channel");
  const clips = activeEmbeds.filter((e) => e.embed_type === "clip");
  const youtube = activeEmbeds.filter((e) => e.embed_type === "youtube");
  const sorted = [...channels, ...clips, ...youtube];

  if (sorted.length === 0) return null;

  return (
    <div className="bg-bg2 rounded-lg border border-border overflow-hidden">
      <div className="px-4 py-3.5 border-b border-border">
        <span className="font-display text-[15px] text-text-bright tracking-widest">
          STREAMS & VODS
        </span>
      </div>
      <div className="flex flex-col gap-4 p-4">
        {sorted.map((embed) => {
          if (embed.embed_type === "channel" && embed.channel_name) {
            return (
              <div key={embed.id}>
                {embed.title && (
                  <p className="text-xs text-text-muted font-display tracking-wider mb-2">
                    {embed.title}
                  </p>
                )}
                <div className="aspect-video overflow-hidden rounded-md">
                  <iframe
                    src={`https://player.twitch.tv/?channel=${embed.channel_name}&parent=${parentDomain}&muted=true`}
                    height="300"
                    width="100%"
                    className="border-0 w-full h-full"
                    allowFullScreen
                    title={embed.title || embed.channel_name}
                  />
                </div>
              </div>
            );
          }

          if (embed.embed_type === "clip" && embed.clip_url) {
            const slug = extractClipSlug(embed.clip_url);
            if (!slug) return null;

            return (
              <div key={embed.id}>
                <div className="aspect-video overflow-hidden rounded-md">
                  <iframe
                    src={`https://clips.twitch.tv/embed?clip=${slug}&parent=${parentDomain}&muted=true`}
                    height="200"
                    width="100%"
                    className="border-0 w-full h-full"
                    allowFullScreen
                    title={embed.title || slug}
                  />
                </div>
                {embed.title && (
                  <p className="text-xs text-text-muted font-display tracking-wider mt-2">
                    {embed.title}
                  </p>
                )}
              </div>
            );
          }

          if (embed.embed_type === "youtube" && embed.clip_url) {
            const videoId = extractYoutubeId(embed.clip_url);
            if (!videoId) return null;

            return (
              <div key={embed.id}>
                {embed.title && (
                  <p className="text-xs text-text-muted font-heading tracking-wider mb-2 uppercase">
                    {embed.title}
                  </p>
                )}
                <div className="aspect-video overflow-hidden rounded-md">
                  <iframe
                    src={`https://www.youtube.com/embed/${videoId}`}
                    width="100%"
                    className="border-0 w-full h-full"
                    allowFullScreen
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    title={embed.title || "YouTube video"}
                  />
                </div>
              </div>
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}
