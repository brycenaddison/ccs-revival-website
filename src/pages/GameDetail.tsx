import { useNavigate, useParams } from "react-router-dom";
import { RiotMatchView } from "../components/match/RiotMatchView";

/** Full box score for a single game, straight from the stored Riot payload. */
export default function GameDetail() {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();

  return (
    <div className="bg-bg min-h-screen w-full text-text font-body">
      <div className="max-w-[1200px] mx-auto px-4 py-6">
        {matchId ? (
          <RiotMatchView matchId={matchId} onBack={() => navigate(-1)} />
        ) : (
          <div className="text-center py-10 text-text-dim">No game specified.</div>
        )}
      </div>
    </div>
  );
}
