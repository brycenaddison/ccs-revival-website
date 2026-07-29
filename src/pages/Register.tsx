import { Link } from "react-router-dom";
import { useSeasonLink } from "../lib/leagueContext";

/**
 * Team registration is paused in the browser.
 *
 * The original form wrote applications straight to Supabase (plus a logo upload to Supabase
 * Storage) and there is no equivalent on the CCS API yet. The form itself is preserved at
 * `src/_disabled/RegisterForm.tsx`; restoring it needs `POST /applications`, a logo upload
 * endpoint, and a transactional approval flow — see the gap analysis.
 *
 * The route is kept rather than removed because the "JOIN CCS" button appears on every page.
 */
const DISCORD_INVITE = "https://discord.gg/ccs";

export default function Register() {
  const seasonLink = useSeasonLink();

  return (
    <div className="bg-bg min-h-screen text-text font-body">
      <div className="bg-bg2 border-b border-border">
        <div className="max-w-3xl mx-auto px-4 py-5">
          <Link to={seasonLink("/")} className="text-accent text-[11px] font-heading tracking-wider uppercase no-underline hover:text-text-bright">
            &larr; Back to CCS
          </Link>
          <h1 className="font-display text-[26px] text-text-bright tracking-widest mt-1">TEAM REGISTRATION</h1>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="bg-bg2 border border-border rounded-lg p-8 text-center">
          <div className="text-4xl mb-4">🛠️</div>
          <h2 className="font-display text-[20px] text-text-bright tracking-widest mb-3">
            SIGN-UPS ARE HANDLED ON DISCORD
          </h2>
          <p className="text-[14px] text-text-secondary font-body leading-relaxed mb-6 max-w-md mx-auto">
            Team registration has moved to the CCS Discord while the site migrates to the new league API.
            Drop into the server and a captain will get you set up.
          </p>
          <a
            href={DISCORD_INVITE}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-accent text-white rounded-md py-3 px-7 text-[13px] font-heading font-medium tracking-wider no-underline uppercase hover:opacity-90"
          >
            Open Discord
          </a>
        </div>
      </div>
    </div>
  );
}
