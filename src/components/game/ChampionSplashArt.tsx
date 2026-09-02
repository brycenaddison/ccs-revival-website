/**
 * A champion's centered base splash, cropped to whatever box it is given.
 *
 * The art the client's post-game screen puts behind a row, and the one piece of champion imagery on the
 * site that is not the square icon. It comes from the routed CDN by numeric id, so there is no manifest
 * between a payload and the picture. **There is no icon fallback**: if the CDN has no centered splash
 * for an id the box stays the surface color, which reads as an empty tile rather than as a different
 * kind of tile.
 *
 * `fade` masks the right edge out so a name can sit over the tail; the mask is a `mask-image`, so the
 * surface behind shows through and it is right in both themes. Callers overlay whatever the box is for
 * (a level, a name) as children.
 */

import { useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "../../lib/cn";
import { championSplashUrl } from "../../lib/riot/cdragon";

/** Opaque over the left half, gone by three quarters: the art reads, and so does what sits beside it. */
const FADE = "linear-gradient(90deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,1) 22%, rgba(0,0,0,1) 45%, rgba(0,0,0,0) 80%)";

export function ChampionSplashArt({
  championId,
  className,
  style,
  fade = false,
  position = "center 22%",
  cropRight = 0,
  cropLeft = 0,
  children,
}: {
  championId: number;
  /** `object-position` for the vertical crop. The default sits a little above center, where faces are. */
  position?: string;
  /**
   * How much of the art's right side to cut, as a fraction of the box width. The art is drawn that much
   * wider than the box and anchored left, so the excess falls off the right edge; `object-position`
   * alone could not do it, because a box this wide already shows the art's full width.
   */
  cropRight?: number;
  /**
   * The same for the left side.
   *
   * Both are fractions of the *uncropped* width, and the caller narrows the box by the same amount:
   * the art is then drawn at exactly the scale it had before, and the box simply ends sooner. Cropping
   * without narrowing the box enlarges the art instead, since `object-cover` scales it to the width.
   */
  cropLeft?: number;
  /** Sizes the box. */
  className?: string;
  style?: CSSProperties;
  /** Mask the right edge out. Off by default; every tile on the site shows the whole crop. */
  fade?: boolean;
  children?: ReactNode;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <span className={cn("relative block overflow-hidden bg-bg3", className)} style={style}>
      {!failed && (
        <img
          src={championSplashUrl(championId)}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="absolute inset-y-0 h-full max-w-none object-cover brightness-110"
          style={{
            width: `${100 / (1 - cropRight - cropLeft)}%`,
            left: `-${(100 * cropLeft) / (1 - cropRight - cropLeft)}%`,
            objectPosition: position,
            ...(fade ? { maskImage: FADE, WebkitMaskImage: FADE } : {}),
          }}
        />
      )}
      {children}
    </span>
  );
}
