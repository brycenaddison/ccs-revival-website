/**
 * shadcn's Button, on the CCS palette.
 *
 * The first `ui/` primitive, and it exists mostly so the dialog beside it has something to put in its
 * footer. It is **not yet the app's button**: `adminUi.tsx`'s `ACTION*` class strings still dress
 * every existing form, and converting ~40 call sites is a separate change from introducing the
 * component. When that happens, `ACTION` becomes `variant="outline"`, `ACTION_PRIMARY` becomes
 * `variant="default"`, `ACTION_DANGER` becomes `variant="destructive"` and the `_SM` pair becomes
 * `size="sm"` — the variants below are named for that mapping rather than invented.
 *
 * **`destructive` cannot rely on hue.** `--primary` and `--destructive` are both `#d20708` in this
 * palette — CCS red *is* the danger red — so a filled destructive button and a filled primary one
 * would be identical. Destructive is therefore outlined in red with red text, which is what
 * `ACTION_DANGER` already does and the reason it looked right.
 */

import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "../../lib/cn";

const buttonVariants = cva(
  // The shared box. `font-heading` at medium weight rather than shadcn's `font-medium` on the body
  // face: the heading role is what every actionable surface on this site wears (`CLAUDE.md`, UI).
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-heading font-medium transition-colors cursor-pointer disabled:pointer-events-none disabled:opacity-40 outline-none focus-visible:ring-2 focus-visible:ring-ring/60 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground border border-primary hover:bg-primary/90",
        outline: "border border-border text-text-bright hover:bg-accent hover:text-accent-foreground",
        destructive: "border border-destructive/40 text-destructive hover:bg-destructive/10",
        ghost: "text-text-secondary hover:bg-accent hover:text-accent-foreground",
        link: "text-brand underline-offset-4 hover:underline",
      },
      size: {
        default: "px-4 py-2 text-sm",
        sm: "px-3 py-1.5 text-xs",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  // `asChild` renders the caller's element with these classes instead of a `<button>` — which is how
  // a dialog's action can also be a `<Link>`, and how Radix's trigger parts compose.
  const Component = asChild ? Slot : "button";
  return <Component className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { buttonVariants };
