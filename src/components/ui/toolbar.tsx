import * as Primitive from "@radix-ui/react-toolbar";
import type { ComponentProps } from "react";
import { cn } from "../../lib/cn";

export function Toolbar({ className, ...props }: ComponentProps<typeof Primitive.Root>) {
  return <Primitive.Root className={cn("flex min-w-0 items-center gap-1", className)} {...props} />;
}
export const TOOLBAR_BUTTON = "inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded px-2 text-sm text-text-secondary outline-none hover:bg-bg3 hover:text-text-bright focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-40";
export function ToolbarButton({ className, ...props }: ComponentProps<typeof Primitive.Button>) {
  return <Primitive.Button type="button" className={cn(TOOLBAR_BUTTON, className)} {...props} />;
}
