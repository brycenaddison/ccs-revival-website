/**
 * The client's post-game glyphs: KDA swords, damage, damage taken, crowd control, minions, vision,
 * and the switcher arrows.
 *
 * Inline SVG rather than files: seven paths of a few hundred bytes each, drawn with `fill-current`
 * so they take whatever text color the row gives them, in both themes. Gold is lucide's `Coins`; the
 * original shipped a PNG for it and inverted it per theme, which a vector never needs.
 */

import { Coins } from "lucide-react";
import { cn } from "../../../lib/cn";

export type ScoreboardIconType =
  | "kda"
  | "sword"
  | "shield"
  | "cc"
  | "minions"
  | "eye"
  | "gold"
  | "arrow-left"
  | "arrow-right";

const PATHS: Record<Exclude<ScoreboardIconType, "gold" | "arrow-right">, { viewBox: string; d: string }> = {
  kda: {
    viewBox: "0 0 16 16",
    d: "M8.8001 11.2001L12.0001 14.4001H14.4001V12.0001L11.2001 8.8001L8.8001 11.2001ZM5.0401 3.7601L3.2001 1.6001L1.6001 3.2001L3.7601 5.0401L2.4001 6.4001L4.0001 8.0001L8.0001 4.0001L6.4001 2.4001L5.0401 3.7601ZM12.0001 8.0001L13.6001 6.4001L12.2401 5.0401L14.4001 3.2001L12.8001 1.6001L10.9601 3.7601L9.6001 2.4001L8.0001 4.0001L9.2001 5.2001L1.6001 12.0001V14.4001H4.0001L10.8001 6.8001L12.0001 8.0001Z",
  },
  sword: {
    viewBox: "0 0 20 20",
    d: "M17 4.39999L15.6 3L12 6.5L9.39999 4L8 5.39999L10.2 7.7L3 14V17H6L12.3 9.8L14.5 12L16 10.5L13.5 8L17 4.39999Z",
  },
  shield: {
    viewBox: "0 0 20 20",
    d: "M12 5C11.9 5 10 3 10 3L8 5C6.2 5 4 3 4 3V7C4 13.8 10 17 10 17V17.2C10 17.2 16 14 16 7V3C16 3 14 5 12 5Z",
  },
  cc: {
    viewBox: "0 0 20 20",
    d: "M10 3C5.3 3 2 6.4 2 10C2.03929 11.8442 2.7894 13.6019 4.09373 14.9062C5.39807 16.2106 7.15581 16.9607 9 17C9.792 17.0148 10.5789 16.8697 11.3135 16.5734C12.0481 16.2771 12.7155 15.8357 13.2756 15.2756C13.8357 14.7155 14.2771 14.0481 14.5734 13.3135C14.8697 12.5788 15.0148 11.792 15 11C15.0152 10.3392 14.8962 9.68225 14.6503 9.06876C14.4044 8.45527 14.0367 7.89802 13.5693 7.43066C13.102 6.96331 12.5447 6.59557 11.9312 6.34967C11.3177 6.10377 10.6608 5.98482 10 6C6.8 6 5 7.9 5 10C4.98422 10.5296 5.0769 11.0568 5.27233 11.5492C5.46777 12.0416 5.76183 12.4889 6.13646 12.8635C6.51109 13.2382 6.95836 13.5322 7.4508 13.7277C7.94324 13.9231 8.47043 14.0158 9 14C11.3 14 12.4 12.3 12 10H10V11C10.0151 11.135 9.99962 11.2716 9.9547 11.3998C9.90979 11.528 9.83659 11.6445 9.74054 11.7405C9.64449 11.8366 9.52805 11.9098 9.39986 11.9547C9.27166 11.9996 9.13499 12.0151 9 12C8.73109 12.0251 8.45994 11.9907 8.20586 11.899C7.95179 11.8074 7.72105 11.6609 7.53007 11.4699C7.33909 11.279 7.19257 11.0482 7.10095 10.7941C7.00933 10.5401 6.97486 10.2689 7 10C7 8.4 8.3 8 10 8C12.4 8 13 9.3 13 11C13 13.6 11.6 15 9 15C8.33707 15.0235 7.6764 14.9102 7.05915 14.6672C6.4419 14.4243 5.88129 14.0568 5.41223 13.5878C4.94317 13.1187 4.57572 12.5581 4.33276 11.9409C4.08979 11.3236 3.97652 10.6629 4 10C4 6.8 6.7 5 10 5C13.7 5 16 8.4 16 12L17 13L18 12C18 6.6 14.2 3 10 3Z",
  },
  minions: {
    viewBox: "0 0 20 20",
    d: "M10 3C8 3 8 7 4 11C6 14 9 17 10 17C11 17 14 14 16 11C12 7 12 3 10 3ZM10 15L7 10C6.7 9.5 7.5 8.7 8 9L10 10L12 9C12.5 8.7 13.3 9.5 13 10L10 15Z",
  },
  eye: {
    viewBox: "0 0 20 20",
    d: "M10 4C4.3 4 1 10 1 10C1 10 4.5 16 10 16C15.4 16 19 10 19 10C19 10 15.4 4 10 4ZM10 14C8.93913 14 7.92172 13.5786 7.17157 12.8284C6.42142 12.0783 6 11.0609 6 10C6 8.93913 6.42142 7.92172 7.17157 7.17157C7.92172 6.42142 8.93913 6 10 6H10.5C10.2214 6.37142 10.0518 6.81308 10.0101 7.27548C9.96841 7.73789 10.0563 8.20278 10.2639 8.61804C10.4716 9.03331 10.7907 9.38253 11.1857 9.62662C11.5806 9.8707 12.0357 10 12.5 10C13.0359 9.97164 13.5542 9.79887 14 9.5V10C13.9968 11.0599 13.5744 12.0755 12.8249 12.8249C12.0755 13.5744 11.0599 13.9968 10 14V14Z",
  },
  "arrow-left": {
    viewBox: "0 0 20 20",
    d: "M13 6.3L11.7 5L7 10L11.7 15L13 13.6L9.5 10L13 6.3Z",
  },
};

export function ScoreboardIcon({
  type,
  className,
  title,
}: {
  type: ScoreboardIconType;
  /** Sizes the glyph: `h-4 w-4` and the like. Color follows `currentColor`. */
  className?: string;
  title?: string;
}) {
  const classes = cn("shrink-0 fill-current", className);

  if (type === "gold") return <Coins className={classes} strokeWidth={2} fill="none" aria-label={title} />;

  const source = type === "arrow-right" ? PATHS["arrow-left"] : PATHS[type];
  return (
    <svg
      viewBox={source.viewBox}
      className={cn(classes, type === "arrow-right" && "rotate-180")}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <path fillRule="evenodd" clipRule="evenodd" d={source.d} />
    </svg>
  );
}
