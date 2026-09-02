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
      <div className="font-heading text-xs text-text-secondary truncate">
        {leagues[0]?.name ?? conf}
      </div>
    );
  }

  return (
    // The sidebar is 220px and a league is named like "CCS 2026 Summer Gold Division", so the
    // selected name does not fit and never will: `truncate` is what makes it end in an ellipsis
    // rather than mid-word, and `title` is where the whole name still is. The list the select opens
    // is browser UI sized to its own content, so every option reads in full there — which is the
    // half that matters when you are choosing. `season-select` is what keeps that popup dark, the
    // same as the season picker in the nav.
    <select
      value={conf}
      aria-label="League"
      title={leagues.find(l => l.conf === conf)?.name ?? conf}
      onChange={e => navigate(`/league/${encodeURIComponent(e.target.value)}/admin${slug ? `/${slug}` : ""}`, { replace: true })}
      className="season-select bg-bg2 border border-border rounded-md text-text font-body text-xs py-1.5 px-2 w-full truncate focus:outline-none focus:border-brand"
    >
      {leagues.map(l => (
        <option key={l.conf} value={l.conf}>
          {l.name}
        </option>
      ))}
    </select>
  );
}
