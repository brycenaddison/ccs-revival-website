/**
 * `/scores`, its own page rather than a section of `Home`.
 *
 * It reads `GET /schedule` and nothing else, so mounting it inside `Home` made it wait on the whole
 * league load it has no use for — and put it behind `Home`'s "CCS IS BEING SET UP" gate, which fires on
 * an empty team list and would hide a perfectly good results page.
 */

import { useWindowSize } from "../hooks/useWindowSize";
import { PageShell } from "../components/layout/PageShell";
import { ScoresView } from "../components/views/ScoresView";

export default function Scores() {
  const isMobile = useWindowSize() < 768;

  return (
    <PageShell maxWidth={1440}>
      <ScoresView isMobile={isMobile} />
    </PageShell>
  );
}
