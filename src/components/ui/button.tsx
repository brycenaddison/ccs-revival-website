/**
 * shadcn's Button, on the CCS palette: every general action on the site.
 *
 * The variants carry the treatments the old `ACTION*` class strings did. `default` is the one action
 * a panel is for (save, create, grant), `outline` a secondary one (cancel, page, deselect),
 * `destructive` an irreversible one, and `size="sm"` the smaller pair for actions inside a row.
 * `quiet` with `size="inline"` is the chromeless action beside a section caption: the same weight as
 * the caption, so the row reads as a heading with affordances rather than a toolbar. Its color is the
 * part a caller overrides (a copy action turns green), which `cn` resolves in the caller's favor.
 *
 * **`destructive` cannot rely on hue.** `--primary` and `--destructive` are both `#d20708` in this
 * palette (CCS red *is* the danger red), so a filled destructive button and a filled primary one
 * would be identical. Destructive is therefore outlined in red with red text, and primary is filled.
 *
 * A link styled as a button is `<Button asChild><Link …/></Button>`, so it stays a real link.
 */

import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  // The shared box. `font-heading` at medium weight rather than shadcn's `font-medium` on the body
  // face: the heading role is what every actionable surface on this site wears (`AGENTS.md`, UI).
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-heading font-medium no-underline transition-colors cursor-pointer disabled:pointer-events-none disabled:opacity-40 aria-disabled:pointer-events-none aria-disabled:opacity-40 outline-none focus-visible:ring-2 focus-visible:ring-ring/60 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground border border-primary hover:bg-primary/90",
        outline: "border border-border bg-transparent text-text-bright hover:bg-accent hover:text-accent-foreground",
        destructive: "border border-destructive/40 bg-transparent text-destructive hover:bg-destructive/10",
        ghost: "text-text-secondary hover:bg-accent hover:text-accent-foreground",
        link: "text-brand underline-offset-4 hover:underline",
        quiet: "border-none bg-transparent text-text-dim hover:text-text-bright",
      },
      size: {
        default: "px-4 py-2 text-sm",
        sm: "px-3 py-1.5 text-xs",
        icon: "h-9 w-9",
        "icon-sm": "h-7 w-7",
        inline: "gap-1.5 p-0 text-[10px]",
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
  // `asChild` renders the caller's element with these classes instead of a `<button>`, which is how
  // a dialog's action can also be a `<Link>`, and how Radix's trigger parts compose.
  const Component = asChild ? Slot : "button";
  return <Component className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { buttonVariants };
