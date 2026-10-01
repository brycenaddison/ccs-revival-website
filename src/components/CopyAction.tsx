/** Shared clipboard feedback for individual tournament codes and whole code sheets. */
import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TooltipHint } from "./TooltipHint";

export function CopyAction({
  text,
  title,
  message,
  icon: Icon = Copy,
  label,
  onReport,
}: {
  text: string;
  title: string;
  message: string;
  icon?: typeof Copy;
  label?: string;
  onReport: (message: string) => void;
}) {
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 1500);
    return () => clearTimeout(t);
  }, [done]);

  const run = () => {
    const clip = navigator.clipboard;
    if (!clip) {
      onReport("This browser won't give up the clipboard here — select the text and copy it by hand.");
      return;
    }
    void clip.writeText(text).then(
      () => {
        setDone(true);
        onReport(message);
      },
      () => onReport("Couldn't reach the clipboard, so nothing was copied. Select the text by hand."),
    );
  };

  const Shown = done ? Check : Icon;

  // The icon-only form names itself through a tooltip as well as its label, so a sighted reader can
  // tell which code it copies before pressing it.
  const button = (
    <Button
      type="button"
      variant="quiet"
      size="inline"
      onClick={run}
      aria-label={title}
      className={`shrink-0 ${done ? "text-ccs-green hover:text-ccs-green" : ""}`}
    >
      <Shown size={label === undefined ? 13 : 12} aria-hidden="true" />
      {label}
    </Button>
  );

  return label !== undefined ? button : <TooltipHint content={title}>{button}</TooltipHint>;
}
