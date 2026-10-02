import { ExternalLink } from "lucide-react";
import type { OpggLinks } from "../lib/api";
import { TooltipHint } from "./TooltipHint";

/**
 * A team's OP.GG multisearch as a card-header link. Renders nothing when no starter has a known
 * Riot ID. `team` names the destination for assistive technology, since a page can carry one per side.
 */
export function OpggLink({ links, team }: { links: OpggLinks; team: string }) {
  if (!links.opggMultisearch) return null;

  const link = (
    <a
      href={links.opggMultisearch}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`View on OP.GG, ${team} starters`}
      className="flex shrink-0 items-center gap-1 font-heading text-[11px] text-brand no-underline hover:underline"
    >
      View on OP.GG <ExternalLink size={12} aria-hidden="true" />
    </a>
  );

  return links.opggComplete ? (
    link
  ) : (
    <TooltipHint content="Omits accounts whose Riot ID is unavailable.">{link}</TooltipHint>
  );
}
