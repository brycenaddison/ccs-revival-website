/**
 * The small draft annotations shared by the draft surfaces: the game page's Draft tab, the match
 * page's draft card and the staff schedule's draft results. Each renders nothing when it does not
 * apply.
 */
import { Badge } from "@/components/ui/badge";

/** Marks a champion picked before its opposing laner. False and null both render nothing. */
export function BlindTag({ blind }: { blind: boolean | null }) {
  if (blind !== true) return null;
  return <Badge variant="muted" className="px-1.5">Blind</Badge>;
}

/**
 * The side that took first pick. Callers pass `shown` only when the draft allowed first selection:
 * without it blue always picks first, so the chip would only restate the side.
 */
export function FirstPickTag({ shown }: { shown: boolean }) {
  if (!shown) return null;
  return <Badge variant="default" className="shrink-0 px-1.5">First pick</Badge>;
}
