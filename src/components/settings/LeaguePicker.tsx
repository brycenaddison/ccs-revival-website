/**
 * Which league you're administering.
 *
 * A native `<select>`, matching `league/SeasonPicker.tsx` — the repo has no Select primitive and one
 * native select is already the established answer for this shape of choice.
 *
 * Switching leagues navigates rather than setting state, because the conf is in the path. It keeps
 * the section you were on: an admin comparing the same setting across two leagues shouldn't be
 * bounced back to the first section each time. `replace` because switching is a correction to where
 * you are, not a step you'd want to walk back through.
 */

import { useNavigate } from "react-router-dom";
import type { AdminLeague } from "../../lib/api";

interface Props {
  leagues: AdminLeague[];
  conf: string;
  /** The section to stay on. Absent on the mobile section list, which has no section yet. */
  slug?: string;
}

export function LeaguePicker({ leagues, conf, slug }: Props) {
  const navigate = useNavigate();

  // One league is a label, not a choice. A single-option select is just a worse label.
  if (leagues.length <= 1) {
    return (
      <div className="font-heading text-xs tracking-wider uppercase text-text-secondary truncate">
        {leagues[0]?.name ?? conf}
      </div>
    );
  }

  return (
    <select
      value={conf}
      aria-label="League"
      onChange={e => navigate(`/league/${encodeURIComponent(e.target.value)}/admin${slug ? `/${slug}` : ""}`, { replace: true })}
      className="bg-bg2 border border-border rounded-md text-text font-body text-sm py-2 px-2 w-full focus:outline-none focus:border-accent"
    >
      {leagues.map(l => (
        <option key={l.conf} value={l.conf}>
          {l.name}
        </option>
      ))}
    </select>
  );
}
