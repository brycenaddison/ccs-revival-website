/**
 * Grab-and-drag panning for a horizontally scrolling element.
 *
 * A wide bracket is the case a scrollbar serves worst: a trackpad user has two-finger swipe and a
 * touch user has the real thing, but a mouse user has a wheel that scrolls the *page* and a 15px bar
 * at the bottom of a 700px-tall canvas. Dragging the thing itself is the obvious gesture, and it is
 * the one every map on the web has trained people to try.
 *
 * Mouse only. Touch and pen already pan natively, and claiming their pointer events would replace a
 * gesture that works — with momentum, rubber-banding and all — with one that does not.
 *
 * Three details are what separate this from a scroll-on-mousemove one-liner:
 *
 *  - **Interactive targets are left alone.** A drag starting on a link, a button or a `<select>`
 *    belongs to that control. Anything else is fair game, which is most of a bracket card.
 *  - **A few pixels of slack before it counts as a drag**, so an ordinary click still lands. Pointer
 *    capture is taken at that moment and not before, which is also what lets the pointer leave the
 *    element mid-drag without the pan stopping dead.
 *  - **The click after a drag is swallowed.** Releasing over a team name should not navigate to that
 *    team. The flag clears on the next press, so a drag that ended off-element can't eat a later
 *    click that had nothing to do with it.
 */

import { useEffect, type RefObject } from "react";

/** A press starting inside one of these belongs to the control, not to the canvas. */
const INTERACTIVE = "a, button, select, input, textarea, label, [role='button']";

/** How far the pointer travels before this stops being a click and starts being a drag. */
const SLACK = 4;

export function useDragScroll(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let pointer: number | null = null;
    let originX = 0;
    let originScroll = 0;
    let panning = false;
    let swallowClick = false;

    /** `grab` only while there is somewhere to go, so the cursor never promises a pan that won't. */
    const syncCursor = () => {
      el.style.cursor = el.scrollWidth > el.clientWidth ? "grab" : "";
    };

    const release = () => {
      if (pointer !== null && el.hasPointerCapture(pointer)) el.releasePointerCapture(pointer);
      pointer = null;
      panning = false;
      el.style.userSelect = "";
      syncCursor();
    };

    const onDown = (e: PointerEvent) => {
      // Cleared here rather than after the click: a drag released outside the element never produces
      // one, and a flag left set would eat the next unrelated click instead.
      swallowClick = false;
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      if (el.scrollWidth <= el.clientWidth) return;
      if (e.target instanceof Element && e.target.closest(INTERACTIVE)) return;

      pointer = e.pointerId;
      originX = e.clientX;
      originScroll = el.scrollLeft;
    };

    const onMove = (e: PointerEvent) => {
      if (pointer !== e.pointerId) return;
      const dx = e.clientX - originX;

      if (!panning) {
        if (Math.abs(dx) < SLACK) return;
        panning = true;
        el.setPointerCapture(pointer);
        el.style.cursor = "grabbing";
        // Without this the drag selects every team name it passes over.
        el.style.userSelect = "none";
      }

      el.scrollLeft = originScroll - dx;
    };

    const onUp = (e: PointerEvent) => {
      if (pointer !== e.pointerId) return;
      swallowClick = panning;
      release();
    };

    const onClick = (e: MouseEvent) => {
      if (!swallowClick) return;
      swallowClick = false;
      e.stopPropagation();
      e.preventDefault();
    };

    syncCursor();
    // The element resizing covers a window resize; its child covers the canvas being laid out or
    // re-measured, which does not change this element's own box.
    const observer = new ResizeObserver(syncCursor);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("click", onClick, true);

    return () => {
      observer.disconnect();
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("click", onClick, true);
      release();
    };
  }, [ref]);
}
