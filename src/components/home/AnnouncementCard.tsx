/**
 * The banner, rendered as a post at the top of the home page's center column.
 *
 * A card rather than a full-width strip across every page: these are league notices — signups
 * opening, a playoff date — and they read as content, not as a system alert bar. The center column
 * is where a reader's eye lands, and it already had a slot.
 *
 * **`null` falls back to the welcome block**, which is the markup that occupied this slot before
 * banners existed. The column should never have a hole in it, and "no announcement" is the normal
 * state most weeks.
 *
 * Not `role="alert"`. This is standing page content, not a live region — an alert role would make
 * a screen reader interrupt and announce it on every single home page visit.
 */

import { ArrowRight } from "lucide-react";
import type { Announcement, AnnouncementLevel } from "../../lib/api";

interface Props {
  announcement: Announcement | null;
  /** For the fallback block's subtitle. */
  teamCount: number;
  splitName?: string;
  isMobile: boolean;
}

/**
 * How each level is toned.
 *
 * `info` deliberately gets the accent, not a neutral border: the common case is a routine notice
 * and it still has to look like the most important thing in the column. Warning and critical
 * escalate from there, and both stay inside the theme tokens so they carry on either background.
 */
const TONES: Record<AnnouncementLevel, { border: string; label: string; text: string }> = {
  info: { border: "border-brand/60", label: "text-brand", text: "Announcement" },
  warning: { border: "border-ccs-gold/60", label: "text-ccs-gold", text: "Heads up" },
  critical: { border: "border-ccs-red", label: "text-ccs-red", text: "Important" },
};

export function AnnouncementCard({ announcement, teamCount, splitName, isMobile }: Props) {
  if (announcement === null) {
    return (
      <div
        className="rounded-lg relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, var(--accent), var(--dark-red, #3f0008))",
          padding: isMobile ? "14px 12px" : "16px 20px",
        }}
      >
        <div className="relative flex items-center gap-3">
          <span className="text-lg">⚔️</span>
          <div>
            <h2
              className="font-display text-white "
              style={{ fontSize: isMobile ? 16 : 18 }}
            >
              WELCOME TO CCS
            </h2>
            <p className="text-white/70 text-xs">
              {teamCount} teams · {splitName || "Season starting soon"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const tone = TONES[announcement.level];
  const label = announcement.linkLabel ?? "Learn more";

  return (
    <div className={`bg-bg2 rounded-lg border-l-[3px] border-y border-r border-border ${tone.border}`}>
      <div style={{ padding: isMobile ? "14px 14px" : "18px 20px" }}>
        <span
          className={`block font-heading text-[10px] mb-2 ${tone.label}`}
        >
          {tone.text}
        </span>

        {/* Preserves the newlines an admin typed into the textarea. Not markdown: a banner is one
            or two sentences, and the editor for it is a plain box. */}
        <p
          className="text-text leading-relaxed whitespace-pre-wrap m-0"
          style={{ fontSize: isMobile ? 14 : 15 }}
        >
          {announcement.message}
        </p>

        {announcement.linkUrl && (
          <a
            href={announcement.linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 mt-3.5 rounded-md border border-border px-3 py-1.5 font-heading text-xs text-text-bright no-underline hover:border-brand transition-colors"
          >
            {label}
            <ArrowRight size={13} />
          </a>
        )}
      </div>
    </div>
  );
}
