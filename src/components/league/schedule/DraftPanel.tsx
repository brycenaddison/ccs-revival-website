/**
 * One match's Drafter room: create it, share it, and import its results.
 *
 * A fixture holds at most one registration and the API cannot replace it. That is why labels are
 * checked here before the request, and why a failed, uncertain or mismatched room ends at a notice
 * rather than a retry button: a timeout may have created the room, and a second POST must never
 * create another. Site admins inspect those in Site Admin > Drafts.
 *
 * `gameAmount` is the schedule's resolved best-of, which is what the API compares it against.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, RefreshCw, Swords } from "lucide-react";
import { LABEL_CLASS } from "../../stats/FilterBar";
import { CopyAction } from "../../CopyAction";
import { ChampionIcon } from "../../ChampionIcon";
import { ErrorLine } from "../../admin/adminUi";
import { SettingsRow } from "../../settings/SettingsSection";
import { DraftGames } from "../../drafts/DraftGames";
import { DRAFT_MODE_LABEL, DRAFT_RECEIPT_LABEL, DRAFT_STATUS_LABEL, draftCodeText, draftErrorText } from "../../drafts/draftLabels";
import { useChampions } from "../../../hooks/useChampions";
import { useAdminAccess } from "../../../lib/adminAccess";
import { useAuth } from "../../../lib/authContext";
import { queries, queryRoots } from "../../../lib/queries";
import { fmtKickoff } from "../../../lib/utils";
import {
  createFixtureDraft,
  draftRefusal,
  recheckFixtureDraft,
  DRAFT_TEAM_NAME_MAX,
  type DraftGame,
  type DraftImport,
  type DraftSeries,
  type ScheduleMatch,
} from "../../../lib/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function DraftPanel({ match, onSaved }: { match: ScheduleMatch; onSaved: (message: string) => void }) {
  const { profile } = useAuth();
  const draft = useQuery(queries.fixtureDraft(match.id, profile?.id ?? null));

  return (
    <div className="mt-2.5 border-t border-border pt-2.5">
      <span className={LABEL_CLASS}>Draft room</span>
      {draft.isPending ? (
        <p role="status" className="mt-1 text-sm text-text-dim">Loading the draft room…</p>
      ) : draft.isError ? (
        <ErrorLine message={draftErrorText(draft.error)} />
      ) : draft.data.series === null ? (
        <CreateDraft match={match} onSaved={onSaved} />
      ) : (
        <Registration
          matchId={match.id}
          series={draft.data.series}
          fixtureMismatch={draft.data.fixtureMismatch}
          games={draft.data.games}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}

/** A room write moves the panel, the public preview's link and possibly the repair inbox. */
function useRefreshDrafts() {
  const qc = useQueryClient();
  return () => Promise.all([
    qc.invalidateQueries({ queryKey: queryRoots.schedule }),
    qc.invalidateQueries({ queryKey: queryRoots.drafts }),
  ]);
}

function labelError(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "") return "Enter a label.";
  if (trimmed.length > DRAFT_TEAM_NAME_MAX) return `Use ${DRAFT_TEAM_NAME_MAX} characters or fewer.`;
  return null;
}

function CreateDraft({ match, onSaved }: { match: ScheduleMatch; onSaved: (message: string) => void }) {
  const refresh = useRefreshDrafts();
  const [team1, setTeam1] = useState(match.teamA?.name ?? "");
  const [team2, setTeam2] = useState(match.teamB?.name ?? "");
  const [touched, setTouched] = useState(false);
  const create = useMutation({
    mutationFn: (gameAmount: number) =>
      createFixtureDraft(match.id, { team1Name: team1.trim(), team2Name: team2.trim(), gameAmount }),
    // An ambiguous failure may have created the room; only an explicit click may ask again.
    retry: false,
    onSuccess: async result => {
      await refresh();
      onSaved(result.created ? "Draft room created." : "This match already had that draft room.");
    },
    onError: async error => {
      // A conflict or uncertain outcome left a registration behind; show it instead of the form.
      const refusal = draftRefusal(error);
      if (refusal?.series || refusal?.uncertain) await refresh();
    },
  });

  const team1Error = touched ? labelError(team1) : null;
  const team2Error = touched ? labelError(team2) : null;
  const bestOf = match.bestOf;

  const submit = () => {
    setTouched(true);
    if (bestOf === null || labelError(team1) || labelError(team2)) return;
    create.mutate(bestOf);
  };

  return (
    <form
      className="mt-2 max-w-xl"
      onSubmit={event => {
        event.preventDefault();
        submit();
      }}
    >
      <SettingsRow label="Team 1 label" hint={`${match.teamA?.name ? "This match's first team." : "No team is assigned yet."} Shown in the draft room.`} error={team1Error}>
        {field => <Input {...field} value={team1} onChange={e => setTeam1(e.target.value)} />}
      </SettingsRow>
      <SettingsRow label="Team 2 label" hint={`${match.teamB?.name ? "This match's second team." : "No team is assigned yet."} Shown in the draft room.`} error={team2Error}>
        {field => <Input {...field} value={team2} onChange={e => setTeam2(e.target.value)} />}
      </SettingsRow>
      <p className="mb-3 text-xs text-text-dim">
        {bestOf === null
          ? "This match has no best-of, so a room cannot be created yet."
          : `Best of ${bestOf}. The room uses the site's current draft settings and cannot be replaced from here once created.`}
      </p>
      <Button type="submit" variant="outline" size="sm" disabled={create.isPending || bestOf === null}>
        <Swords size={13} aria-hidden="true" />
        {create.isPending ? "Creating…" : "Create draft room"}
      </Button>
      <ErrorLine message={create.isError ? draftErrorText(create.error) : null} />
    </form>
  );
}

function Registration({ matchId, series, fixtureMismatch, games, onSaved }: {
  matchId: number;
  series: DraftSeries;
  fixtureMismatch: boolean;
  games: readonly DraftGame[];
  onSaved: (message: string) => void;
}) {
  const refresh = useRefreshDrafts();
  const { isSiteAdmin } = useAdminAccess();
  const champions = useChampions();
  const [notice, setNotice] = useState<string | null>(null);
  const recheck = useMutation({
    mutationFn: () => recheckFixtureDraft(matchId),
    retry: false,
    onSuccess: async result => {
      await refresh();
      onSaved(describeImport(result));
    },
  });

  const ready = series.status === "ready";
  const recheckRefusal = draftRefusal(recheck.error);
  const inspect = isSiteAdmin
    ? <> Inspect it in <Link to="/admin/drafts" className="text-brand hover:underline">Site Admin &gt; Drafts</Link>.</>
    : " Ask a site admin to inspect it.";

  return (
    <div className="mt-2 flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={ready ? "default" : "muted"}>{series.status ? DRAFT_STATUS_LABEL[series.status] : "Unknown status"}</Badge>
        <span className="text-sm text-text-bright">{series.team1Name} vs {series.team2Name}</span>
        {series.gameAmount !== null && <span className="text-xs text-text-dim">Bo{series.gameAmount}</span>}
        {series.draftMode && <span className="text-xs text-text-dim">{DRAFT_MODE_LABEL[series.draftMode].label}</span>}
        {series.firstSelection !== null && (
          <span className="text-xs text-text-dim">First selection {series.firstSelection ? "on" : "off"}</span>
        )}
      </div>

      {series.disabledChampionIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-xs text-text-dim">Disabled:</span>
          {series.disabledChampionIds.map(id => <ChampionIcon key={id} champion={id} lookup={champions} size={18} />)}
        </div>
      )}

      {fixtureMismatch && (
        <Alert variant="warning">
          <AlertDescription>
            This match&apos;s teams, best-of or league changed after the room was created. Teams no longer
            see it and codes cannot be sent with it. The room cannot be replaced from here.{inspect}
          </AlertDescription>
        </Alert>
      )}
      {series.status === "creating" && (
        <Alert>
          <AlertDescription>Creation is in progress or was interrupted. Reload in a moment.{inspect}</AlertDescription>
        </Alert>
      )}
      {(series.status === "failed" || series.status === "uncertain" || series.status === null) && (
        <Alert variant="destructive">
          <AlertDescription>
            {series.status === "uncertain"
              ? "Drafter may have created this room, but the server could not confirm it."
              : "This room was not created."}
            {series.failureCategory && <> {draftCodeText(series.failureCategory)}</>}
            {" "}The room cannot be replaced from here.{inspect}
          </AlertDescription>
        </Alert>
      )}

      {ready && series.url && (
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <a href={series.url} target="_blank" rel="noreferrer">
              Open draft
              <ExternalLink size={13} aria-hidden="true" />
            </a>
          </Button>
          <CopyAction
            text={series.url}
            title="Copy draft room link"
            label="Copy link"
            message="Copied the draft room link."
            onReport={setNotice}
          />
          <Button type="button" variant="outline" size="sm" disabled={recheck.isPending} onClick={() => recheck.mutate()}>
            <RefreshCw size={13} aria-hidden="true" />
            {recheck.isPending ? "Checking…" : "Check for draft results"}
          </Button>
        </div>
      )}
      <p role="status" className="text-xs text-text-secondary">{notice}</p>
      <ErrorLine
        message={recheck.isError
          ? `${draftErrorText(recheck.error)}${recheckRefusal?.category === "fetch_cooldown" && series.nextFetchAt ? ` Next check after ${fmtKickoff(series.nextFetchAt)}.` : ""}`
          : null}
      />

      {ready && <DraftGames games={games} />}
    </div>
  );
}

function describeImport(result: DraftImport): string {
  if (result.state !== "processed") {
    return `Draft results were saved and are ${result.state ? DRAFT_RECEIPT_LABEL[result.state].toLowerCase() : "waiting"}.`;
  }
  const counts = result.outcome;
  if (!counts || counts.created + counts.updated === 0) return "Draft results checked. Nothing changed.";
  const parts = [
    counts.created > 0 ? `${counts.created} new ${counts.created === 1 ? "game" : "games"}` : null,
    counts.updated > 0 ? `${counts.updated} updated` : null,
  ].filter(Boolean);
  return `Draft results imported: ${parts.join(", ")}.`;
}
