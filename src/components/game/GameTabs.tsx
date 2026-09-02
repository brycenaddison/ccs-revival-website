/**
 * The match viewer's tab strip.
 *
 * The same visual language as `MatchDetail`'s Preview / Results strip (underline rail, the selected
 * tab filled), but built from `<Link>`s with `aria-current` rather than buttons and state, because
 * each tab is a URL (`lib/game/tabs.ts`). Real navigation uses `<Link>`, per `CLAUDE.md`.
 */

import { Link } from "react-router-dom";
import { GAME_TABS, gameTabPath, type GameTab } from "../../lib/game/tabs";

export function GameTabs({ matchId, tab }: { matchId: string; tab: GameTab }) {
  return (
    <nav
      aria-label="Game views"
      className="mb-4 flex flex-nowrap overflow-x-auto overflow-y-hidden border-b-2 border-brand"
    >
      {GAME_TABS.map(t => {
        const active = t.slug === tab;
        return (
          <Link
            key={t.slug}
            to={gameTabPath(matchId, t.slug)}
            replace
            aria-current={active ? "page" : undefined}
            className={`shrink-0 px-4 py-2.5 font-heading text-[13px] no-underline ${
              active
                ? "border-b-2 border-b-brand bg-bg-input text-text-bright"
                : "border-b-2 border-b-transparent text-text-muted hover:text-text-bright"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
