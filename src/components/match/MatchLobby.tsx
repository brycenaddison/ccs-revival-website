/**
 * The draft room and tournament codes for an eligible viewer. The API decides who sees each and
 * when, and serves them independently: either can be present without the other. Codes render in
 * their supplied order.
 */
import { useState } from "react";
import { ExternalLink, KeyRound } from "lucide-react";
import type { MatchCode } from "../../lib/api";
import { CopyAction } from "../CopyAction";
import { Button } from "@/components/ui/button";

export function MatchLobby({ codes, draftUrl }: { codes: readonly MatchCode[]; draftUrl: string | null }) {
  const [notice, setNotice] = useState<string | null>(null);
  if (codes.length === 0 && draftUrl === null) return null;

  return (
    <section aria-label="Match lobby" className="mb-6 rounded-lg border border-border bg-bg2 p-4 sm:p-5">
      <h2 className="flex items-center gap-2 font-heading text-lg font-semibold text-text-bright">
        <KeyRound size={20} aria-hidden="true" />
        Match lobby
      </h2>
      <p className="mt-1 text-sm text-text-secondary">
        {draftUrl !== null && codes.length > 0
          ? "Draft in the draft room, then copy your game's code to join the tournament lobby."
          : draftUrl !== null
            ? "Open the draft room to draft this series. Tournament codes appear here once they are created."
            : "Copy your game's code to join the tournament lobby."}
      </p>
      <ul className="mt-4 flex flex-col gap-2">
        {draftUrl !== null && (
          <li className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-border bg-bg2 p-3">
            <span className="font-heading text-sm font-semibold text-text-bright">Draft room</span>
            <span className="min-w-0 flex-1" />
            <CopyAction
              text={draftUrl}
              title="Copy draft room link"
              label="Copy link"
              message="Copied the draft room link."
              onReport={setNotice}
            />
            <Button asChild size="sm">
              <a href={draftUrl} target="_blank" rel="noreferrer">
                Open draft
                <ExternalLink size={13} aria-hidden="true" />
              </a>
            </Button>
          </li>
        )}
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
