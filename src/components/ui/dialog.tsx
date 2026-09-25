import * as Primitive from "@radix-ui/react-dialog";
import type { ComponentProps } from "react";
import { cn } from "../../lib/cn";

export const Dialog = Primitive.Root;
export const DialogTrigger = Primitive.Trigger;
export const DialogTitle = Primitive.Title;
export const DialogDescription = Primitive.Description;
export const DialogClose = Primitive.Close;
export function DialogContent({ className, children, ...props }: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Overlay className="fixed inset-0 z-[300] bg-[var(--overlay)]" />
      <Primitive.Content className={cn("fixed z-[301] border-border bg-bg2 text-text shadow-dialog outline-none", className)} {...props}>
        {children}
      </Primitive.Content>
    </Primitive.Portal>
  );
}
