/**
 * shadcn's Native Select, on the CCS palette.
 *
 * For plain option lists where the browser's own popup (and the OS picker on mobile) is the right
 * control. `ui/select.tsx` is the styled listbox for places that want one.
 *
 * Two CCS departures. The wrapper fills its container by default, as every form field here does;
 * `containerClassName` narrows it. And the popup follows the site theme through `color-scheme`, with
 * options painted from the theme surface, because the browser otherwise picks a white list on the
 * dark page.
 */

import * as React from "react"
import { cn } from "@/lib/cn"
import { ChevronDownIcon } from "lucide-react"

function NativeSelect({
  className,
  containerClassName,
  size = "default",
  ...props
}: Omit<React.ComponentProps<"select">, "size"> & {
  size?: "sm" | "default"
  containerClassName?: string
}) {
  return (
    <div
      className={cn(
        "group/native-select relative w-full min-w-0 has-[select:disabled]:opacity-40",
        containerClassName
      )}
      data-slot="native-select-wrapper"
    >
      <select
        data-slot="native-select"
        data-size={size}
        className={cn(
          "h-9 w-full min-w-0 cursor-pointer appearance-none rounded-md border border-input bg-bg2 px-3 py-2 pr-9 font-body text-sm text-text scheme-light transition-colors outline-none disabled:pointer-events-none disabled:cursor-not-allowed data-[size=sm]:h-8 data-[size=sm]:py-1 data-[size=sm]:text-xs dark:scheme-dark",
          "focus-visible:border-ring",
          "aria-invalid:border-destructive",
          className
        )}
        {...props}
      />
      <ChevronDownIcon
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-text-muted select-none"
        aria-hidden="true"
        data-slot="native-select-icon"
      />
    </div>
  )
}

function NativeSelectOption({
  className,
  ...props
}: React.ComponentProps<"option">) {
  return (
    <option
      data-slot="native-select-option"
      className={cn("bg-bg2 text-text", className)}
      {...props}
    />
  )
}

function NativeSelectOptGroup({
  className,
  ...props
}: React.ComponentProps<"optgroup">) {
  return (
    <optgroup
      data-slot="native-select-optgroup"
      className={cn("bg-bg2 text-text", className)}
      {...props}
    />
  )
}

export { NativeSelect, NativeSelectOptGroup, NativeSelectOption }
