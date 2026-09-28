import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useLeague } from "../../lib/leagueContext";
import { applyMetadata, type PageMetadata } from "../../lib/seo/metadata";
import { siteOrigin } from "../../lib/seo/site";
import { routeMetadata } from "../../lib/seo/routes";

const origin = siteOrigin(import.meta.env.VITE_SITE_ORIGIN);
type Override = Partial<PageMetadata>;
type Entry = { key: string; value: Override };
const MetadataContext = createContext<((entry: Entry) => () => void) | null>(null);

/** One head writer, outside lazy routes and the setup gate; route keys reject stale async overrides. */
export function MetadataProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { tournaments, selectedConfs } = useLeague();
  const key = `${location.key}:${location.pathname}${location.search}`;
  const [entry, setEntry] = useState<Entry | null>(null);
  const publish = useCallback((next: Entry) => {
    setEntry(next);
    return () => setEntry(current => current === next ? null : current);
  }, []);
  const metadata = routeMetadata(location.pathname, location.search, origin);
  if (["/standings", "/teams", "/scores", "/schedule", "/stats", "/info"].includes(location.pathname)) {
    const labels = selectedConfs.map(conf => tournaments.find(t => t.conf === conf)?.name).filter(Boolean);
    if (labels.length) metadata.description += ` ${labels.join("; ")}.`;
  }
  const serialized = JSON.stringify(entry?.key === key ? { ...metadata, ...entry.value } : metadata);
  useLayoutEffect(() => { applyMetadata(JSON.parse(serialized), origin); }, [serialized]);
  return <MetadataContext.Provider value={publish}>{children}</MetadataContext.Provider>;
}

export function usePageMetadata(value: Override, enabled = true): void {
  const publish = useContext(MetadataContext);
  const location = useLocation();
  const key = `${location.key}:${location.pathname}${location.search}`;
  const serialized = JSON.stringify(value);
  const stable = useMemo<Override>(() => JSON.parse(serialized), [serialized]);
  useLayoutEffect(() => enabled ? publish?.({ key, value: stable }) : undefined, [publish, key, stable, enabled]);
}
