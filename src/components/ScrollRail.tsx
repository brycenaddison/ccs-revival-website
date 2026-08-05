/**
 * A horizontal scrollbar for an element, drawn where you want it rather than where the browser puts
 * it.
 *
 * **Why this exists at all.** A native horizontal scrollbar is painted at the foot of its container's
 * padding box and spans the whole of it — padding does not inset it, and nothing in CSS does. That is
 * fine until the container is deliberately wider than the content it holds, which is exactly the
 * bracket's arrangement: the scroller takes the whole window so the bracket can travel through the
 * page's side margins, and a bar spanning the window then sits under two inches of empty space at
 * each end. Hiding the native one and rendering this inside the content column is the only way to
 * have both.
 *
 * The trade is real: hiding a native control means reimplementing it. So this is a full control, not
 * a decoration — thumb drag, click-to-jump on the track, arrow/page/home/end keys, and the ARIA a
 * screen reader needs to treat it as the scrollbar it is. It also disappears entirely when there is
 * nothing to scroll, which the native one does too.
 *
 * Only the presentation moves. The element still scrolls natively — wheel, trackpad, touch, keyboard
 * focus, and `useDragScroll` — and this reads that state rather than owning it.
 */

import { useCallback, useEffect, useId, useRef, useState, type PointerEvent, type RefObject } from "react";

interface Metrics {
  /** Visible fraction of the scrollable width, so also the thumb's width as a fraction of the track. */
  span: number;
  /** How far through the scroll we are, 0 to 1. */
  progress: number;
}

const clamp = (n: number): number => Math.min(1, Math.max(0, n));

export function ScrollRail({
  target,
  className = "",
  label = "Scroll horizontally",
}: {
  target: RefObject<HTMLElement | null>;
  className?: string;
  /** What the control is for, for anyone who cannot see where it points. */
  label?: string;
}) {
  const [{ span, progress }, setMetrics] = useState<Metrics>({ span: 1, progress: 0 });
  const trackRef = useRef<HTMLDivElement>(null);
  const controls = useId();

  const read = useCallback(() => {
    const el = target.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setMetrics({
      span: el.scrollWidth > 0 ? clamp(el.clientWidth / el.scrollWidth) : 1,
      progress: max > 0 ? clamp(el.scrollLeft / max) : 0,
    });
  }, [target]);

  useEffect(() => {
    const el = target.current;
    if (!el) return;

    // `role="scrollbar"` is meaningless without something to point at, and the caller owns the
    // element — so borrow its id, or lend it one.
    if (!el.id) el.id = controls;

    read();
    el.addEventListener("scroll", read, { passive: true });
    // The element resizing covers a window resize; its child covers the content being laid out or
    // re-measured, which does not change the element's own box but does change what it can scroll.
    const observer = new ResizeObserver(read);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);

    return () => {
      el.removeEventListener("scroll", read);
      observer.disconnect();
    };
  }, [target, read, controls]);

  /** Where the scroll would have to be for the thumb's left edge to sit at `fraction` of its travel. */
  const scrollTo = (fraction: number) => {
    const el = target.current;
    if (!el) return;
    el.scrollLeft = clamp(fraction) * (el.scrollWidth - el.clientWidth);
  };

  const nudge = (by: number) => {
    const el = target.current;
    if (el) el.scrollLeft += by;
  };

  const onThumbDown = (e: PointerEvent<HTMLDivElement>) => {
    const el = target.current;
    const track = trackRef.current;
    if (!el || !track || e.button !== 0) return;

    const travel = track.clientWidth * (1 - span);
    const max = el.scrollWidth - el.clientWidth;
    if (travel <= 0 || max <= 0) return;

    // The pointer is captured on the thumb, so the drag survives leaving the rail — which matters
    // here more than most places, because the rail is eight pixels tall.
    const thumb = e.currentTarget;
    const originX = e.clientX;
    const originScroll = el.scrollLeft;
    thumb.setPointerCapture(e.pointerId);
    e.preventDefault();

    const move = (ev: globalThis.PointerEvent) => {
      el.scrollLeft = originScroll + ((ev.clientX - originX) / travel) * max;
    };
    const up = () => {
      thumb.removeEventListener("pointermove", move);
      thumb.removeEventListener("pointerup", up);
      thumb.removeEventListener("pointercancel", up);
    };
    thumb.addEventListener("pointermove", move);
    thumb.addEventListener("pointerup", up);
    thumb.addEventListener("pointercancel", up);
  };

  /** A press on the bare track jumps, centring the thumb where you clicked. */
  const onTrackDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || e.button !== 0) return;
    const track = trackRef.current;
    if (!track) return;

    const rect = track.getBoundingClientRect();
    const travel = rect.width * (1 - span);
    if (travel <= 0) return;
    scrollTo((e.clientX - rect.left - (span * rect.width) / 2) / travel);
  };

  // Nothing to scroll, nothing to show — the same thing the native bar does.
  if (span >= 1) return null;

  return (
    <div
      ref={trackRef}
      role="scrollbar"
      aria-orientation="horizontal"
      aria-controls={target.current?.id || controls}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      tabIndex={0}
      onPointerDown={onTrackDown}
      onKeyDown={e => {
        // A page is most of a screenful, keeping a column or so of overlap for orientation — the
        // same thing a native scrollbar's track click does.
        const page = (target.current?.clientWidth ?? 0) * 0.9;
        const step =
          e.key === "ArrowLeft" ? -60
          : e.key === "ArrowRight" ? 60
          : e.key === "PageUp" ? -page
          : e.key === "PageDown" ? page
          : 0;
        if (step !== 0) {
          e.preventDefault();
          nudge(step);
        } else if (e.key === "Home" || e.key === "End") {
          e.preventDefault();
          scrollTo(e.key === "Home" ? 0 : 1);
        }
      }}
      className={`relative h-2 cursor-pointer rounded-full bg-bg3 outline-offset-2 ${className}`}
    >
      <div
        onPointerDown={onThumbDown}
        // `left` as a percentage of the track, and the thumb is `span` of it — so the furthest left
        // it can sit is `1 - span`, which is what makes the two ends land exactly on the ends.
        style={{ width: `${span * 100}%`, left: `${progress * (1 - span) * 100}%` }}
        className="absolute top-0 h-2 min-w-8 rounded-full bg-border2 transition-colors hover:bg-text-dim"
      />
    </div>
  );
}
