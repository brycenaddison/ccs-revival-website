/** Shared clipboard feedback for individual tournament codes and whole code sheets. */
import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { ACTION_QUIET_BASE } from "./admin/adminUi";

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
  const color = done ? "text-ccs-green" : "text-text-dim hover:text-text-bright";

  return (
    <button
      type="button"
      onClick={run}
      title={title}
      aria-label={title}
      className={
        label === undefined
          ? `inline-flex items-center shrink-0 cursor-pointer transition-colors ${color}`
          : `${ACTION_QUIET_BASE} transition-colors ${color}`
      }
    >
      <Shown size={label === undefined ? 13 : 12} aria-hidden="true" />
      {label}
    </button>
  );
}
