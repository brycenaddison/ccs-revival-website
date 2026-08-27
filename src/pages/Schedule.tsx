/** `/schedule`, its own page for the same reason `/scores` is — see `Scores.tsx`. */

import { useWindowSize } from "../hooks/useWindowSize";
import { PageShell } from "../components/layout/PageShell";
import { ScheduleView } from "../components/views/ScheduleView";

export default function Schedule() {
  const isMobile = useWindowSize() < 768;

  return (
    <PageShell maxWidth={1440}>
      <ScheduleView isMobile={isMobile} />
    </PageShell>
  );
}
