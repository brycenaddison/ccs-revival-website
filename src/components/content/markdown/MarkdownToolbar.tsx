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
const WIDE = "hidden @min-[640px]/markdown:inline-flex";

function CommandButton({ id, className, state, run, writing, uploading }: Props & { id: CommandId; className?: string }) {
  const command = commandById[id];
  const label = [command.label, shortcutLabel(command.key)].filter(Boolean).join(" · ");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <ToolbarButton
          aria-label={label} className={className}
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

function CommandDropdown({ label, icon: Icon, ids, className, state, run, writing, uploading }: Props & {
  label: string; icon: LucideIcon; ids: CommandId[]; className?: string;
}) {
  const chosen = useRef<CommandId | null>(null);
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <ToolbarButton aria-label={label} disabled={!writing} className={className}>
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
              className={id === "h2" || id === "h3" ? "font-semibold text-text-bright" : undefined}
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
    <Toolbar aria-label="Markdown formatting" className="border-t border-border px-2 py-1">
      <CommandButton {...props} id="undo" className={WIDE} />
      <CommandButton {...props} id="redo" className={WIDE} />
      <CommandDropdown {...props} label="Heading" icon={Heading} className={WIDE} ids={commands.filter(c => c.group === "Headings").map(c => c.id)} />
      <CommandButton {...props} id="bold" />
      <CommandButton {...props} id="italic" />
      <CommandButton {...props} id="strike" className={WIDE} />
      <CommandDropdown {...props} label="Lists" icon={List} className={WIDE} ids={["bullet", "ordered", "task"]} />
      <CommandButton {...props} id="link" />
      <CommandButton {...props} id="image" className={WIDE} />
      <CommandDropdown {...props} label="More" icon={Ellipsis} ids={commands.filter(c => !["bold", "italic", "link"].includes(c.id)).map(c => c.id)} />
    </Toolbar>
  );
}
