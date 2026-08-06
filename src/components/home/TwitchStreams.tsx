/**
 * The featured Twitch stream, live only.
 *
 * `GET /home/live` answers with one stream or `null` — when both configured channels are live,
 * upstream features the busier one. That is a change from the old panel, which rendered a
 * hand-curated list of channel, clip and YouTube embeds out of a Supabase table that no longer
 * exists; there is no clip or VOD surface in the API today, so this shows the live channel or
 * nothing.
 *
 * **`null` renders nothing.** The route is always mounted upstream even with no Twitch credentials
 * configured, because "nobody is streaming" and "we cannot ask" are the same answer to a page. So
 * there is no error state to distinguish and no empty box to show — most of the week there simply
 * is no stream.
 *
 * The payload carries a `thumbnailUrl`, but this keeps the iframe player: the panel sits in the
 * centre column of a page a reader leaves open, and a still image of a live match is worse than the
 * match. `login` is what the player URL needs, and `parent` is required by Twitch for any embed.
 */

import { useQuery } from "@tanstack/react-query";
import { queries } from "../../lib/queries";

interface Props {
  /** `window.location.hostname`. Twitch refuses to embed without a matching `parent`. */
  parentDomain: string;
}

export function TwitchStreams({ parentDomain }: Props) {
  const { data: stream } = useQuery(queries.homeLive());

  if (!stream) return null;

  return (
    <div className="bg-bg2 rounded-lg border border-border overflow-hidden">
      <div className="px-4 py-3.5 border-b border-border flex items-center gap-2.5">
        <span className="font-display text-[15px] text-text-bright tracking-widest">LIVE NOW</span>
        <span className="w-1.5 h-1.5 rounded-full bg-ccs-red animate-pulse" aria-hidden />
        <span className="ml-auto font-mono text-[11px] text-text-muted">
          {stream.viewers.toLocaleString()} watching
        </span>
      </div>

      <div className="aspect-video">
        <iframe
          src={`https://player.twitch.tv/?channel=${encodeURIComponent(stream.login)}&parent=${encodeURIComponent(parentDomain)}&muted=true`}
          className="border-0 w-full h-full"
          allowFullScreen
          title={stream.title || stream.displayName}
        />
      </div>

      <a
        href={stream.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block px-4 py-3 no-underline group"
      >
        <p className="text-[13px] text-text leading-snug m-0 truncate group-hover:text-accent transition-colors">
          {stream.title || stream.displayName}
        </p>
        <div className="flex items-center gap-2 mt-1 text-[10px] text-text-muted">
          <span className="font-heading uppercase tracking-wider">{stream.displayName}</span>
          {stream.gameName && (
            <>
              <span>·</span>
              <span>{stream.gameName}</span>
            </>
          )}
        </div>
      </a>
    </div>
  );
}
