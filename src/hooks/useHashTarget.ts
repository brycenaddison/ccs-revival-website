import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Scroll to the URL's `#id` once `ready`. The browser looks for the target only while the document
 * loads, before a queried Markdown body exists, so a shared section link would otherwise land at
 * the top of the page.
 */
export function useHashTarget(ready: boolean) {
  const { hash } = useLocation();
  useEffect(() => {
    if (!ready || hash.length < 2) return;
    let id: string;
    try {
      id = decodeURIComponent(hash.slice(1));
    } catch {
      return;
    }
    document.getElementById(id)?.scrollIntoView();
  }, [ready, hash]);
}
