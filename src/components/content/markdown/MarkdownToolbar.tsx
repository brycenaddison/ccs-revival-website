import { useRef } from "react";
import { ChevronDown, Ellipsis, Heading, List, type LucideIcon } from "lucide-react";
import type { EditorState } from "@codemirror/state";
import { Toolbar, ToolbarButton } from "../../ui/toolbar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuShortcut, DropdownMenuTrigger,
} from "../../ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import { commandById, commands, shortcutLabel, type CommandId } from "./commands";

interface Props {
  state: EditorState;
  run: (id: CommandId) => void;
  writing: boolean;
  uploading: boolean;
}
function CommandButton({ id, state, run, writing, uploading }: Props & { id: CommandId }) {
  const command = commandById[id];
  const label = [command.label, shortcutLabel(command.key)].filter(Boolean).join(" · ");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <ToolbarButton
          aria-label={label}
          disabled={!writing || !command.available(state) || id === "image" && uploading}
          onMouseDown={event => event.preventDefault()}
          onClick={() => run(id)}
        >
          <command.icon size={16} aria-hidden="true" />
        </ToolbarButton>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function CommandDropdown({ label, icon: Icon, ids, state, run, writing, uploading }: Props & {
  label: string; icon: LucideIcon; ids: CommandId[];
}) {
  const chosen = useRef<CommandId | null>(null);
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <ToolbarButton aria-label={label} disabled={!writing}>
              <Icon size={16} aria-hidden="true" />
              <span className="hidden @min-[640px]/markdown:inline">{label}</span>
              <ChevronDown size={12} aria-hidden="true" />
            </ToolbarButton>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="start" aria-label={label}
        className="max-h-[min(440px,var(--radix-dropdown-menu-content-available-height))] w-64 max-w-[calc(100vw-24px)]"
        onCloseAutoFocus={event => {
          if (chosen.current) {
            event.preventDefault();
            const id = chosen.current;
            chosen.current = null;
            run(id);
          }
        }}
      >
        {ids.map(id => {
          const command = commandById[id];
          return (
            <DropdownMenuItem
              key={id}
              disabled={!command.available(state) || id === "image" && uploading}
              onSelect={() => {
                // A native file picker must open in the user gesture, especially on iOS.
                if (id === "image") run(id);
                else chosen.current = id;
              }}
            >
              <command.icon size={15} aria-hidden="true" />
              {command.label}
              {command.key && <DropdownMenuShortcut>{shortcutLabel(command.key)}</DropdownMenuShortcut>}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function MarkdownToolbar(props: Props) {
  return (
    <Toolbar aria-label="Markdown formatting" className="flex-wrap border-t border-border px-2 py-1">
      <CommandButton {...props} id="undo" />
      <CommandButton {...props} id="redo" />
      <CommandDropdown {...props} label="Heading" icon={Heading} ids={commands.filter(c => c.group === "Headings").map(c => c.id)} />
      <CommandButton {...props} id="bold" />
      <CommandButton {...props} id="italic" />
      <CommandButton {...props} id="strike" />
      <CommandDropdown {...props} label="Lists" icon={List} ids={["bullet", "ordered", "task"]} />
      <CommandButton {...props} id="link" />
      <CommandButton {...props} id="image" />
      <CommandDropdown {...props} label="More" icon={Ellipsis} ids={["code", "quote", "codeBlock", "table", "rule"]} />
    </Toolbar>
  );
}
