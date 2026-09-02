/** The landing tab: the scoreboard, then the full stat table beneath it. */

import { Scoreboard } from "./Scoreboard";
import { StatTable } from "./StatTable";

export function ScoreboardTab() {
  return (
    <>
      <Scoreboard />
      <StatTable />
    </>
  );
}
