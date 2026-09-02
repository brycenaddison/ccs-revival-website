/**
 * The theme's colors as strings, for the one surface Tailwind cannot dress: a canvas.
 *
 * chart.js paints with color values, not classes, and the site's rule is that no component carries a
 * raw hex. So the charts read the same custom properties the utilities resolve to, off
 * `documentElement`, and re-read them when `ThemeToggle` flips `data-theme`. That is what keeps a gold
 * graph on the tokens and correct in both themes without a second palette.
 *
 * A `MutationObserver` on the attribute rather than a theme context, because the toggle writes the
 * attribute directly and nothing else on the site subscribes to it; adding a provider for one hook
 * would be a bigger change than the hook.
 */

import { useEffect, useState } from "react";

export interface ThemeColors {
  sideBlue: string;
  sideRed: string;
  text: string;
  textSecondary: string;
  textDim: string;
  border: string;
  surface: string;
  green: string;
  gold: string;
  purple: string;
  /** Font stacks, for the same reason: a canvas takes a family name, not a class. */
  fontBody: string;
  fontMono: string;
}

const VARS: Record<keyof ThemeColors, string> = {
  fontBody: "--font-body",
  fontMono: "--font-mono",
  sideBlue: "--side-blue",
  sideRed: "--side-red",
  text: "--text",
  textSecondary: "--text-secondary",
  textDim: "--text-dim",
  border: "--border",
  surface: "--bg2",
  green: "--green",
  gold: "--gold",
  purple: "--purple",
};

function read(): ThemeColors {
  const style = getComputedStyle(document.documentElement);
  const out = {} as ThemeColors;
  for (const key of Object.keys(VARS) as (keyof ThemeColors)[]) {
    out[key] = style.getPropertyValue(VARS[key]).trim();
  }
  return out;
}

export function useThemeColors(): ThemeColors {
  const [colors, setColors] = useState<ThemeColors>(read);

  useEffect(() => {
    const observer = new MutationObserver(() => setColors(read()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  return colors;
}

/** `#rrggbb` plus an alpha as a hex byte, for a series that should recede. */
export function withAlpha(hex: string, alpha: number): string {
  const byte = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return /^#[0-9a-f]{6}$/i.test(hex) ? `${hex}${byte}` : hex;
}
