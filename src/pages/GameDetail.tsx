import { useParams } from "react-router-dom";
import { RiotMatchView } from "../components/match/RiotMatchView";
import { useBackNavigation } from "../hooks/useGoBack";

/** Full box score for a single game, straight from the stored Riot payload. */
export default function GameDetail() {
  const { matchId } = useParams<{ matchId: string }>();
  const { goBack, isFallback } = useBackNavigation("/");

  return (
    <div className="bg-bg min-h-screen w-full text-text font-body">
      <div className="max-w-[1200px] mx-auto px-4 py-6">
        {matchId ? (
          <RiotMatchView
            matchId={matchId}
            onBack={goBack}
            backLabel={isFallback ? "Home" : "Back"}
          />
        ) : (
          <div className="text-center py-10 text-text-dim">No game specified.</div>
        )}
      </div>
    </div>
  );
}
