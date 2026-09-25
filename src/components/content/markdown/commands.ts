import { EditorSelection, type ChangeSpec, type EditorState, type StateCommand } from "@codemirror/state";
import { redo, redoDepth, undo, undoDepth, isolateHistory } from "@codemirror/commands";
import { ensureSyntaxTree } from "@codemirror/language";
import {
  Bold, Code, CodeXml, Heading, ImagePlus, Italic, Link, List, ListChecks, ListOrdered,
  Minus, Quote, Redo2, Strikethrough, Table, Undo2, type LucideIcon,
} from "lucide-react";

export type CommandId = "undo" | "redo" | "paragraph" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6"
  | "bold" | "italic" | "strike" | "bullet" | "ordered" | "task" | "link" | "image"
  | "quote" | "code" | "codeBlock" | "table" | "rule";
export type CommandGroup = "History" | "Headings" | "Inline" | "Lists" | "Insert";
export interface MarkdownCommand {
  id: CommandId;
  label: string;
  icon: LucideIcon;
  group: CommandGroup;
  key?: string;
  run?: StateCommand;
  available: (state: EditorState) => boolean;
}

/** Include whole lines, except a next line touched only by the selection's end. */
function lineRange(state: EditorState) {
  const { from, to } = state.selection.main;
  return {
    first: state.doc.lineAt(from),
    last: state.doc.lineAt(to > from && state.doc.lineAt(to).from === to ? to - 1 : to),
  };
}

/** Formatting is deliberately unavailable in (or across) existing code blocks. */
const formatAvailability = new WeakMap<EditorState, boolean>();
export function canFormat(state: EditorState): boolean {
  const cached = formatAvailability.get(state);
  if (cached !== undefined) return cached;
  const { first, last } = lineRange(state);
  const tree = ensureSyntaxTree(state, last.to, 40);
  if (!tree) return false;
  let safe = true;
  tree.iterate({
    from: first.from, to: last.to,
    enter(node) {
      if (node.name === "FencedCode" || node.name === "CodeBlock") {
        safe = false;
        return false;
      }
    },
  });
  formatAvailability.set(state, safe);
  return safe;
}

type Target = Parameters<StateCommand>[0];
function commit(target: Target, changes: ChangeSpec, anchor: number, head = anchor) {
  target.dispatch(target.state.update({
    changes, selection: EditorSelection.single(anchor, head), scrollIntoView: true,
    annotations: isolateHistory.of("full"), userEvent: "input.format",
  }));
  return true;
}

/** Insert exactly the supplied Markdown, preserving surrounding whitespace. */
export function insertInline(target: Target, from: number, to: number, body: string, selectFrom = body.length, selectTo = selectFrom) {
  return commit(target, { from, to, insert: body }, from + selectFrom, from + selectTo);
}

/** Block elements need blank lines around them to render independently. */
export function insertBlock(target: Target, from: number, to: number, body: string, selectFrom: number, selectTo = selectFrom) {
  const before = target.state.sliceDoc(0, from);
  const after = target.state.sliceDoc(to);
  const lead = !before || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const tail = !after || after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
  return insertInline(target, from, to, lead + body + tail, lead.length + selectFrom, lead.length + selectTo);
}

export const TABLE_MAX_COLUMNS = 8;
export const TABLE_MAX_ROWS = 8;
/** Rows includes the header; the Markdown delimiter line is not a visible row. */
export interface TableSize { columns: number; rows: number }
export function insertTable(target: Target, from: number, to: number, { columns, rows }: TableSize) {
  if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 1 || columns > TABLE_MAX_COLUMNS || rows < 1 || rows > TABLE_MAX_ROWS) return false;
  const row = (cells: string[]) => `| ${cells.join(" | ")} |`;
  const headings = Array.from({ length: columns }, (_, i) => `Heading ${i + 1}`);
  const body = [
    row(headings),
    row(Array<string>(columns).fill("---")),
    ...Array<string>(rows - 1).fill(row(Array<string>(columns).fill("Cell"))),
  ].join("\n");
  return insertBlock(target, from, to, body, 2, 2 + headings[0].length);
}

function inline(marker: string, placeholder: string): StateCommand {
  return target => {
    const { state } = target;
    const { from, to, empty } = state.selection.main;
    if (empty) return commit(target, { from, insert: marker + placeholder + marker }, from + marker.length, from + marker.length + placeholder.length);
    const edits: { from: number; to: number; insert: string; inset: number; length: number }[] = [];
    // A delimiter never bridges an empty paragraph. Leading/trailing whitespace is left alone.
    const source = state.sliceDoc(from, to);
    const paragraphs = /[^\n]+(?:\n(?![\t ]*\n)[^\n]+)*/g;
    for (const paragraph of source.matchAll(paragraphs)) {
      const text = paragraph[0];
      const left = text.length - text.trimStart().length;
      const value = text.trim();
      if (!value) continue;
      let start = from + paragraph.index! + left;
      let end = start + value.length;
      const leftInside = value.startsWith(marker) && (marker !== "*" || !value.startsWith("**"));
      const rightInside = value.endsWith(marker) && (marker !== "*" || !value.endsWith("**"));
      const leftOutside = state.sliceDoc(Math.max(0, start - marker.length), start) === marker
        && (marker !== "*" || state.sliceDoc(Math.max(0, start - 2), start) !== "**");
      const rightOutside = state.sliceDoc(end, end + marker.length) === marker
        && (marker !== "*" || state.sliceDoc(end, end + 2) !== "**");
      // In a multi-paragraph selection the first/last delimiter can be outside the selection
      // while the other delimiter is inside it. Treat each edge independently when toggling.
      const contentStart = start + (leftInside ? marker.length : 0);
      const contentEnd = end - (rightInside ? marker.length : 0);
      if ((leftInside || leftOutside) && (rightInside || rightOutside) && contentEnd > contentStart) {
        const insert = state.sliceDoc(contentStart, contentEnd);
        if (!leftInside) start -= marker.length;
        if (!rightInside) end += marker.length;
        edits.push({ from: start, to: end, insert, inset: 0, length: insert.length });
      } else {
        edits.push({ from: start, to: end, insert: marker + value + marker, inset: marker.length, length: value.length });
      }
    }
    if (!edits.length) return false;
    const first = edits[0], last = edits[edits.length - 1];
    const shift = edits.slice(0, -1).reduce((n, edit) => n + edit.insert.length - (edit.to - edit.from), 0);
    return commit(target, edits, first.from + first.inset, last.from + shift + last.inset + last.length);
  };
}

function lines(kind: "heading" | "bullet" | "ordered" | "task" | "quote", level = 0): StateCommand {
  return target => {
    const { state } = target;
    const { first, last } = lineRange(state);
    const rows = Array.from({ length: last.number - first.number + 1 }, (_, i) => state.doc.line(first.number + i));
    const prefix = kind === "bullet" ? /^[-+*] / : kind === "ordered" ? /^\d+[.)] / : kind === "task" ? /^[-+*] \[[ xX]\] / : /^> ?/;
    const populated = rows.filter(row => row.text.trim());
    const remove = kind !== "heading" && populated.length > 0 && populated.every(row => prefix.test(row.text.trimStart())
      && (kind !== "bullet" || !/^[-+*] \[[ xX]\] /.test(row.text.trimStart())));
    let ordinal = 0;
    const edits = rows.flatMap(row => {
      if (!row.text.trim() && rows.length > 1) return [];
      const indent = row.text.match(/^[\t ]*/)?.[0] ?? "";
      let content = row.text.slice(indent.length);
      if (kind === "heading") content = content.replace(/^#{1,6}(?:[\t ]+|$)/, "");
      else if (kind === "quote") content = remove ? content.replace(prefix, "") : `> ${content}`;
      else {
        content = content.replace(/^(?:[-+*](?: \[[ xX]\])?|\d+[.)])(?:[\t ]+|$)/, "");
        if (!remove) content = `${kind === "bullet" ? "- " : kind === "task" ? "- [ ] " : `${++ordinal}. `}${content}`;
      }
      if (kind === "heading" && level) content = `${"#".repeat(level)} ${content}`;
      return [{ from: row.from, to: row.to, insert: indent + content }];
    });
    const changes = state.changes(edits);
    const selection = state.selection.main;
    const next = selection.empty ? changes.mapPos(selection.head, 1) : first.from;
    return commit(target, changes, next, selection.empty ? next : changes.mapPos(last.to, 1));
  };
}

function backtickWidth(text: string, minimum: number) {
  return Math.max(minimum, ...Array.from(text.matchAll(/`+/g), match => match[0].length + 1));
}

const inlineCode: StateCommand = target => {
  const { from, to, empty } = target.state.selection.main;
  const text = target.state.sliceDoc(from, to);
  // Code spans normalize line breaks; use a fenced block for multi-line source instead.
  if (text.includes("\n")) return false;
  const before = target.state.sliceDoc(0, from).match(/(`+)( ?)$/);
  const after = target.state.sliceDoc(to).match(/^( ?)(`+)/);
  if (!empty && before && after && before[1] === after[2] && before[2] === after[1]) {
    return commit(target, { from: from - before[0].length, to: to + after[0].length, insert: text }, from - before[0].length, to - before[0].length);
  }
  const wrapped = /^(`+)([\s\S]*?)\1$/.exec(text);
  if (wrapped && !wrapped[2].includes(wrapped[1])) {
    const inner = wrapped[2];
    return commit(target, { from, to, insert: inner }, from, from + inner.length);
  }
  const content = empty ? "code" : text;
  const ticks = "`".repeat(backtickWidth(content, 1));
  const pad = /^`|`$/.test(content) || (/^ .* $/.test(content) && content.trim()) ? " " : "";
  return commit(target, { from, to, insert: ticks + pad + content + pad + ticks }, from + ticks.length + pad.length, from + ticks.length + pad.length + content.length);
};

const codeBlock: StateCommand = target => {
  const { from, to } = target.state.selection.main;
  const content = target.state.sliceDoc(from, to) || "code";
  const fence = "`".repeat(backtickWidth(content, 3));
  return insertBlock(target, from, to, `${fence}\n${content}${content.endsWith("\n") ? "" : "\n"}${fence}`, fence.length + 1, fence.length + 1 + content.length);
};

export function escapeDestination(url: string) {
  return url.trim().replace(/&/g, "&amp;").replace(/[\s<>\\()]/g, char => encodeURIComponent(char).replace(/\(/g, "%28").replace(/\)/g, "%29"));
}
export function insertLink(target: Target, from: number, to: number, label: string, url: string) {
  const text = label.replace(/&/g, "&amp;").replace(/[\\`*{}\[\]()<>!_~|]/g, "\\$&").replace(/\r?\n/g, " ");
  const insert = `[${text}](${escapeDestination(url)})`;
  return insertInline(target, from, to, insert);
}

function command(id: CommandId, label: string, icon: LucideIcon, group: CommandGroup, run?: StateCommand, key?: string): MarkdownCommand {
  return { id, label, icon, group, run, key, available: canFormat };
}
export const commands: readonly MarkdownCommand[] = [
  { ...command("undo", "Undo", Undo2, "History", undo, "Mod-z"), available: state => undoDepth(state) > 0 },
  { ...command("redo", "Redo", Redo2, "History", redo, "Mod-Shift-z"), available: state => redoDepth(state) > 0 },
  command("paragraph", "Paragraph", Heading, "Headings", lines("heading")),
  ...([1, 2, 3, 4, 5, 6] as const).map(level => command(`h${level}`, `Heading ${level}`, Heading, "Headings", lines("heading", level))),
  command("bold", "Bold", Bold, "Inline", inline("**", "bold text"), "Mod-b"),
  command("italic", "Italic", Italic, "Inline", inline("*", "italic text"), "Mod-i"),
  command("strike", "Strikethrough", Strikethrough, "Inline", inline("~~", "text"), "Mod-Shift-x"),
  { ...command("code", "Inline code", Code, "Inline", inlineCode), available: state => canFormat(state) && !state.sliceDoc(state.selection.main.from, state.selection.main.to).includes("\n") },
  command("bullet", "Bulleted list", List, "Lists", lines("bullet")),
  command("ordered", "Numbered list", ListOrdered, "Lists", lines("ordered")),
  command("task", "Task list", ListChecks, "Lists", lines("task")),
  command("link", "Link", Link, "Insert", undefined, "Mod-k"),
  command("image", "Image", ImagePlus, "Insert"),
  command("quote", "Block quote", Quote, "Insert", lines("quote")),
  command("codeBlock", "Code block", CodeXml, "Insert", codeBlock),
  command("table", "Table", Table, "Insert"),
  command("rule", "Horizontal rule", Minus, "Insert", target => {
    const { from, to } = target.state.selection.main;
    return insertBlock(target, from, to, "---", 3);
  }),
];
export const commandById = Object.fromEntries(commands.map(command => [command.id, command])) as Record<CommandId, MarkdownCommand>;
export function shortcutLabel(key: string | undefined) {
  if (!key) return "";
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  return key.replace("Mod", mac ? "Cmd" : "Ctrl").split("-").map(part => part.length === 1 ? part.toUpperCase() : part).join("+");
}
