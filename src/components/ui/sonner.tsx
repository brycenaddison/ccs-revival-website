/**
 * shadcn's Sonner toaster, on the CCS palette and theme.
 *
 * One `Toaster` is mounted at the app root (`main.tsx`); anything calls `toast.success(...)` from
 * `sonner`. Toasts are for transient confirmation of something that already happened. A failure
 * stays inline through `ErrorLine` or `FieldError`, beside the action that failed, because a toast
 * disappears before a reader can act on it.
 *
 * The theme comes from `lib/theme.ts` rather than shadcn's `next-themes`, which this site does not
 * use. On mobile the stack sits above the bottom navigation bar instead of covering it.
 */

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { useTheme } from "@/lib/theme"
import { useWindowSize } from "@/hooks/useWindowSize"

// `SiteLayout` shows `MobileBottomBar` below this width; Sonner's own mobile breakpoint is narrower.
const BOTTOM_BAR_OFFSET = { bottom: "calc(var(--bottom-nav-h) + 12px)" }

const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useTheme()
  const aboveBottomBar = useWindowSize() < 768

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      position="bottom-right"
      offset={aboveBottomBar ? BOTTOM_BAR_OFFSET : undefined}
      mobileOffset={aboveBottomBar ? BOTTOM_BAR_OFFSET : undefined}
      icons={{
        success: <CircleCheckIcon className="size-4 text-ccs-green" />,
        info: <InfoIcon className="size-4 text-text-secondary" />,
        warning: <TriangleAlertIcon className="size-4 text-ccs-gold" />,
        error: <OctagonXIcon className="size-4 text-ccs-red" />,
        loading: <Loader2Icon className="size-4 animate-spin text-text-muted" />,
      }}
      toastOptions={{ classNames: { toast: "font-body text-sm", title: "text-text-bright" } }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
