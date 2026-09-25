import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

export function useEditorSize(size: "document" | "notes") {
  const [viewport, setViewport] = useState(() => window.visualViewport?.height ?? window.innerHeight);
  const [viewportTop, setViewportTop] = useState(() => window.visualViewport?.offsetTop ?? 0);
  const [chosen, setChosen] = useState<number | null>(null);
  const drag = useRef<{ y: number; height: number } | null>(null);
  useEffect(() => {
    const update = () => {
      setViewport(window.visualViewport?.height ?? window.innerHeight);
      setViewportTop(window.visualViewport?.offsetTop ?? 0);
    };
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, []);
  const max = Math.max(200, Math.round(viewport * 0.75));
  const preferred = Math.max(200, Math.min(size === "notes" ? 320 : 420, viewport * 0.55));
  const height = Math.round(Math.min(max, Math.max(200, chosen ?? preferred)));
  const resize = (value: number) => setChosen(Math.max(200, Math.min(max, value)));
  return {
    height, max, viewport, viewportTop, reset: () => setChosen(null),
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (event.button !== 0) return;
      drag.current = { y: event.clientY, height };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.focus();
      event.preventDefault();
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      if (drag.current) resize(drag.current.height + event.clientY - drag.current.y);
    },
    onPointerUp() { drag.current = null; },
    onKeyDown(event: KeyboardEvent<HTMLElement>) {
      if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      resize(event.key === "Home" ? 200 : event.key === "End" ? max : height + (event.key === "ArrowUp" ? -32 : 32));
    },
  };
}
