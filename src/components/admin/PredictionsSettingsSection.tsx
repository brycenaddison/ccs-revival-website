/**
 * Site Admin > Predictions: the site-wide operation switches, the calendar timezone, the reward
 * policy, the leaderboard season, and which leagues have predictions on.
 *
 * Every write is version-checked. Settings writes carry `/admin/settings`' `version`; a league rule
 * carries its own row's `version`, zero for a league that has never had one. A 409 means someone
 * else changed it first, so the settings reload rather than retrying.
 *
 * Timezone and reward policy changes are previewed first. Both take effect at the same boundary,
 * the already announced reward reset, which the preview returns and the save sends back. A pending
 * timezone change cannot be replaced; a pending policy change can, until it takes effect. Kickoffs
 * and published batches keep their instants. Each reward period keeps the policy it started under.
 *
 * Starting a new leaderboard season loads its preview only on request. It is refused while any
 * market is outstanding, and otherwise freezes the standings and zeroes every balance, so it is a
 * destructive confirmation. Its request ID is kept across an uncertain failure.
 *
 * League names come from `queries.adminLeagues`, which includes hidden drafts; a rule for a conf that
 * list does not know still renders, labeled by `groupLabels`' fallback.
 */

import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ConfirmButton } from "../ConfirmButton";
import { TimeZonePicker } from "../TimeZonePicker";
import { ReadOnlyValue, SettingsGroup, SettingsRow } from "../settings/SettingsSection";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ErrorLine } from "./adminUi";
import { predictionPath } from "../predictions/PredictionCard";
import { PredictionStatusChip } from "../predictions/PredictionStatusChip";
import { absoluteInstant } from "../predictions/PredictionUi";
import { rewardPolicyText } from "../predictions/outcomeLabels";
import { CADENCE_LABEL, MODE_LABEL, predictionErrorText, SWITCH_LABEL } from "../predictions/predictionLabels";
import { PredictionsUnavailable } from "../predictions/PredictionsUnavailable";
import { useAuth } from "../../lib/authContext";
import {
  ApiError,
  isPredictionsUnavailable,
  PREDICTION_REWARD_CADENCES,
  PREDICTION_REWARD_MODES,
  PREDICTION_SEASON_NAME_MAX,
  PREDICTION_SWITCHES,
  previewPredictionRewardPolicy,
  previewPredictionSiteTimeZone,
  REWARD_AMOUNT_MAX_MINOR,
  REWARD_AMOUNT_MIN_MINOR,
  REWARD_STREAK_CAP_MAX,
  rolloverPredictionSeason,
  savePredictionLeagueRule,
  savePredictionRewardPolicy,
  savePredictionSiteSwitch,
  savePredictionSiteTimeZone,
  type CalendarPreview,
  type PredictionLeagueRule,
  type PredictionRewardCadence,
  type PredictionRewardMode,
  type PredictionRolloverInput,
  type PredictionSiteSettings,
  type PredictionSwitch,
  type RewardPolicyChanges,
  type RewardPolicyPreview,
} from "../../lib/api";
import { groupLabels } from "../../lib/leagueAdapters";
import { minorToPointInput, pointInputToMinor, pointsText } from "../../lib/predictionPoints";
import { queries, queryRoots } from "../../lib/queries";
import { fmtDate } from "../../lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { RadioOptions } from "../RadioOptions";
import { Switch } from "@/components/ui/switch";

export function PredictionsSettingsSection() {
  const { profile } = useAuth();
  const viewerId = profile?.id ?? null;
  const settings = useQuery(queries.predictionSiteSettings(viewerId));

  return (
    <div className="flex flex-col gap-8">
      {settings.isPending ? <p role="status" className="text-sm text-text-dim">Loading prediction settings…</p>
        : isPredictionsUnavailable(settings.error) ? <PredictionsUnavailable audience="staff" />
        : settings.error ? <ErrorLine message={predictionErrorText(settings.error, "staff")} />
        : settings.data && <>
          <SettingsGroup title="Operations"><Operations settings={settings.data} onDone={toast.success} /></SettingsGroup>
          {/* Shares its effective boundary with the reward policy: both change at the next announced reset. */}
          <SettingsGroup title="Site timezone"><TimeZone settings={settings.data} onDone={toast.success} /></SettingsGroup>
          <SettingsGroup title="Rewards"><RewardPolicy settings={settings.data} onDone={toast.success} /></SettingsGroup>
        </>}
      <SettingsGroup title="Leaderboard season"><SeasonRollover viewerId={viewerId} onDone={toast.success} /></SettingsGroup>
      <SettingsGroup title="Leagues"><Leagues viewerId={viewerId} onDone={toast.success} /></SettingsGroup>
    </div>
  );
}

/**
 * One setting that takes effect the moment it flips and flips straight back, so a Switch rather
 * than a confirmation. The name and description are wired to the switch; the state word beside it
 * repeats what the switch already announces, for a sighted reader scanning the list.
 */
function SwitchRow({ id, label, detail, state, checked, disabled, onChange }: {
  id: string;
  label: string;
  detail: ReactNode;
  state: string | null;
  checked: boolean | null;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <label htmlFor={id} className="block cursor-pointer truncate font-heading text-sm text-text-bright">{label}</label>
        <p id={`${id}-detail`} className="text-xs text-text-dim">{detail}</p>
      </div>
      {checked !== null && (
        <div className="flex shrink-0 items-center gap-2">
          <span aria-hidden="true" className="font-heading text-[10px] text-text-dim">{state}</span>
          <Switch
            id={id}
            checked={checked}
            disabled={disabled}
            aria-describedby={`${id}-detail`}
            onCheckedChange={onChange}
          />
        </div>
      )}
    </div>
  );
}

/** Invalidate the whole family, and on a 409 as well, because someone else's write moved the version. */
function useSettingsWrite<T>(write: (input: T) => Promise<void>, onDone: (message: string) => void, done: (input: T) => string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: write,
    onSuccess: async (_, input) => {
      await qc.invalidateQueries({ queryKey: queryRoots.predictions });
      onDone(done(input));
    },
    onError: async error => {
      if (error instanceof ApiError && error.status === 409) await qc.invalidateQueries({ queryKey: queryRoots.predictions });
    },
  });
}

function Operations({ settings, onDone }: { settings: PredictionSiteSettings; onDone: (message: string) => void }) {
  const write = useSettingsWrite(
    ({ field, enabled }: { field: PredictionSwitch; enabled: boolean }) => savePredictionSiteSwitch(field, enabled, settings.version!),
    onDone,
    ({ field, enabled }) => `${SWITCH_LABEL[field].label} ${enabled ? "resumed" : "paused"}.`,
  );
  return (
    <>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {PREDICTION_SWITCHES.map(field => {
          const stored = settings[field];
          // The requested state while its write is in flight, so the switch moves when pressed.
          const on = write.isPending && write.variables?.field === field ? write.variables.enabled : stored;
          const { label, detail } = SWITCH_LABEL[field];
          return (
            <li key={field}>
              <SwitchRow
                id={`prediction-switch-${field}`}
                label={label}
                detail={detail}
                state={on === null ? null : on ? "On" : "Paused"}
                checked={on}
                disabled={write.isPending || settings.version === null}
                onChange={enabled => write.mutate({ field, enabled })}
              />
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-text-dim">Refunds and staff corrections still work while automatic settlement is paused.</p>
      <ErrorLine message={write.error ? predictionErrorText(write.error, "staff") : null} />
    </>
  );
}

function TimeZone({ settings, onDone }: { settings: PredictionSiteSettings; onDone: (message: string) => void }) {
  const [changing, setChanging] = useState(false);
  const [zone, setZone] = useState<string | null>(null);
  const [preview, setPreview] = useState<CalendarPreview | null>(null);
  const previewing = useMutation({
    mutationFn: (next: string) => previewPredictionSiteTimeZone(next, settings.version!),
    onSuccess: setPreview,
  });
  const save = useSettingsWrite(
    (reviewed: CalendarPreview) => savePredictionSiteTimeZone(reviewed.siteTimeZone, settings.version!, reviewed.effectiveAt!),
    onDone,
    reviewed => `The site timezone changes to ${reviewed.siteTimeZone}.`,
  );
  const choose = (next: string) => {
    setZone(next);
    setPreview(null);
    save.reset();
    if (next !== settings.siteTimeZone) previewing.mutate(next);
  };
  const cancel = () => { setChanging(false); setZone(null); setPreview(null); previewing.reset(); save.reset(); };
  const now = new Date().toISOString();

  return (
    <div className="max-w-xl">
      <ReadOnlyValue>
        {settings.siteTimeZone ?? "Unavailable"}
        {settings.siteTimeZone && <span className="text-text-dim"> · now {absoluteInstant(now, settings.siteTimeZone)}</span>}
      </ReadOnlyValue>
      {settings.pendingTimeZone ? (
        <p className="mt-2 text-sm text-text-secondary">
          Changing to {settings.pendingTimeZone} on {absoluteInstant(settings.effectiveAt, settings.siteTimeZone) ?? "the next reset"}.
          A pending change cannot be replaced.
        </p>
      ) : !changing ? (
        <Button variant="outline" size="sm" className="mt-3" disabled={settings.version === null} onClick={() => setChanging(true)}>Change timezone</Button>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <TimeZonePicker value={zone} onChange={choose} disabled={previewing.isPending || save.isPending} />
            <Button variant="ghost" size="sm" disabled={save.isPending} onClick={cancel}>Cancel</Button>
          </div>
          {previewing.isPending && <p role="status" className="text-sm text-text-dim">Checking the change…</p>}
          {preview && (
            <div className="rounded-md border border-border bg-bg3 p-3 text-sm text-text-secondary">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                <dt>Takes effect</dt>
                <dd className="text-text-bright">{absoluteInstant(preview.effectiveAt, settings.siteTimeZone) ?? "Unavailable"}</dd>
                <dt>Next reward reset</dt>
                <dd className="text-text-bright">{absoluteInstant(preview.nextRewardReset, preview.siteTimeZone) ?? "Unavailable"}</dd>
              </dl>
              <p className="mt-2 text-xs text-text-dim">Match kickoffs and matches already published keep their times.</p>
              <ConfirmButton
                title={`Change the site timezone to ${preview.siteTimeZone}?`}
                description="Prediction weeks and daily reward resets move to the new timezone from the time shown. This cannot be replaced once scheduled."
                confirmLabel="Change timezone"
                confirmVariant="default"
                disabled={save.isPending || !preview.effectiveAt}
                onConfirm={() => save.mutate(preview)}
                trigger={<Button size="sm" className="mt-3" disabled={save.isPending || !preview.effectiveAt}>Save timezone</Button>}
              />
            </div>
          )}
          <ErrorLine message={previewing.error ? predictionErrorText(previewing.error, "staff") : save.error ? predictionErrorText(save.error, "staff") : null} />
        </div>
      )}
    </div>
  );
}

interface PolicyDraft {
  cadence: PredictionRewardCadence;
  mode: PredictionRewardMode;
  /** Points, as typed. */
  amount: string;
  streakCap: string;
}
interface PolicyReview { changes: RewardPolicyChanges; result: RewardPolicyPreview }

function RewardPolicy({ settings, onDone }: { settings: PredictionSiteSettings; onDone: (message: string) => void }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<PolicyDraft | null>(null);
  const [review, setReview] = useState<PolicyReview | null>(null);
  const current = settings.rewardPolicy, pending = settings.pendingRewardPolicy;
  const zone = settings.siteTimeZone;

  // A 409 (`calendar_preview_changed`, `settings_changed`) means the reviewed boundary or version moved.
  const onStale = async (error: unknown) => {
    if (!(error instanceof ApiError) || error.status !== 409) return;
    setReview(null);
    await qc.invalidateQueries({ queryKey: queryRoots.predictions });
  };
  const previewing = useMutation({
    mutationFn: (changes: RewardPolicyChanges) => previewPredictionRewardPolicy(changes, settings.version!),
    onSuccess: (result, changes) => setReview({ changes, result }),
    onError: onStale,
  });
  const save = useMutation({
    mutationFn: (reviewed: PolicyReview) => savePredictionRewardPolicy(reviewed.changes, settings.version!, reviewed.result.effectiveAt!),
    onSuccess: async () => {
      setDraft(null); setReview(null);
      await qc.invalidateQueries({ queryKey: queryRoots.predictions });
      onDone("Reward change scheduled.");
    },
    onError: onStale,
  });

  const start = () => {
    const base = pending ?? current;
    setDraft({
      cadence: base?.cadence ?? "daily", mode: base?.mode ?? "scaling",
      amount: base ? minorToPointInput(base.amount) : "", streakCap: base ? String(base.streakCap) : "5",
    });
  };
  const edit = (patch: Partial<PolicyDraft>) => {
    setDraft(value => value && { ...value, ...patch });
    setReview(null); previewing.reset(); save.reset();
  };
  const cancel = () => { setDraft(null); setReview(null); previewing.reset(); save.reset(); };

  const minor = draft ? pointInputToMinor(draft.amount) : null;
  const amountError = !draft || draft.amount.trim() === "" ? null
    : minor === null || BigInt(minor) < REWARD_AMOUNT_MIN_MINOR || BigInt(minor) > REWARD_AMOUNT_MAX_MINOR
      ? `Enter ${pointsText(REWARD_AMOUNT_MIN_MINOR.toString())} to ${pointsText(REWARD_AMOUNT_MAX_MINOR.toString())} points.`
      : null;
  const cap = draft ? Number(draft.streakCap) : NaN;
  const capError = !draft || draft.mode !== "scaling" || draft.streakCap.trim() === "" ? null
    : !Number.isInteger(cap) || cap < 1 || cap > REWARD_STREAK_CAP_MAX ? `Enter a whole number from 1 to ${REWARD_STREAK_CAP_MAX}.` : null;
  const changes: RewardPolicyChanges | null = !draft || minor === null || amountError || capError
    || (draft.mode === "scaling" && draft.streakCap.trim() === "") ? null
    : { cadence: draft.cadence, mode: draft.mode, amount: minor, ...(draft.mode === "scaling" ? { streakCap: cap } : {}) };
  const busy = previewing.isPending || save.isPending;

  return (
    <div className="max-w-xl">
      <ReadOnlyValue>{current ? rewardPolicyText(current) : "Unavailable"}</ReadOnlyValue>
      {pending && (
        <p className="mt-2 text-sm text-text-secondary">
          Changing to {rewardPolicyText(pending)} on {absoluteInstant(settings.pendingRewardEffectiveAt, zone) ?? "the next reset"}.
          {" "}You can replace it until then.
        </p>
      )}
      {!draft ? (
        <Button variant="outline" size="sm" className="mt-3" disabled={settings.version === null} onClick={start}>Change rewards</Button>
      ) : (
        <div className="mt-4">
          <SettingsRow label="Cadence">
            <RadioOptions
              name="cadence"
              options={PREDICTION_REWARD_CADENCES.map(value => ({ value, label: CADENCE_LABEL[value] }))}
              value={draft.cadence}
              disabled={busy}
              onChange={cadence => edit({ cadence })}
            />
          </SettingsRow>
          <SettingsRow label="Amount">
            <RadioOptions
              name="mode"
              options={PREDICTION_REWARD_MODES.map(value => ({ value, label: MODE_LABEL[value].label, detail: MODE_LABEL[value].detail }))}
              value={draft.mode}
              disabled={busy}
              onChange={mode => edit({ mode })}
            />
          </SettingsRow>
          <SettingsRow label={draft.mode === "scaling" ? "Points per streak step" : "Points per claim"} error={amountError}>
            {field => <Input {...field} inputMode="decimal" value={draft.amount} disabled={busy} onChange={e => edit({ amount: e.target.value })} />}
          </SettingsRow>
          {draft.mode === "scaling" && (
            <SettingsRow label="Streak cap" hint="The streak at which the reward stops growing." error={capError}>
              {field => <Input {...field} inputMode="numeric" value={draft.streakCap} disabled={busy} onChange={e => edit({ streakCap: e.target.value })} />}
            </SettingsRow>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={busy || !changes || settings.version === null} onClick={() => changes && previewing.mutate(changes)}>Preview</Button>
            <Button variant="ghost" size="sm" disabled={save.isPending} onClick={cancel}>Cancel</Button>
          </div>
          {previewing.isPending && <p role="status" className="mt-2 text-sm text-text-dim">Checking the change…</p>}
          {review && (
            <div className="mt-3 rounded-md border border-border bg-bg3 p-3 text-sm text-text-secondary">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                <dt>Takes effect</dt>
                <dd className="text-text-bright">{absoluteInstant(review.result.effectiveAt, zone) ?? "Unavailable"}</dd>
                <dt>Next reward reset</dt>
                <dd className="text-text-bright">{absoluteInstant(review.result.nextRewardReset, zone) ?? "Unavailable"}</dd>
                {review.result.transitionHours !== null && <>
                  <dt>First period</dt>
                  <dd className="text-text-bright">{review.result.transitionHours} hours</dd>
                </>}
                <dt>Now</dt>
                <dd className="text-text-bright">{review.result.current ? rewardPolicyText(review.result.current) : "Unavailable"}</dd>
                <dt>From then</dt>
                <dd className="text-text-bright">{review.result.next ? rewardPolicyText(review.result.next) : "Unavailable"}</dd>
              </dl>
              <p className="mt-2 text-xs text-text-dim">The current period keeps its reward. Streaks carry across the change.</p>
              <ConfirmButton
                title="Schedule this reward change?"
                description={`Rewards change to ${review.result.next ? rewardPolicyText(review.result.next) : "the new policy"} from the time shown. You can replace it until then.`}
                confirmLabel="Schedule change"
                confirmVariant="default"
                disabled={save.isPending || !review.result.effectiveAt}
                onConfirm={() => save.mutate(review)}
                trigger={<Button size="sm" className="mt-3" disabled={save.isPending || !review.result.effectiveAt}>Save rewards</Button>}
              />
            </div>
          )}
          <ErrorLine message={previewing.error ? predictionErrorText(previewing.error, "staff") : save.error ? predictionErrorText(save.error, "staff") : null} />
        </div>
      )}
    </div>
  );
}

function SeasonRollover({ viewerId, onDone }: { viewerId: number | null; onDone: (message: string) => void }) {
  const qc = useQueryClient();
  const seasons = useQuery(queries.predictionSeasons());
  const leagues = useQuery(queries.adminLeagues());
  const [started, setStarted] = useState(false);
  const preview = useQuery(queries.predictionRolloverPreview(viewerId, started));
  const [name, setName] = useState("");
  const [attempt, setAttempt] = useState<PredictionRolloverInput | null>(null);
  const open = seasons.data?.find(season => season.endedAt === null) ?? null;

  const rolling = useMutation({
    mutationFn: rolloverPredictionSeason,
    onSuccess: async (result, input) => {
      setAttempt(null); setStarted(false); setName("");
      await qc.invalidateQueries({ queryKey: queryRoots.predictions });
      onDone(`${result.season?.name ?? input.name} started. Every balance is now zero.`);
    },
    onError: async error => {
      if (!(error instanceof ApiError) || error.status >= 500) return;
      setAttempt(null);
      // `season_outstanding_events` and `season_preview_changed` both mean the preview is out of date.
      if (error.status === 409) await qc.invalidateQueries({ queryKey: queryRoots.predictions });
    },
  });
  const apply = () => {
    const data = preview.data;
    if (rolling.isPending || !data) return;
    const next = attempt ?? { requestId: crypto.randomUUID(), expectedSeasonId: data.season.id, name: name.trim(), previewToken: data.previewToken };
    setAttempt(next);
    rolling.mutate(next);
  };
  const cancel = () => { setStarted(false); setName(""); setAttempt(null); rolling.reset(); };

  const data = preview.data;
  const blockers = data?.blockers ?? [];
  const labels = groupLabels(leagues.data ?? [], blockers.map(blocker => blocker.conf));
  const trimmed = name.trim();

  return (
    <div className="max-w-xl">
      <ReadOnlyValue>
        {seasons.isPending ? "Loading…" : open ? <>{open.name}{open.startedAt && <span className="text-text-dim"> · since {fmtDate(open.startedAt)}</span>}</> : "Unavailable"}
      </ReadOnlyValue>
      <ErrorLine message={seasons.error ? predictionErrorText(seasons.error, "staff") : null} />
      {!started ? (
        <Button variant="outline" size="sm" className="mt-3" onClick={() => setStarted(true)}>Start a new season</Button>
      ) : preview.isPending ? (
        <p role="status" className="mt-3 text-sm text-text-dim">Checking outstanding predictions…</p>
      ) : preview.error || !data ? (
        <div className="mt-3">
          <ErrorLine message={preview.error ? predictionErrorText(preview.error, "staff") : "The rollover preview is unavailable."} />
          <Button variant="ghost" size="sm" className="mt-2" onClick={cancel}>Cancel</Button>
        </div>
      ) : blockers.length > 0 ? (
        <div className="mt-3 space-y-3">
          <Alert>
            <AlertDescription>
              {blockers.length === 1 ? "This prediction" : `These ${blockers.length} predictions`} must settle or be voided before a new season can start.
            </AlertDescription>
          </Alert>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {blockers.map(blocker => (
              <li key={blocker.eventId} className="flex min-w-0 items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <Link to={predictionPath(blocker.eventId)} className="block truncate text-sm text-brand no-underline hover:underline">
                    {blocker.title ?? "Match prediction"}
                  </Link>
                  <span className="text-xs text-text-dim">{labels.get(blocker.conf) ?? blocker.conf}</span>
                </div>
                {blocker.state && <PredictionStatusChip state={blocker.state} />}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={preview.isFetching} onClick={() => preview.refetch()}>Check again</Button>
            <Button variant="ghost" size="sm" onClick={cancel}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md border border-border bg-bg3 p-3 text-sm text-text-secondary">
            <dt>Wallets cleared</dt>
            <dd className="font-mono text-text-bright">{data.walletsToClear ?? "Unavailable"}</dd>
            <dt>Balance cleared</dt>
            <dd className="font-mono text-text-bright">{pointsText(data.balanceCleared)}</dd>
            <dt>Debt cleared</dt>
            <dd className="font-mono text-text-bright">{pointsText(data.debtCleared)}</dd>
            <dt>Standings frozen</dt>
            <dd className="font-mono text-text-bright">{data.standings ?? "Unavailable"}</dd>
          </dl>
          <SettingsRow label="New season name">
            {field => (
              <Input {...field} value={name} maxLength={PREDICTION_SEASON_NAME_MAX} disabled={attempt !== null}
                onChange={e => setName(e.target.value)} placeholder="Winter 2027" />
            )}
          </SettingsRow>
          <div className="flex flex-wrap gap-2">
            <ConfirmButton
              title={attempt ? "Retry starting the new season?" : `End ${data.season.name} and start ${trimmed}?`}
              description="Every balance resets to zero and players re-enroll for new starting points. The current standings are frozen as final. This cannot be undone."
              confirmLabel={attempt ? "Retry" : "Start new season"}
              disabled={rolling.isPending || (!attempt && !trimmed)}
              onConfirm={apply}
              trigger={<Button variant="destructive" size="sm" disabled={rolling.isPending || (!attempt && !trimmed)}>{attempt ? "Retry" : "Start new season"}</Button>}
            />
            <Button variant="ghost" size="sm" disabled={rolling.isPending} onClick={cancel}>Cancel</Button>
          </div>
        </div>
      )}
      <ErrorLine message={rolling.error ? predictionErrorText(rolling.error, "staff") : null} />
    </div>
  );
}

function Leagues({ viewerId, onDone }: { viewerId: number | null; onDone: (message: string) => void }) {
  const rules = useQuery(queries.predictionLeagueRules(viewerId));
  const leagues = useQuery(queries.adminLeagues());
  const labels = groupLabels(leagues.data ?? [], (rules.data ?? []).map(rule => rule.conf));
  const nameOf = (conf: string) => leagues.data?.find(league => league.conf === conf)?.name ?? labels.get(conf) ?? conf;
  const write = useSettingsWrite(
    (rule: PredictionLeagueRule) => savePredictionLeagueRule(rule.conf, !rule.enabled, rule.version),
    onDone,
    rule => `Predictions turned ${rule.enabled ? "off" : "on"} for ${nameOf(rule.conf)}.`,
  );

  if (rules.isPending) return <p role="status" className="text-sm text-text-dim">Loading leagues…</p>;
  if (rules.error) return <ErrorLine message={predictionErrorText(rules.error, "staff")} />;
  const rows = rules.data ?? [];
  if (rows.length === 0) return <p className="text-sm text-text-dim">No leagues yet.</p>;

  return (
    <>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {rows.map(rule => {
          const on = write.isPending && write.variables?.conf === rule.conf ? !rule.enabled : rule.enabled;
          return (
            <li key={rule.conf}>
              <SwitchRow
                id={`prediction-league-${rule.conf}`}
                label={nameOf(rule.conf)}
                detail={on
                  ? "League staff can publish this league's matches for predictions."
                  : "Staff cannot publish this league's matches."}
                state={on ? "On" : "Off"}
                checked={on}
                disabled={write.isPending}
                onChange={() => write.mutate(rule)}
              />
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-text-dim">Published predictions keep running when a league is turned off.</p>
      <ErrorLine message={write.error ? predictionErrorText(write.error, "staff") : null} />
    </>
  );
}
