import { cloneElement, useRef, type ComponentProps, type ReactElement } from "react";
import { cn } from "../../lib/cn";
import { CommandItem } from "@/components/ui/command";

/** Arrow/Enter selection and ordinary link behavior share the same anchor activation. */
export function CommandLinkItem({ value, onNavigate, children }: {
  value: string;
  onNavigate: () => void;
  children: ReactElement<ComponentProps<"a">>;
}) {
  const link = useRef<HTMLAnchorElement>(null);
  return (
    <CommandItem value={value} className="p-0" onSelect={() => link.current?.click()}>
      {cloneElement(children, {
        ref: link,
        tabIndex: -1,
        className: cn("flex w-full min-w-0 items-center gap-3 rounded-md px-3 py-2.5 text-inherit no-underline focus-visible:outline-2 focus-visible:outline-brand", children.props.className),
        onClick: event => {
          // Do not bubble the synthetic Enter click back into cmdk's onSelect.
          event.stopPropagation();
          children.props.onClick?.(event);
          if (!event.defaultPrevented && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) onNavigate();
        },
      })}
    </CommandItem>
  );
}
