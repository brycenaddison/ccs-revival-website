/**
 * Site Admin > Predictions: the site-wide operation switches, the calendar timezone, and which
 * leagues have predictions on.
 *
 * Every write is version-checked. Settings writes carry `/admin/settings`' `version`; a league rule
 * carries its own row's `version`, zero for a league that has never had one. A 409 means someone
 * else changed it first, so the settings reload rather than retrying.
 *
 * Timezone changes are previewed first. The preview's effective boundary (the already announced
 * reward reset) is sent back on save, and a pending change cannot be replaced. Kickoffs and published
 * batches keep their instants.
 *
 * League names come from `queries.adminLeagues`, which includes hidden drafts; a rule for a conf that
 * list does not know still renders, labeled by `groupLabels`' fallback.
 */

import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ConfirmButton } from "../ConfirmButton";
import { TimeZonePicker } from "../TimeZonePicker";
import { ReadOnlyValue } from "../settings/SettingsSection";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ErrorLine } from "./adminUi";
import { absoluteInstant } from "../predictions/PredictionUi";
import { SWITCH_LABEL } from "../predictions/predictionLabels";
import { useAuth } from "../../lib/authContext";
import {
  ApiError,
  errorMessage,
  PREDICTION_SWITCHES,
  previewPredictionSiteTimeZone,
  savePredictionLeagueRule,
  savePredictionSiteSwitch,
  savePredictionSiteTimeZone,
  type CalendarPreview,
  type PredictionLeagueRule,
  type PredictionSiteSettings,
  type PredictionSwitch,
} from "../../lib/api";
import { groupLabels } from "../../lib/leagueAdapters";
import { queries, queryRoots } from "../../lib/queries";
import { Switch } from "@/components/ui/switch";

export function PredictionsSettingsSection() {
  const { profile } = useAuth();
  const viewerId = profile?.id ?? null;
  const settings = useQuery(queries.predictionSiteSettings(viewerId));

  return (
    <div className="flex flex-col gap-8">
      {settings.isPending ? <p role="status" className="text-sm text-text-dim">Loading prediction settings…</p>
        : settings.error ? <ErrorLine message={errorMessage(settings.error)} />
        : settings.data && <>
          <Group title="Operations"><Operations settings={settings.data} onDone={toast.success} /></Group>
          <Group title="Site timezone"><TimeZone settings={settings.data} onDone={toast.success} /></Group>
        </>}
      <Group title="Leagues"><Leagues viewerId={viewerId} onDone={toast.success} /></Group>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 font-heading text-sm text-text-bright">{title}</h3>
      {children}
    </section>
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
      <ErrorLine message={write.error ? errorMessage(write.error) : null} />
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
          <ErrorLine message={previewing.error ? errorMessage(previewing.error) : save.error ? errorMessage(save.error) : null} />
        </div>
      )}
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
  if (rules.error) return <ErrorLine message={errorMessage(rules.error)} />;
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
      <ErrorLine message={write.error ? errorMessage(write.error) : null} />
    </>
  );
}
