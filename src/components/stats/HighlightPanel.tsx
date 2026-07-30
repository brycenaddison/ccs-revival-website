/**
 * A panel of "who leads this" chips.
 *
 * Sits between the summary tiles (one number each) and the table (every number): the handful of rows
 * worth naming, at a size you can read without sorting anything.
 *
 * One number per chip, deliberately. The first version put three stats on a 10px line — `14g · 57% ·
 * 3.2 KDA` — which is the table's job done worse. A chip in the Most Picked panel is there to say how
 * many picks, so that is the number it says, and it says it large.
 */

interface PanelProps {
  title: string;
  /** A CSS var — `var(--accent)` for the primary panel, `var(--red)` for its counterpart. */
  titleColor?: string;
  emptyMessage?: string;
  children?: React.ReactNode;
  /** Set when there is nothing to show, so the panel renders its empty message instead of a bare box. */
  empty?: boolean;
  isMobile?: boolean;
}

export function HighlightPanel({
  title,
  titleColor = "var(--accent)",
  emptyMessage,
  children,
  empty,
  isMobile = false,
}: PanelProps) {
  return (
    <div className="bg-bg3 border border-border rounded-lg p-3.5">
      <div
        className="font-heading text-[11px] font-semibold tracking-wider uppercase mb-2.5"
        style={{ color: titleColor }}
      >
        {title}
      </div>
      {empty ? (
        <div className="text-[12px] text-text-dim py-6 text-center">{emptyMessage ?? "Nothing to show yet."}</div>
      ) : (
        // A fixed grid, not `flex-wrap` with `flex-1`: wrapping let the last row stretch its one or two
        // chips to double width, so six chips came out as four normal and two oversized.
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${isMobile ? 2 : 3}, minmax(0, 1fr))` }}>
          {children}
        </div>
      )}
    </div>
  );
}

interface ChipProps {
  /** Champion art or a team logo. Falls back to a colour block when absent. */
  img?: string;
  /** Fallback block colour when there is no image. */
  color?: string;
  name: string;
  /** The one number this chip is about, pre-formatted. */
  value: string;
  /** What the number counts — "picks", "bans". Rendered uppercase. */
  unit: string;
  /** A CSS var for the number. */
  valueColor?: string;
  /** Greys the artwork. Used for bans, where the champion is notable for *not* being played. */
  dim?: boolean;
}

export function HighlightChip({ img, color, name, value, unit, valueColor = "var(--text-bright)", dim }: ChipProps) {
  return (
    <div className="flex flex-col gap-1.5 bg-bg2 border border-border rounded-md px-3 py-2.5 min-w-0">
      <div className="flex items-center gap-2">
        {img ? (
          <img
            src={img}
            alt=""
            loading="lazy"
            decoding="async"
            className="w-10 h-10 rounded object-contain shrink-0"
            style={dim ? { filter: "grayscale(45%)" } : undefined}
          />
        ) : (
          <span className="w-10 h-10 rounded shrink-0" style={{ background: color ?? "var(--bg3)" }} />
        )}
        {/* Right-aligned against the chip edge, so the numbers form a column down the panel rather than
            starting at whatever offset the artwork leaves. */}
        <div className="min-w-0 ml-auto text-right">
          <div className="font-display text-[22px] leading-none" style={{ color: valueColor }}>{value}</div>
          <div className="text-[9px] text-text-muted font-heading tracking-wider uppercase mt-1">{unit}</div>
        </div>
      </div>
      <div className="text-[12px] font-heading font-bold text-text-bright truncate" title={name}>
        {name}
      </div>
    </div>
  );
}
