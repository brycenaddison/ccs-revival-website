/**
 * Every game's draft in one card, bans and picks in the order they happened.
 *
 * The match payload's bans carry no turn order, so each game's sequence comes from its own
 * `GET /m/:matchId/draft` (the read the game page's Draft tab shares). A game without a draft, or
 * whose read is refused, is left out; with none at all the card does not render.
 *
 * Each champion is edged in its draft side's color. Those are the draft's sides, which need not be
 * the lobby's, so the game's line names which team drafted from each.
 */

import { Link } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import type { DraftSide, GameDraft, SeriesGame } from "../../lib/api";
import { useChampions } from "../../hooks/useChampions";
import { NO_BAN_CHAMPION, type ChampionLookup } from "../../lib/championData";
import { cn } from "../../lib/cn";
import { draftSequence, type DraftStep } from "../../lib/draftSequence";
import { gameTabPath } from "../../lib/game/tabs";
import { queries } from "../../lib/queries";
import { ChampionIcon } from "../ChampionIcon";
import { FirstPickTag } from "../drafts/DraftMarks";

export function SeriesDraftSummary({ games }: { games: readonly SeriesGame[] }) {
  const champions = useChampions();
  const played = games.filter((g): g is SeriesGame & { matchId: string } => g.matchId !== null);
  const drafts = useQueries({ queries: played.map(g => queries.gameDraft(g.matchId)) });
  const rows = played.flatMap((g, i) => {
    const draft = drafts[i]?.data;
    return draft ? [{ game: g.game, draft }] : [];
  });
  if (rows.length === 0) return null;

  return (
    <section className="mb-4 overflow-hidden rounded-lg border border-border bg-bg2">
      <h3 className="border-b border-border bg-bg3 px-4 py-3 font-display text-sm text-text-bright">Draft</h3>
      <ul className="divide-y divide-border">
        {rows.map(({ game, draft }) => <GameDraftRow key={draft.matchId} game={game} draft={draft} champions={champions} />)}
      </ul>
    </section>
  );
}

const SIDE_TEXT: Record<DraftSide, string> = { blue: "text-side-blue", red: "text-side-red" };
const SIDE_EDGE: Record<DraftSide, string> = { blue: "border-b-side-blue", red: "border-b-side-red" };

function GameDraftRow({ game, draft, champions }: { game: number; draft: GameDraft; champions: ChampionLookup | null }) {
  const steps = draftSequence(draft);
  // The four phases in order, each a run of steps of one kind.
  const phases = [
    { key: "bans1", label: "Bans", steps: steps.filter(s => s.kind === "ban" && s.phase === 1) },
    { key: "picks1", label: "Picks", steps: steps.filter(s => s.kind === "pick" && s.phase === 1) },
    { key: "bans2", label: "Bans", steps: steps.filter(s => s.kind === "ban" && s.phase === 2) },
    { key: "picks2", label: "Picks", steps: steps.filter(s => s.kind === "pick" && s.phase === 2) },
  ].filter(phase => phase.steps.length > 0);

  return (
    <li className="px-4 py-3">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-display text-sm text-text-bright">Game {game}</span>
        {draft.sides.map(side => (
          <span key={side.side} className="flex items-center gap-1.5 font-heading text-[11px] text-text-muted">
            <span>
              <span className={SIDE_TEXT[side.side]}>{side.side === "blue" ? "Blue draft" : "Red draft"}</span>
              {side.team && <span className="text-text-secondary"> {side.team.code}</span>}
            </span>
            <FirstPickTag shown={side.firstPick && draft.firstSelection === true} />
          </span>
        ))}
        <Link
          to={gameTabPath(draft.matchId, "draft")}
          className="ml-auto flex items-center gap-1 font-heading text-[11px] text-brand no-underline hover:underline"
        >
          Full draft <ArrowRight size={12} aria-hidden="true" />
        </Link>
      </div>
      <ol className="flex flex-wrap items-end gap-x-4 gap-y-2">
        {phases.map(phase => (
          <li key={phase.key} className="flex flex-col gap-1">
            <span className="font-heading text-[10px] text-text-dim">{phase.label}</span>
            <ol className="flex items-center gap-1">
              {phase.steps.map(step => <Step key={`${step.kind}-${step.entry.turn}`} step={step} champions={champions} />)}
            </ol>
          </li>
        ))}
      </ol>
    </li>
  );
}

function Step({ step, champions }: { step: DraftStep; champions: ChampionLookup | null }) {
  const side = step.side === "blue" ? "Blue" : "Red";
  if (step.kind === "ban") {
    const skipped = step.entry.championId === null;
    return (
      <li className={cn("border-b-2 pb-0.5", SIDE_EDGE[step.side])}>
        <ChampionIcon
          // A skipped ban keeps its slot; draw it with Riot's no-ban artwork.
          champion={step.entry.championId ?? NO_BAN_CHAMPION.key}
          src={step.entry.icon}
          lookup={champions}
          size={22}
          tile
          className="flex opacity-60"
          title={`${side} ban: ${skipped ? "skipped" : step.entry.champion ?? "unknown champion"}`}
        />
      </li>
    );
  }
  return (
    <li className={cn("border-b-2 pb-0.5", SIDE_EDGE[step.side])}>
      <ChampionIcon
        champion={step.entry.championId}
        src={step.entry.icon}
        name={step.entry.champion}
        lookup={champions}
        size={30}
        tile
        className="flex"
        title={`${side} pick: ${step.entry.champion ?? "unknown champion"}`}
      />
    </li>
  );
}
