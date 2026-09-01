/**
 * Merge class names, letting a caller's utility win over a component's default.
 *
 * `clsx` flattens conditionals; `tailwind-merge` is the part that matters — it resolves *conflicts*
 * by keeping the last utility in a group, so `cn("px-4", "px-2")` is `px-2` rather than both. Without
 * it, a `ui/` component's own padding and an override passed through `className` would both land in
 * the class list and the winner would be whichever Tailwind happened to emit later, which is not
 * something a call site can reason about.
 *
 * This is the one helper every shadcn component imports, which is why it lives here under the name
 * their docs use rather than being folded into `utils.ts`.
 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
