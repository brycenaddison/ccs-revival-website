import { useRef } from "react";
import { ChevronDown, Ellipsis, FileText, Heading, LayoutTemplate, List, type LucideIcon } from "lucide-react";
import type { EditorState } from "@codemirror/state";
import { Toolbar, ToolbarButton } from "@/components/ui/toolbar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuShortcut, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { EditorTemplate } from "@/lib/api";
import { canFormat, commandById, commands, shortcutLabel, type CommandId } from "./commands";

interface Props {
  state: EditorState;
  run: (id: CommandId) => void;
  writing: boolean;
  uploading: boolean;
  templates: EditorTemplate[];
  insertTemplate: (body: string) => void;
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

interface MenuItem {
  key: string;
  label: string;
  icon: LucideIcon;
  shortcut?: string;
  disabled: boolean;
  /** A native file picker must open in the user gesture, especially on iOS. */
  immediate?: boolean;
  run: () => void;
}
function ToolbarMenu({ label, icon: Icon, items, disabled }: {
  label: string; icon: LucideIcon; items: MenuItem[]; disabled: boolean;
}) {
  // Everything else runs after the menu closes, so focus is back in the editor first.
  const chosen = useRef<(() => void) | null>(null);
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <ToolbarButton aria-label={label} disabled={disabled}>
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
            const action = chosen.current;
            chosen.current = null;
            action();
          }
        }}
      >
        {items.map(item => (
          <DropdownMenuItem
            key={item.key}
            disabled={item.disabled}
            onSelect={() => {
              if (item.immediate) item.run();
              else chosen.current = item.run;
            }}
          >
            <item.icon size={15} aria-hidden="true" />
            <span className="min-w-0 truncate">{item.label}</span>
            {item.shortcut && <DropdownMenuShortcut>{item.shortcut}</DropdownMenuShortcut>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CommandDropdown({ label, icon, ids, state, run, writing, uploading }: Props & {
  label: string; icon: LucideIcon; ids: CommandId[];
}) {
  const items = ids.map(id => {
    const command = commandById[id];
    return {
      key: id, label: command.label, icon: command.icon, shortcut: shortcutLabel(command.key),
      disabled: !command.available(state) || id === "image" && uploading,
      immediate: id === "image",
      run: () => run(id),
    };
  });
  return <ToolbarMenu label={label} icon={icon} items={items} disabled={!writing} />;
}

export function MarkdownToolbar(props: Props) {
  const { state, writing, templates, insertTemplate } = props;
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
      <CommandDropdown {...props} label="More" icon={Ellipsis} ids={["code", "quote", "codeBlock", "table", "toc", "rule"]} />
      {templates.length > 0 && (
        <ToolbarMenu
          label="Templates" icon={LayoutTemplate} disabled={!writing}
          items={templates.map(template => ({
            key: String(template.id), label: template.name, icon: FileText,
            disabled: !canFormat(state), run: () => insertTemplate(template.body),
          }))}
        />
      )}
    </Toolbar>
  );
}
