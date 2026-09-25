import { useLayoutEffect, useState, useSyncExternalStore } from "react";
import { EditorState, type Transaction } from "@codemirror/state";
import { drawSelection, EditorView, keymap, placeholder as placeholderExtension } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { commandById, commands, escapeDestination, insertInline, insertLink, insertTable, type CommandId, type TableSize } from "./commands";

interface Options {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
  resetKey?: string | number;
}
interface Bookmark { from: number; to: number }

/** A session outlives its view. Portals may replace the view, never its state/history. */
export class MarkdownSession {
  state: EditorState;
  view: EditorView | null = null;
  onAction: (id: CommandId) => void = () => {};
  focusOnShow = false;
  previewScroll = 0;
  private listeners = new Set<() => void>();
  private bookmarks = new Map<symbol, Bookmark>();
  private scroll = { top: 0, left: 0 };
  private pendingActions: (() => void)[] = [];
  private compositionTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private options: Options) {
    this.state = this.createState(options.value);
  }

  private createState(doc: string) {
    return EditorState.create({
      doc,
      extensions: [
        history(), markdown({ addKeymap: false }), EditorView.lineWrapping, drawSelection(),
        EditorView.contentAttributes.of({ "aria-label": this.options.ariaLabel, "aria-multiline": "true", spellcheck: "true" }),
        placeholderExtension(this.options.placeholder ?? "Write Markdown…"),
        keymap.of([
          ...commands.filter(command => command.key).map(command => ({
            key: command.key!, preventDefault: true,
            run: (view: EditorView) => {
              if (view.composing || view.compositionStarted) return false;
              this.onAction(command.id);
              return true;
            },
          })),
          ...historyKeymap, ...defaultKeymap,
        ]),
        EditorView.domEventHandlers({
          compositionend: () => { this.flushComposition(); return false; },
        }),
      ],
    });
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  getSnapshot = () => this.state;
  private notify() { this.listeners.forEach(listener => listener()); }

  sync(options: Options) {
    const reset = options.resetKey !== this.options.resetKey || options.value !== this.state.doc.toString();
    this.options = options;
    if (!reset) return;
    // A parent echo matches the current document. External replacement starts a fresh history,
    // including an explicit Reset whose text happens to equal the current document.
    this.bookmarks.clear();
    this.afterComposition(() => {
      this.state = this.createState(options.value);
      this.scroll = { top: 0, left: 0 };
      this.previewScroll = 0;
      this.view?.setState(this.state);
      if (this.view) this.view.scrollDOM.scrollTop = 0;
      if (this.options.value !== options.value) this.options.onChange(options.value);
      this.notify();
    });
  }

  attach(host: HTMLElement) {
    const view = new EditorView({
      state: this.state, parent: host,
      dispatchTransactions: transactions => this.apply(transactions),
    });
    this.view = view;
    view.scrollDOM.scrollTop = this.scroll.top;
    view.scrollDOM.scrollLeft = this.scroll.left;
    // A measurement may be needed before a tall document has its scrollable height.
    view.requestMeasure({ read: () => null, write: () => {
      view.scrollDOM.scrollTop = this.scroll.top;
      view.scrollDOM.scrollLeft = this.scroll.left;
    } });
    return () => {
      if (view.scrollDOM.clientHeight) this.scroll = { top: view.scrollDOM.scrollTop, left: view.scrollDOM.scrollLeft };
      if (this.view === view) this.view = null;
      view.destroy();
    };
  }

  dispatch = (transaction: Transaction) => this.apply([transaction]);
  private apply(transactions: readonly Transaction[]) {
    let changed = false;
    for (const transaction of transactions) {
      if (transaction.docChanged) {
        changed = true;
        for (const [id, bookmark] of this.bookmarks) {
          let collapseTo: number | undefined;
          transaction.changes.iterChangedRanges((from, to, _newFrom, newTo) => {
            if (from < bookmark.to && to > bookmark.from || from === to && from > bookmark.from && from < bookmark.to) collapseTo = newTo;
          });
          const from = collapseTo ?? transaction.changes.mapPos(bookmark.from, 1);
          // If replacement or typing touches the selection, never delete that new text on completion.
          const to = collapseTo !== undefined || bookmark.from === bookmark.to ? from : Math.max(from, transaction.changes.mapPos(bookmark.to, -1));
          this.bookmarks.set(id, { from, to });
        }
      }
      this.state = transaction.state;
    }
    this.view?.update(transactions);
    if (changed) this.options.onChange(this.state.doc.toString());
    this.notify();
  }

  run(id: CommandId) {
    const command = commandById[id];
    if (this.composing || !command.available(this.state)) return;
    command.run?.(this);
  }
  focus = () => this.view?.focus();
  get composing() { return !!(this.view?.composing || this.view?.compositionStarted); }
  rememberScroll() {
    if (this.view?.scrollDOM.clientHeight) this.scroll = { top: this.view.scrollDOM.scrollTop, left: this.view.scrollDOM.scrollLeft };
  }
  restoreScroll() {
    this.view?.requestMeasure({ read: () => null, write: () => {
      if (!this.view) return;
      this.view.scrollDOM.scrollTop = this.scroll.top;
      this.view.scrollDOM.scrollLeft = this.scroll.left;
    } });
  }

  bookmark() {
    const id = Symbol("markdown insertion");
    const { from, to } = this.state.selection.main;
    this.bookmarks.set(id, { from, to });
    return id;
  }
  cancelBookmark(id: symbol) { this.bookmarks.delete(id); }
  selectedText() {
    const { from, to } = this.state.selection.main;
    return this.state.sliceDoc(from, to);
  }
  insertImage(id: symbol, url: string) {
    const bookmark = this.bookmarks.get(id);
    if (!bookmark) return false;
    this.bookmarks.delete(id);
    insertInline(this, bookmark.from, bookmark.to, `![](${escapeDestination(url)})`, 2);
    return true;
  }
  insertLink(id: symbol, label: string, url: string) {
    const bookmark = this.bookmarks.get(id);
    if (!bookmark) return;
    this.bookmarks.delete(id);
    insertLink(this, bookmark.from, bookmark.to, label, url);
  }
  insertTable(id: symbol, size: TableSize) {
    const bookmark = this.bookmarks.get(id);
    if (!bookmark) return false;
    const inserted = insertTable(this, bookmark.from, bookmark.to, size);
    if (inserted) this.bookmarks.delete(id);
    return inserted;
  }

  afterComposition(action: () => void) {
    if (this.composing) {
      this.pendingActions.push(action);
      // EditContext-based IMEs can end composition without a DOM compositionend event.
      this.flushComposition();
    }
    else action();
  }
  private flushComposition() {
    clearTimeout(this.compositionTimer);
    this.compositionTimer = setTimeout(() => {
      if (this.composing) { this.flushComposition(); return; }
      const pending = this.pendingActions;
      this.pendingActions = [];
      pending.forEach(action => action());
    }, 30);
  }
  dispose() {
    this.bookmarks.clear();
    this.pendingActions = [];
    clearTimeout(this.compositionTimer);
  }
}

export function useMarkdownSession(options: Options) {
  const [session] = useState(() => new MarkdownSession(options));
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  useLayoutEffect(() => { session.sync(options); }, [session, options.value, options.resetKey, options.onChange, options.ariaLabel, options.placeholder]);
  useLayoutEffect(() => () => session.dispose(), [session]);
  return { session, state };
}
