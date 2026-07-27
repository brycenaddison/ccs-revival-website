import { Link, useNavigate, useParams } from "react-router-dom";
import { TeamDetailPanel } from "../components/stats/TeamDetailPanel";

/**
 * A single team's page.
 *
 * This is the one place `/teams/:conf/:team` is used, and it's the endpoint's intended
 * purpose: comprehensive data for one team, fetched because a user asked for that team.
 * A team is identified by (conf, code) — codes are only unique within a conf.
 */
export default function TeamPage() {
  const { conf, code } = useParams<{ conf: string; code: string }>();
  const navigate = useNavigate();

  return (
    <div className="bg-bg min-h-screen w-full text-text font-body">
      <div className="bg-bg border-b border-bg2 px-4 py-3">
        <div className="max-w-[1200px] mx-auto">
          <Link to="/" className="text-accent font-heading text-xs tracking-wider uppercase no-underline hover:text-text-bright">
            &larr; CCS
          </Link>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-4 py-6">
        {conf && code ? (
          <TeamDetailPanel
            conf={conf}
            code={code}
            onSelectMatch={matchId => navigate(`/game/${encodeURIComponent(matchId)}`)}
          />
        ) : (
          <div className="text-center py-10 text-text-dim">No team specified.</div>
        )}
      </div>
    </div>
  );
}
