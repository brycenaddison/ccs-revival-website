/** The API decides who can see these codes and when; render its supplied order unchanged. */
import { useState } from "react";
import { KeyRound } from "lucide-react";
import type { MatchCode } from "../../lib/api";
import { CopyAction } from "../CopyAction";

export function TournamentCodes({ codes }: { codes: readonly MatchCode[] }) {
  const [notice, setNotice] = useState<string | null>(null);
  if (codes.length === 0) return null;

  return (
    <section aria-label="Tournament codes" className="mb-6 rounded-lg border border-border bg-bg2 p-4 sm:p-5">
      <h2 className="flex items-center gap-2 font-heading text-lg font-semibold text-text-bright">
        <KeyRound size={20} aria-hidden="true" />
        Tournament codes
      </h2>
      <p className="mt-1 text-sm text-text-secondary">Copy your game&apos;s code to join the tournament lobby.</p>
      <ul className="mt-4 flex flex-col gap-2">
        {codes.map(entry => (
          <li key={entry.code} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-border bg-bg2 p-3">
            <span className="font-heading text-sm font-semibold text-text-bright">Game {entry.game}</span>
            {entry.matchId !== null && <span className="text-xs text-text-muted">Played</span>}
            <code className="min-w-0 basis-full select-all break-all font-mono text-sm text-text-bright sm:basis-auto sm:flex-1">
              {entry.code}
            </code>
            <CopyAction
              text={entry.code}
              title={`Copy Game ${entry.game} tournament code`}
              label="Copy code"
              message={`Copied the Game ${entry.game} code.`}
              onReport={setNotice}
            />
          </li>
        ))}
      </ul>
      <p role="status" className="mt-2 text-xs text-text-secondary">{notice}</p>
    </section>
  );
}
