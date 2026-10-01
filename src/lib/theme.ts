import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

function currentTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

/**
 * The applied theme, re-rendering when `toggleTheme` flips it. Observes the attribute itself because
 * `index.html` applies the saved theme before React mounts and the toggle writes it directly.
 */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, currentTheme);
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

/** Toggle the applied theme, remember it for the next visit, and update embedded charts. */
export function toggleTheme(): void {
  const next = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try {
    localStorage.setItem("theme", next);
  } catch {
    // The current visit can still change theme when browser storage is unavailable.
  }
  document.querySelectorAll("iframe").forEach(frame => {
    try { frame.contentWindow?.postMessage({ type: "theme-change", theme: next }, "*"); } catch {}
  });
}
