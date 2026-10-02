/**
 * League Admin > Predictions > Custom: publish a league question of your own, with 2 to 16
 * outcomes. Each outcome can reference one of this league's teams or one player profile, which
 * public pages link to; the label is what readers pick.
 *
 * The local checks mirror the publication route's rules (lengths, labels unique after trimming and
 * collapsing whitespace ignoring case, no repeated reference, a future deadline within 370 days)
 * so mistakes surface before the confirmation. They are guidance; the API's answer is the authority
 * and renders verbatim. Teams join by team ID, never by name.
 *
 * The request ID is a command identity: an uncertain failure (network, 5xx) keeps it and locks the
 * form so "Retry" repeats the same command, which the API answers with the same market. A 4xx is a
 * definite answer and drops it. Published markets cannot be edited; staff void and publish again.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmButton } from "../../ConfirmButton";
import { DateTimePicker } from "../../DateTimePicker";
import { TooltipHint } from "../../TooltipHint";
import { ErrorLine } from "../../admin/adminUi";
import { PlayerSlot } from "../../players/PlayerSlot";
import type { PickedPlayer } from "../../players/PlayerIdentity";
import { predictionPath } from "../../predictions/PredictionCard";
import { predictionErrorText } from "../../predictions/predictionLabels";
import { SettingsRow } from "../../settings/SettingsSection";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  ApiError,
  CUSTOM_DEADLINE_DAYS,
  CUSTOM_DETAILS_MAX,
  CUSTOM_LABEL_MAX,
  CUSTOM_OUTCOMES_MAX,
  CUSTOM_OUTCOMES_MIN,
  CUSTOM_TITLE_MAX,
  errorMessage,
  publishCustomPrediction,
  type CustomPredictionInput,
} from "../../../lib/api";
import { queries, queryRoots } from "../../../lib/queries";

type OutcomeLink = "none" | "team" | "player";
interface OutcomeDraft {
  /** Local row identity, so removing a row keeps the others' inputs. */
  key: string;
  label: string;
  link: OutcomeLink;
  teamId: number | null;
  player: PickedPlayer | null;
}

const LINK_LABEL: Record<OutcomeLink, string> = { none: "No link", team: "Team", player: "Player" };
const DAY = 86_400_000;

const blankOutcome = (): OutcomeDraft => ({ key: crypto.randomUUID(), label: "", link: "none", teamId: null, player: null });
const blankOutcomes = () => Array.from({ length: CUSTOM_OUTCOMES_MIN }, blankOutcome);
/** The API's label comparison: trimmed, whitespace collapsed, case ignored. */
const normalize = (label: string) => label.trim().replace(/\s+/g, " ");

interface Problems {
  title: string | null;
  details: string | null;
  deadline: string | null;
  outcomes: (string | null)[];
  /** Missing required input, which disables publishing without an error message. */
  incomplete: boolean;
}

function check(title: string, details: string, closesAt: string | null, outcomes: readonly OutcomeDraft[]): Problems {
  const now = Date.now(), deadline = closesAt ? Date.parse(closesAt) : NaN;
  const labels = outcomes.map(outcome => normalize(outcome.label).toLowerCase());
  const refOf = (outcome: OutcomeDraft) =>
    outcome.link === "team" && outcome.teamId !== null ? `team:${outcome.teamId}`
      : outcome.link === "player" && outcome.player ? `player:${outcome.player.profileId}` : null;
  const refs = outcomes.map(refOf);
  return {
    title: normalize(title).length > CUSTOM_TITLE_MAX ? `Keep the question to ${CUSTOM_TITLE_MAX} characters.` : null,
    details: details.trim().length > CUSTOM_DETAILS_MAX ? `Keep the details to ${CUSTOM_DETAILS_MAX} characters.` : null,
    deadline: !Number.isFinite(deadline) ? null
      : deadline <= now ? "Choose a deadline in the future."
      : deadline > now + CUSTOM_DEADLINE_DAYS * DAY ? `Choose a deadline within ${CUSTOM_DEADLINE_DAYS} days.`
      : null,
    outcomes: outcomes.map((outcome, index) => {
      const label = labels[index], ref = refs[index];
      if (label.length > CUSTOM_LABEL_MAX) return `Keep each label to ${CUSTOM_LABEL_MAX} characters.`;
      if (label && labels.indexOf(label) !== index) return "Another outcome already has this label.";
      if (ref && refs.indexOf(ref) !== index) return `Another outcome already links this ${outcome.link === "team" ? "team" : "player"}.`;
      return null;
    }),
    incomplete: !normalize(title) || closesAt === null || labels.some(label => !label)
      || outcomes.some(outcome => (outcome.link === "team" && outcome.teamId === null) || (outcome.link === "player" && !outcome.player)),
  };
}

export function CustomMarketPanel({ conf, readOnly = false }: {
  conf: string;
  /** A hidden league: publication needs a listed one, so every field is disabled. */
  readOnly?: boolean;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const teams = useQuery(queries.teamsForConf(conf));
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [closesAt, setClosesAt] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<OutcomeDraft[]>(blankOutcomes);
  const [attempt, setAttempt] = useState<CustomPredictionInput | null>(null);

  const problems = check(title, details, closesAt, outcomes);
  const invalid = problems.incomplete || !!problems.title || !!problems.details || !!problems.deadline || problems.outcomes.some(Boolean);
  const locked = readOnly || attempt !== null;

  const publishing = useMutation({
    mutationFn: (next: CustomPredictionInput) => publishCustomPrediction(conf, next),
    onSuccess: async ({ eventId }) => {
      setAttempt(null);
      setTitle(""); setDetails(""); setClosesAt(null); setOutcomes(blankOutcomes());
      await qc.invalidateQueries({ queryKey: queryRoots.predictions });
      toast.success("Prediction published.", eventId === null ? undefined : {
        action: { label: "View", onClick: () => navigate(predictionPath(eventId)) },
      });
    },
    onError: async error => {
      if (!(error instanceof ApiError) || error.status >= 500) return;
      setAttempt(null);
      if (error.status === 409) await qc.invalidateQueries({ queryKey: queryRoots.predictions });
    },
  });

  const publish = () => {
    if (publishing.isPending) return;
    const next = attempt ?? {
      requestId: crypto.randomUUID(),
      title: normalize(title),
      details: details.trim() || null,
      closesAt: closesAt!,
      outcomes: outcomes.map(outcome => ({
        label: normalize(outcome.label),
        teamId: outcome.link === "team" ? outcome.teamId : null,
        profileId: outcome.link === "player" ? outcome.player?.profileId ?? null : null,
      })),
    };
    setAttempt(next);
    publishing.mutate(next);
  };

  const update = (key: string, patch: Partial<OutcomeDraft>) =>
    setOutcomes(current => current.map(outcome => outcome.key === key ? { ...outcome, ...patch } : outcome));
  const placedPlayers = (key: string) => new Set(outcomes.flatMap(outcome =>
    outcome.key !== key && outcome.link === "player" && outcome.player ? [outcome.player.profileId] : []));

  return (
    <div className="max-w-2xl">
      <SettingsRow label="Question" error={problems.title}>
        {field => (
          <Input {...field} value={title} disabled={locked} maxLength={CUSTOM_TITLE_MAX}
            onChange={e => setTitle(e.target.value)} placeholder="Who lifts the split trophy?" />
        )}
      </SettingsRow>
      <SettingsRow label="Details" hint="Optional. Plain text, shown under the question." error={problems.details}>
        {field => (
          <Textarea {...field} className="min-h-20" value={details} disabled={locked} maxLength={CUSTOM_DETAILS_MAX}
            onChange={e => setDetails(e.target.value)} />
        )}
      </SettingsRow>
      <SettingsRow label="Deadline" hint="Predictions close then. League admins resolve it afterward." error={problems.deadline}>
        {field => <DateTimePicker {...field} value={closesAt} onChange={setClosesAt} disabled={locked} />}
      </SettingsRow>

      <fieldset className="mb-5">
        <legend className="mb-2 font-heading text-sm text-text-bright">Outcomes</legend>
        {teams.error && <ErrorLine message={errorMessage(teams.error)} />}
        <ol className="space-y-3">
          {outcomes.map((outcome, index) => {
            const n = index + 1, error = problems.outcomes[index], errorId = `custom-outcome-${outcome.key}-error`;
            return (
              <li key={outcome.key} className="rounded-md border border-border p-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Input
                    className="min-w-40 flex-1"
                    aria-label={`Outcome ${n} label`}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId : undefined}
                    value={outcome.label}
                    disabled={locked}
                    maxLength={CUSTOM_LABEL_MAX}
                    placeholder={`Outcome ${n}`}
                    onChange={e => update(outcome.key, { label: e.target.value })}
                  />
                  <NativeSelect
                    containerClassName="w-32"
                    aria-label={`Outcome ${n} link`}
                    value={outcome.link}
                    disabled={locked}
                    onChange={e => update(outcome.key, { link: e.target.value as OutcomeLink })}
                  >
                    {(Object.keys(LINK_LABEL) as OutcomeLink[]).map(link => (
                      <NativeSelectOption key={link} value={link}>{LINK_LABEL[link]}</NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <TooltipHint content={`Remove outcome ${n}`}>
                    <Button variant="outline" size="icon" type="button" aria-label={`Remove outcome ${n}`}
                      disabled={locked || outcomes.length <= CUSTOM_OUTCOMES_MIN}
                      onClick={() => setOutcomes(current => current.filter(row => row.key !== outcome.key))}>
                      <Trash2 size={14} aria-hidden="true" />
                    </Button>
                  </TooltipHint>
                </div>
                {outcome.link === "team" && (
                  <NativeSelect
                    containerClassName="mt-2"
                    aria-label={`Outcome ${n} team`}
                    value={outcome.teamId ?? ""}
                    disabled={locked || teams.isPending}
                    onChange={e => update(outcome.key, { teamId: e.target.value ? Number(e.target.value) : null })}
                  >
                    <NativeSelectOption value="">{teams.isPending ? "Loading teams…" : "Choose a team"}</NativeSelectOption>
                    {(teams.data ?? []).map(team => (
                      <NativeSelectOption key={team.id} value={team.id}>{team.name}</NativeSelectOption>
                    ))}
                  </NativeSelect>
                )}
                {outcome.link === "player" && (
                  <div className="mt-2">
                    <PlayerSlot
                      mode="profile"
                      label={`Outcome ${n} player`}
                      value={outcome.player}
                      placed={placedPlayers(outcome.key)}
                      placedText="already an outcome"
                      editable={!locked}
                      onChange={player => update(outcome.key, { player })}
                    />
                  </div>
                )}
                {error && <FieldError id={errorId} className="mt-1.5">{error}</FieldError>}
              </li>
            );
          })}
        </ol>
        <Button variant="outline" size="sm" type="button" className="mt-3"
          disabled={locked || outcomes.length >= CUSTOM_OUTCOMES_MAX}
          onClick={() => setOutcomes(current => [...current, blankOutcome()])}>
          <Plus size={14} aria-hidden="true" /> Add outcome
        </Button>
        <p className="mt-1.5 text-xs text-text-dim">{CUSTOM_OUTCOMES_MIN} to {CUSTOM_OUTCOMES_MAX} outcomes, each with a unique label.</p>
      </fieldset>

      {!readOnly && <ConfirmButton
        title={attempt ? "Retry this publication?" : "Publish this prediction?"}
        description={<>
          <span className="text-text-bright">{normalize(title)}</span> opens for predictions now, with {outcomes.length} outcomes.
          {" "}It cannot be edited after publishing; to fix a mistake, void it and publish again.
        </>}
        confirmLabel={attempt ? "Retry" : "Publish"}
        confirmVariant="default"
        disabled={publishing.isPending || (!attempt && invalid)}
        onConfirm={publish}
        trigger={<Button disabled={publishing.isPending || (!attempt && invalid)}>{attempt ? "Retry publishing" : "Publish"}</Button>}
      />}
      {publishing.error && <ErrorLine message={predictionErrorText(publishing.error, "staff")} />}
    </div>
  );
}
