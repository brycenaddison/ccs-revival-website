/**
 * A player's trophies, in the identity header.
 *
 * **Career-wide on purpose.** The league selector scopes every statistic on the page, and upstream
 * deliberately does not scope this — a Spring championship is still a Spring championship while you
 * are reading Summer's numbers. Filtering it here would quietly hide trophies; the league is named
 * on each pill instead, which is what makes the unscoped behavior legible rather than confusing.
 */

import { Trophy, Users } from "lucide-react";
import type { ProfileAccolade } from "../../lib/api";
import { useConfLabel } from "./profileUi";

export function AccoladeStrip({
  accolades,
  className = "",
}: {
  accolades: readonly ProfileAccolade[];
  /** Positioning is the caller's — this shares a row with the headline numbers. */
  className?: string;
}) {
  const confLabel = useConfLabel();
  if (accolades.length === 0) return null;

  return (
    <ul className={`flex flex-wrap gap-1.5 ${className}`}>
      {accolades.map(accolade => {
        const league = confLabel(accolade.conf).short;
        // A team accolade is won with four other people; the icon says so before the text does.
        const Icon = accolade.kind === "team" ? Users : Trophy;
        const detail = [accolade.label, accolade.team?.name, league].filter(Boolean).join(" · ");

        return (
          <li
            key={accolade.accoladeId}
            title={accolade.description ?? undefined}
            className="flex items-center gap-1.5 rounded-md border border-ccs-gold/40 bg-ccs-gold/10 px-2 py-1"
          >
            <Icon size={12} className="shrink-0 text-ccs-gold" aria-hidden="true" />
            <span className="font-heading text-[11px] tracking-wide text-text-bright">{accolade.name}</span>
            {detail && <span className="text-[10px] text-text-secondary">{detail}</span>}
          </li>
        );
      })}
    </ul>
  );
}
