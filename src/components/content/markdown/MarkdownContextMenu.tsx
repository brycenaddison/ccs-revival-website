import { useRef, type ReactNode } from "react";
import { EditorSelection, type EditorState } from "@codemirror/state";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuSub,
  ContextMenuPortal, ContextMenuShortcut, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger,
} from "../../ui/context-menu";
import { commands, shortcutLabel, type CommandGroup, type CommandId, type MarkdownCommand } from "./commands";
import type { MarkdownSession } from "./useMarkdownSession";

export function MarkdownContextMenu({ children, session, state, run, uploading }: {
  children: ReactNode; session: MarkdownSession; state: EditorState;
  run: (id: CommandId) => void; uploading: boolean;
}) {
  const trigger = useRef<HTMLSpanElement>(null);
  const pointerType = useRef("mouse");
  const chosen = useRef<CommandId | null>(null);

  function open(x: number, y: number) {
    // Only this inert proxy is a Radix Trigger. Touch events never reach it, so Radix cannot
    // start its long-press timer or suppress WebKit's native text-selection callout.
    trigger.current?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 2 }));
  }
  function placeCaret(x: number, y: number) {
    const view = session.view;
    const pos = view?.posAtCoords({ x, y });
    if (!view || pos == null) return;
    const range = view.state.selection.main;
    if (range.empty || pos < range.from || pos > range.to) {
      view.dispatch({ selection: EditorSelection.cursor(pos) });
    }
  }
  const item = (command: MarkdownCommand) => (
    <ContextMenuItem key={command.id} disabled={!command.available(state) || command.id === "image" && uploading}
      onSelect={() => {
        if (command.id === "image") run(command.id);
        else chosen.current = command.id;
      }}>
      <command.icon size={15} aria-hidden="true" />
      <span className={command.id === "h2" || command.id === "h3" ? "font-semibold" : undefined}>{command.label}</span>
      {command.key && <ContextMenuShortcut>{shortcutLabel(command.key)}</ContextMenuShortcut>}
    </ContextMenuItem>
  );
  const group = (name: CommandGroup) => (
    <ContextMenuSub key={name}>
      <ContextMenuSubTrigger>{name}</ContextMenuSubTrigger>
      <ContextMenuPortal>
        <ContextMenuSubContent>{commands.filter(c => c.group === name).map(item)}</ContextMenuSubContent>
      </ContextMenuPortal>
    </ContextMenuSub>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger ref={trigger} className="sr-only" aria-hidden="true" tabIndex={-1} />
      <div className="h-full min-h-0 min-w-0"
        onPointerDownCapture={event => {
          pointerType.current = event.pointerType;
          if (event.button !== 2 || event.shiftKey || event.pointerType !== "mouse") return;
          placeCaret(event.clientX, event.clientY);
          // Keep a selected range intact until the menu opens; normal left-click selection is native.
          event.preventDefault();
        }}
        onContextMenu={event => {
          if (event.shiftKey || pointerType.current !== "mouse") return;
          event.preventDefault();
          event.stopPropagation();
          placeCaret(event.clientX, event.clientY);
          open(event.clientX, event.clientY);
        }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing || session.composing) return;
          if (event.key !== "ContextMenu" && !(event.key === "F10" && event.shiftKey)) return;
          event.preventDefault();
          event.stopPropagation();
          const view = session.view;
          const caret = view?.coordsAtPos(view.state.selection.main.head);
          const bounds = event.currentTarget.getBoundingClientRect();
          open(caret?.left ?? bounds.left + 16, caret?.bottom ?? bounds.top + 24);
        }}
      >{children}</div>
      <ContextMenuContent onCloseAutoFocus={event => {
        event.preventDefault();
        const id = chosen.current;
        chosen.current = null;
        if (id) run(id);
        else session.focus();
      }}>
        {commands.filter(c => c.group === "History").map(item)}
        <ContextMenuSeparator />
        {commands.filter(c => c.group === "Inline").map(item)}
        <ContextMenuSeparator />
        {group("Headings")}{group("Lists")}{group("Insert")}
        <ContextMenuSeparator />
        <p className="max-w-60 px-2 py-1 text-xs text-text-dim">Shift + right-click for the browser menu.</p>
      </ContextMenuContent>
    </ContextMenu>
  );
}
