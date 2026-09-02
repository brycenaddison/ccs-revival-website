/**
 * A horizontal scroller that takes the window edge to edge when its content is wider than the column.
 *
 * The bracket's arrangement (`season/BracketPhaseView.tsx`), lifted out so the scoreboard can wear it:
 * a wide thing inside a page column would otherwise clip at the column's right margin and scroll
 * behind a strip of empty gutter. Instead the scroller grows negative margins equal to the page's side
 * gutters and puts them back *inside* as padding, so at rest the content lines up with the heading
 * above it, runs off the right of the screen, and scrolled all the way over lands under the column's
 * right edge. The gutters are spent on travel rather than on stationary bars.
 *
 * Measured off the frame, which stays where the page put it, so the observer cannot loop; the content
 * is measured too, so a board that fits its column stays in it and nothing breaks out. The native
 * scrollbar is hidden and `ScrollRail` draws one in the column, for the reason that file gives. Drag
 * to scroll comes from `useDragScroll`.
 *
 * The edges are the *scroll container's*, not the window's. `SiteLayout` scrolls the content in a
 * box under the nav, and that box's vertical scrollbar sits inside the window's width; measured
 * against `innerWidth`, or against the document, the breakout would run six pixels under the bar and
 * hand the container a horizontal scrollbar of its own. `clientWidth` on the scroller excludes its
 * bar. The lookup walks up to the nearest scrolling ancestor rather than naming the layout's box, so
 * the same arithmetic holds wherever this is mounted, the document element included.
 */

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useDragScroll } from "../../hooks/useDragScroll";
import { ScrollRail } from "../ScrollRail";

interface Gutters {
  left: number;
  right: number;
}

/** The nearest ancestor that scrolls vertically, else the document element. */
function scrollParentOf(el: HTMLElement): HTMLElement {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll") return node;
  }
  return document.documentElement;
}

export function FullBleedScroller({
  children,
  label = "Scroll horizontally",
  className,
}: {
  children: ReactNode;
  /** What the rail is for, for anyone who cannot see where it points. */
  label?: string;
  className?: string;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [gutters, setGutters] = useState<Gutters | null>(null);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const content = contentRef.current;
    if (!frame || !content) return;

    const measure = () => {
      const rect = frame.getBoundingClientRect();
      // The content's own width: the wrapper below is floored at the content's min-content width and
      // at the frame's, so when the content fits it is exactly as wide as the frame, which reads
      // here as "no wider than the frame".
      if (content.scrollWidth <= Math.ceil(rect.width)) {
        setGutters(null);
        return;
      }
      const scroller = scrollParentOf(frame);
      const edge = scroller.getBoundingClientRect().left;
      setGutters({
        left: Math.max(0, rect.left - edge),
        right: Math.max(0, edge + scroller.clientWidth - rect.right),
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  useDragScroll(scrollRef);

  const padL = gutters?.left ?? 0;
  const padR = gutters?.right ?? 0;

  return (
    <div ref={frameRef} className={className}>
      <div
        ref={scrollRef}
        className="overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={gutters ? { marginLeft: -padL, marginRight: -padR } : undefined}
      >
        {/* The gutters come back as padding on a content-sized wrapper, not on the scroll container:
            trailing padding on a scroll container is routinely dropped from the scrollable overflow.
            Sized to the content's *min*-content, floored at the container: content that can compact
            (the scoreboard's stat tracks) gets the chance to before it is scrolled, where a
            max-content wrapper handed it its widest layout and scrolled the rest. Content that must not
            compact keeps its own `min-w-max`, and then the two are the same width. */}
        <div className="w-min min-w-full" style={gutters ? { paddingLeft: padL, paddingRight: padR } : undefined}>
          <div ref={contentRef}>{children}</div>
        </div>
      </div>
      {gutters && <ScrollRail target={scrollRef} className="mt-3" label={label} />}
    </div>
  );
}
