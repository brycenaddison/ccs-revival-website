import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * Move up and Move down for a list whose order is itself the saved value. Buttons rather than drag
 * handles, so reordering works from the keyboard and on touch without a drag library.
 * `quiet` suits a dense row that already has quiet actions beside it.
 */
export function MoveButtons({ onMove, isFirst, isLast, upLabel, downLabel, disabled, variant = "outline", className }: {
  onMove: (step: -1 | 1) => void;
  isFirst: boolean;
  isLast: boolean;
  upLabel: string;
  downLabel: string;
  disabled?: boolean;
  variant?: "outline" | "quiet";
  className?: string;
}) {
  const quiet = variant === "quiet";
  const size = quiet ? "inline" : "sm";
  const icon = quiet ? 14 : 13;
  return (
    <div className={cn("flex shrink-0 items-center", quiet ? "gap-1" : "gap-1.5", className)}>
      <Button type="button" variant={variant} size={size} onClick={() => onMove(-1)} disabled={disabled || isFirst} aria-label={upLabel}>
        <ArrowUp size={icon} aria-hidden="true" />
      </Button>
      <Button type="button" variant={variant} size={size} onClick={() => onMove(1)} disabled={disabled || isLast} aria-label={downLabel}>
        <ArrowDown size={icon} aria-hidden="true" />
      </Button>
    </div>
  );
}
