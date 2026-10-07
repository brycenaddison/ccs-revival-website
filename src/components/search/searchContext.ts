/**
 * The site search context, apart from `SiteSearch.tsx` so that module exports only components.
 * A module mixing components and a hook cannot be hot-swapped by Fast Refresh: an edit beneath it
 * re-ran it and created a second context, and the mounted provider no longer matched its consumers.
 */
import { createContext, useContext } from "react";

export interface SiteSearchState {
  open: boolean;
  mac: boolean;
  dialogId: string;
  openSearch: (returnFocusTo: HTMLElement | null) => void;
}

export const SearchContext = createContext<SiteSearchState | null>(null);

export function useSiteSearch(): SiteSearchState {
  const context = useContext(SearchContext);
  if (!context) throw new Error("Search controls must be inside SiteSearch");
  return context;
}
