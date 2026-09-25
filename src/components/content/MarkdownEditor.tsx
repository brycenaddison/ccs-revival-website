import { memo, useDeferredValue, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, GripHorizontal, Maximize2 } from "lucide-react";
import type { EditorState } from "@codemirror/state";
import { Markdown, type TypesetPreset } from "../Markdown";
import { UPLOAD_LIMIT_TEXT, useImagePicker } from "../ImageUpload";
import { CONTROL_CLASS } from "../stats/FilterBar";
import { ACTION, ACTION_PRIMARY } from "../admin/adminUi";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "../ui/popover";
import { TooltipProvider } from "../ui/tooltip";
import { TOOLBAR_BUTTON } from "../ui/toolbar";
import { commandById, type CommandId } from "./markdown/commands";
import { MarkdownToolbar } from "./markdown/MarkdownToolbar";
import { MarkdownContextMenu } from "./markdown/MarkdownContextMenu";
import { TableSizePicker } from "./markdown/TableSizePicker";
import { useEditorSize } from "./markdown/useEditorSize";
import { useMarkdownSession, type MarkdownSession } from "./markdown/useMarkdownSession";

interface Props {
  value: string;
  onChange: (value: string) => void;
  size?: "document" | "notes";
  placeholder?: string;
  ariaLabel?: string;
  preset?: TypesetPreset;
  /** Increment on a deliberate form Reset, including a Reset to identical text. Record changes remount. */
  resetKey?: string | number;
}
type Mode = "write" | "split" | "preview";
type InsertionDraft = { kind: "link"; bookmark: symbol; text: string; url: string }
  | { kind: "table"; bookmark: symbol };
const DeferredMarkdown = memo(Markdown);

function Source({ session, visible }: { session: MarkdownSession; visible: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => host.current ? session.attach(host.current) : undefined, [session]);
  useLayoutEffect(() => {
    if (!visible) return;
    session.restoreScroll();
    if (session.focusOnShow) { session.focusOnShow = false; session.focus(); }
  }, [session, visible]);
  return <div ref={host} className="h-full min-h-0 min-w-0 text-text caret-text
    [&_.cm-editor]:h-full [&_.cm-editor]:min-w-0 [&_.cm-editor.cm-focused]:outline-none
    [&_.cm-scroller]:overflow-auto [&_.cm-scroller]:font-mono! [&_.cm-scroller]:text-base [&_.cm-scroller]:leading-relaxed!
    sm:[&_.cm-scroller]:text-sm [&_.cm-content]:min-h-full [&_.cm-content]:px-3! [&_.cm-content]:py-3!
    [&_.cm-line]:px-0! [&_.cm-placeholder]:text-text-dim! [&_.cm-cursor]:border-l-text!
    [&_.cm-selectionBackground]:bg-brand/25! focus-within:ring-2 focus-within:ring-inset focus-within:ring-ring/60" />;
}

function Preview({ value, preset, label, session }: { value: string; preset: TypesetPreset; label: string; session: MarkdownSession }) {
  const deferred = useDeferredValue(value);
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    element.scrollTop = session.previewScroll;
    return () => { session.previewScroll = element.scrollTop; };
  }, [session]);
  return (
    <div ref={host} tabIndex={0} aria-label={`${label} preview`} role="region"
      className="h-full min-h-0 min-w-0 overflow-auto py-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60 [overflow-wrap:anywhere]">
      {/* Article width includes the same side padding as SiteLayout's public news column. */}
      <div className={preset === "article"
        ? "mx-auto w-full max-w-article px-3 md:px-8"
        : "px-4 [&_.typeset>p]:max-w-[75ch]"}>
        {deferred.trim() ? <DeferredMarkdown body={deferred} preset={preset} /> : <p className="text-sm text-text-dim">Nothing to preview yet.</p>}
      </div>
    </div>
  );
}

function MarkdownHelp() {
  return (
    <Popover>
      <PopoverTrigger asChild><button type="button" className={`${TOOLBAR_BUTTON} h-8 text-xs`}>Markdown help</button></PopoverTrigger>
      <PopoverContent align="start" className="max-h-[min(440px,var(--radix-popover-content-available-height))] w-80 max-w-[calc(100vw-24px)] overflow-y-auto text-xs">
        <p className="font-semibold text-text-bright">Write with Markdown</p>
        <p className="mt-2">Select text, then use the toolbar or right-click to format it. More includes inline code, block quotes, code blocks, tables and horizontal rules. Tab leaves the writing area.</p>
        <p className="mt-2">Use <code>## Heading</code>, <code>**bold**</code>, <code>*italic*</code>, and <code>[label](/path)</code>. Preview shows what readers will see.</p>
        <p className="mt-2">Shift + right-click opens the browser menu. Touch and long-press keep the phone’s text-selection menu.</p>
        <p className="mt-2">Table opens a grid to choose columns and rows, including the header row.</p>
        <p className="mt-2">Images go inline at the saved cursor position without adding line breaks. Type a description between the empty square brackets. {UPLOAD_LIMIT_TEXT}</p>
        <p className="mt-2 break-words">Set image size with <code>{'![Description](image-url "width=256")'}</code> (1–9999 pixels). Images shrink to fit and keep their proportions. Ordinary image titles remain tooltips.</p>
        <p className="mt-2">To resize the editor outside full-screen mode, use "Drag to resize". You can also focus "Drag to resize" then use Up/Down to change height by 32 pixels, or Home/End for the limits.</p>
      </PopoverContent>
    </Popover>
  );
}

interface WorkspaceProps {
  session: MarkdownSession; state: EditorState; value: string; preset: TypesetPreset; label: string;
  fullscreen: boolean; mode: Mode; setMode: (mode: Mode) => void; exit: () => void;
  sizing: ReturnType<typeof useEditorSize>; run: (id: CommandId) => void;
  uploading: boolean; uploadError: string | null;
  insertion: InsertionDraft | null; setInsertion: (draft: InsertionDraft | null) => void;
  sourceId: string;
}

function Workspace({ session, state, value, preset, label, fullscreen, mode, setMode, exit,
  sizing, run, uploading, uploadError, insertion, setInsertion, sourceId }: WorkspaceProps) {
  const frame = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  const linkId = useId();
  useLayoutEffect(() => {
    if (!frame.current) return;
    const observer = new ResizeObserver(entries => setWide(entries[0].contentRect.width >= 960));
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, []);
  // Retain the preferred Split mode through a narrow viewport, using Write until it fits again.
  const visibleMode = mode === "split" && !wide ? "write" : mode;
  const writing = visibleMode !== "preview";
  const link = insertion?.kind === "link" ? insertion : null;
  function closeInsertion() {
    if (insertion) session.cancelBookmark(insertion.bookmark);
    setInsertion(null);
  }
  function applyLink() {
    if (!link?.url.trim()) return;
    session.insertLink(link.bookmark, link.text || link.url, link.url);
    setInsertion(null);
  }
  return (
    <div ref={frame} className={`@container/markdown flex min-h-0 min-w-0 flex-col bg-bg2 ${fullscreen ? "h-full" : "rounded-md border border-border"}`}>
      {fullscreen && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
          <DialogTitle className="min-w-0 truncate font-heading text-sm text-text-bright">{label}</DialogTitle>
          <button type="button" className={TOOLBAR_BUTTON} onClick={exit}><ArrowLeft size={16} aria-hidden="true" />Back to form</button>
        </div>
      )}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-1 px-2 py-1">
        <div role="group" aria-label={`${label} editor view`} className="flex">
          {(["write", ...(fullscreen && wide ? ["split"] : []), "preview"] as Mode[]).map(pane => (
            <button key={pane} type="button" aria-pressed={visibleMode === pane}
              className={`${TOOLBAR_BUTTON} ${visibleMode === pane ? "bg-bg3 text-text-bright" : ""}`}
              onClick={() => setMode(pane)}>{pane === "write" ? "Write" : pane === "split" ? "Split" : "Preview"}</button>
          ))}
        </div>
        {!fullscreen && (
          <DialogTrigger asChild>
            <button type="button" className={TOOLBAR_BUTTON}><Maximize2 size={16} aria-hidden="true" />Full screen</button>
          </DialogTrigger>
        )}
      </div>
      <Popover open={insertion !== null} onOpenChange={open => { if (!open) closeInsertion(); }}>
        <PopoverAnchor asChild><div className="shrink-0"><MarkdownToolbar state={state} run={run} writing={writing} uploading={uploading} /></div></PopoverAnchor>
        <PopoverContent aria-label={insertion?.kind === "table" ? "Insert table" : "Insert link"} align="start"
          className="max-h-[var(--radix-popover-content-available-height)] w-80 max-w-[calc(100vw-24px)] overflow-y-auto"
          onCloseAutoFocus={event => { event.preventDefault(); session.focus(); }}
          onKeyDown={event => {
            if (link && event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); applyLink(); }
          }}>
          {insertion?.kind === "table" && <TableSizePicker onCancel={closeInsertion} onInsert={size => {
            session.insertTable(insertion.bookmark, size);
            setInsertion(null);
          }} />}
          {link && <div className="space-y-3">
            <label htmlFor={`${linkId}-text`} className="block text-xs text-text-secondary">Link text</label>
            <input id={`${linkId}-text`} className={CONTROL_CLASS} value={link.text} onChange={event => setInsertion({ ...link, text: event.target.value })} />
            <label htmlFor={`${linkId}-url`} className="block text-xs text-text-secondary">URL or relative path</label>
            <input id={`${linkId}-url`} className={CONTROL_CLASS} inputMode="url" placeholder="https://… or /news" value={link.url} onChange={event => setInsertion({ ...link, url: event.target.value })} />
            <div className="flex gap-2">
              <button type="button" className={ACTION_PRIMARY} disabled={!link.url.trim()} onClick={applyLink}>Insert link</button>
              <button type="button" className={ACTION} onClick={closeInsertion}>Cancel</button>
            </div>
          </div>}
        </PopoverContent>
      </Popover>
      {(uploading || uploadError) && <div className="shrink-0 border-t border-border px-3 py-2 text-xs">
        {uploading && <p role="status" className="text-text-secondary">Uploading image…</p>}
        {uploadError && <p role="alert" className="text-ccs-red">{uploadError}</p>}
      </div>}
      <div className={`grid min-h-0 min-w-0 border-t border-border ${fullscreen ? "flex-1" : "shrink-0"} ${visibleMode === "split" ? "grid-cols-2" : "grid-cols-1"}`}
        style={fullscreen ? undefined : { height: sizing.height }}>
        <div id={sourceId} className={`${writing ? "" : "hidden"} min-h-0 min-w-0 ${visibleMode === "split" ? "border-r border-border" : ""}`}>
          <MarkdownContextMenu session={session} state={state} run={run} uploading={uploading}>
            <Source session={session} visible={writing} />
          </MarkdownContextMenu>
        </div>
        {visibleMode !== "write" && <Preview value={value} preset={preset} label={label} session={session} />}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-2 border-t border-border px-2 py-1 text-xs text-text-dim">
        <MarkdownHelp />
        {fullscreen ? (
          <DialogDescription className="px-2 py-1 text-text-secondary">Changes are in your form. Save the form to publish or store them.</DialogDescription>
        ) : <div className="flex items-center">
          <button type="button" className={`${TOOLBAR_BUTTON} h-8 text-xs`} onClick={sizing.reset}>Reset size</button>
          <div role="separator" tabIndex={0} aria-label={`${label} writing area height`} aria-orientation="horizontal"
            aria-controls={sourceId} aria-valuemin={200} aria-valuemax={sizing.max} aria-valuenow={sizing.height} aria-valuetext={`${sizing.height} pixels`}
            className="flex h-8 cursor-ns-resize touch-none select-none items-center gap-1 rounded px-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            onPointerDown={sizing.onPointerDown} onPointerMove={sizing.onPointerMove} onPointerUp={sizing.onPointerUp}
            onPointerCancel={sizing.onPointerUp} onLostPointerCapture={sizing.onPointerUp} onKeyDown={sizing.onKeyDown}>
            <GripHorizontal size={16} aria-hidden="true" /><span>Drag to resize</span>
          </div>
        </div>}
      </div>
    </div>
  );
}

/** The parent owns persistence; this session owns document history and presentation. */
export function MarkdownEditor({ value, onChange, size = "document", placeholder, ariaLabel = "Body", preset = "notes", resetKey }: Props) {
  const { session, state } = useMarkdownSession({ value, onChange, placeholder, ariaLabel, resetKey });
  const [fullscreen, setFullscreen] = useState(false);
  const [mode, setMode] = useState<Mode>("write");
  const [insertion, setInsertion] = useState<InsertionDraft | null>(null);
  const sizing = useEditorSize(size);
  const picker = useImagePicker(() => { });
  const uploadBookmark = useRef<symbol | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const sourceId = useId();
  function changeMode(next: Mode) {
    session.afterComposition(() => {
      session.rememberScroll();
      session.focusOnShow = next !== "preview";
      setMode(next);
    });
  }
  function changeFullscreen(open: boolean) {
    session.afterComposition(() => {
      session.rememberScroll();
      if (!open && mode === "split") setMode("write");
      setFullscreen(open);
    });
  }
  function run(id: CommandId) {
    if (session.composing || !commandById[id].available(session.state)) return;
    if (id === "link" || id === "table") {
      if (insertion) session.cancelBookmark(insertion.bookmark);
      const bookmark = session.bookmark();
      setInsertion(id === "link" ? { kind: "link", bookmark, text: session.selectedText(), url: "" } : { kind: "table", bookmark });
    } else if (id === "image") {
      if (picker.busy) return;
      if (uploadBookmark.current) session.cancelBookmark(uploadBookmark.current);
      const bookmark = session.bookmark();
      uploadBookmark.current = bookmark;
      picker.openForInsertion(url => {
        session.afterComposition(() => {
          if (!session.insertImage(bookmark, url)) return;
          changeMode("write");
          session.focus();
        });
      });
    } else {
      session.run(id);
      session.focus();
    }
  }
  useLayoutEffect(() => { session.onAction = run; });
  useEffect(() => { setInsertion(null); }, [resetKey]);
  const workspace = <Workspace session={session} state={state} value={value} preset={preset} label={ariaLabel}
    fullscreen={fullscreen} mode={mode} setMode={changeMode} exit={() => changeFullscreen(false)} sizing={sizing}
    run={run} uploading={picker.busy} uploadError={picker.error} insertion={insertion} setInsertion={setInsertion} sourceId={sourceId} />;

  return (
    <TooltipProvider delayDuration={300}>
      <Dialog open={fullscreen} onOpenChange={changeFullscreen}>
        <div ref={container} className="min-w-0">
          {picker.field}
          {fullscreen ? <div style={{ height: sizing.height }} aria-hidden="true" /> : workspace}
        </div>
        {fullscreen && <DialogContent
          className="inset-x-0 flex h-dvh min-h-0 min-w-0 flex-col overflow-hidden pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]"
          style={{ height: sizing.viewport, top: sizing.viewportTop }}
          onOpenAutoFocus={event => {
            if (mode !== "preview") { event.preventDefault(); session.focus(); }
          }}
          onCloseAutoFocus={event => {
            event.preventDefault();
            container.current?.querySelector<HTMLButtonElement>('[aria-haspopup="dialog"]')?.focus();
          }}
          onEscapeKeyDown={event => { event.preventDefault(); changeFullscreen(false); }}
        >{workspace}</DialogContent>}
      </Dialog>
    </TooltipProvider>
  );
}
