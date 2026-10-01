import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { useLocation } from "react-router-dom";
import { Search, X } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { RouteErrorBoundary } from "../layout/RouteErrorBoundary";

const SearchResults = lazy(() => import("./SearchResults"));

const SearchContext = createContext<{
  open: boolean;
  mac: boolean;
  dialogId: string;
  openSearch: (returnFocusTo: HTMLElement | null) => void;
} | null>(null);

export function useSiteSearch() {
  const context = useContext(SearchContext);
  if (!context) throw new Error("Search controls must be inside SiteSearch");
  return context;
}

/** One dialog and keyboard handler for every search entry point in the layout. */
export function SiteSearch({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mac, setMac] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const dialogId = useId();
  const location = useLocation();

  useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform)), []);
  useEffect(() => setOpen(false), [location]);

  const openSearch = useCallback((returnFocusTo: HTMLElement | null) => {
    opener.current = returnFocusTo;
    setOpen(true);
  }, []);

  const changeOpen = useCallback((next: boolean) => {
    if (next) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    setOpen(next);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.isComposing || event.altKey || event.shiftKey ||
        !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "k") return;
      // Editors own Mod+K for links. Leave other dialogs and ordinary form controls alone too.
      const target = event.target instanceof Element ? event.target : null;
      if (!open && target?.closest("input, textarea, select, [contenteditable=true], [role=dialog], .cm-editor")) return;
      event.preventDefault();
      changeOpen(!open);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, changeOpen]);

  const context = useMemo(() => ({ open, mac, dialogId, openSearch }), [open, mac, dialogId, openSearch]);

  return (
    <SearchContext.Provider value={context}>
      {children}
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent
          id={dialogId}
          className="left-1/2 top-[8dvh] flex max-h-[80dvh] w-[calc(100%_-_1.5rem)] max-w-xl -translate-x-1/2 flex-col overflow-hidden rounded-xl border"
          onCloseAutoFocus={event => {
            // The menu entry unmounts when it opens search; its caller supplies the hamburger button.
            // A breakpoint change can also remove a trigger, so fall back to the current visible one.
            event.preventDefault();
            const target = opener.current?.isConnected && opener.current !== document.body
              ? opener.current : document.querySelector<HTMLElement>("[data-site-search-trigger]");
            target?.focus({ preventScroll: true });
          }}
        >
          <div className="flex shrink-0 items-center justify-between gap-3 px-4 pt-3 pb-2">
            <div>
              <DialogTitle className="font-heading text-sm font-semibold text-text-bright">Search CCS</DialogTitle>
              <DialogDescription className="mt-0.5 text-xs text-text-secondary">Jump to a page or search all teams and players.</DialogDescription>
            </div>
            <DialogClose className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-text-secondary hover:bg-bg-input hover:text-text-bright focus-visible:outline-2 focus-visible:outline-brand" aria-label="Close search">
              <X size={18} aria-hidden="true" />
            </DialogClose>
          </div>
          <RouteErrorBoundary>
            <Suspense fallback={<p role="status" className="px-4 py-6 text-sm text-text-secondary">Loading search…</p>}>
              <SearchResults onNavigate={() => setOpen(false)} />
            </Suspense>
          </RouteErrorBoundary>
          <div className="flex shrink-0 flex-wrap gap-x-4 gap-y-1 border-t border-border px-4 py-2 text-[11px] text-text-secondary">
            <span>↑ ↓ to move</span><span>Enter to open</span><span>Esc to close</span>
          </div>
        </DialogContent>
      </Dialog>
    </SearchContext.Provider>
  );
}

/** Shared activation and accessibility; each navigation surface supplies its own button content. */
export function SiteSearchTrigger({ children, className, returnFocusRef }: {
  children?: ReactNode;
  className?: string;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const { open, mac, dialogId, openSearch } = useSiteSearch();
  return (
    <button
      type="button"
      data-site-search-trigger
      aria-label="Search players, teams, pages, and commands"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={open ? dialogId : undefined}
      aria-keyshortcuts="Control+k Meta+k"
      title={`Search (${mac ? "⌘" : "Ctrl+"}K)`}
      onClick={event => openSearch(returnFocusRef?.current ?? event.currentTarget)}
      className={`focus-visible:outline-2 focus-visible:outline-brand ${className ?? "flex min-h-9 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md border border-border px-2.5 text-text-secondary transition-colors hover:bg-bg-input hover:text-text-bright"}`}
    >
      {children ?? <>
        <Search size={18} aria-hidden="true" />
        <span className="hidden font-heading text-sm lg:inline">Search</span>
        <kbd className="hidden rounded border border-border px-1 font-mono text-[10px] text-text-secondary xl:inline">{mac ? "⌘" : "Ctrl+"}K</kbd>
      </>}
    </button>
  );
}
