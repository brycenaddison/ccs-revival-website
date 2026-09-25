import { useLayoutEffect, useRef, useState } from "react";

/** Restore keyboard focus after selection/cancel, including a list that just reached its cap. */
export function usePickerDisclosure() {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);
  useLayoutEffect(() => {
    if (wasOpen.current && !open) {
      if (trigger.current && !trigger.current.disabled) trigger.current.focus();
      else container.current?.focus();
    }
    wasOpen.current = open;
  }, [open]);
  return { open, setOpen, trigger, container };
}
