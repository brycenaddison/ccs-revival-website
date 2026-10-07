/**
 * The match viewer's tab strip.
 *
 * `UnderlineTabs` in link mode, because each tab is a URL (`lib/game/tabs.ts`). Real navigation uses
 * `<Link>` with `aria-current`, per `AGENTS.md`. `replace` so one Back press leaves the viewer rather
 * than walking back through its tabs.
 */

import { UnderlineTabs } from "../UnderlineTabs";
import { GAME_TABS, gameTabPath, type GameTab } from "../../lib/game/tabs";

export function GameTabs({ matchId, tab, hasDraft }: { matchId: string; tab: GameTab; hasDraft: boolean }) {
  return (
    <UnderlineTabs
      label="Game views"
      replace
      tabs={GAME_TABS
        // A draft link that is open stays listed, so the selected tab is never missing from the strip.
        .filter(t => !t.needsDraft || hasDraft || tab === t.slug)
        .map(t => ({ key: t.slug, label: t.label, to: gameTabPath(matchId, t.slug) }))}
      selected={tab}
    />
  );
}
