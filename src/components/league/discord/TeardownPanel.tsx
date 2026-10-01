/**
 * End-of-season teardown of this league's team roles and channels.
 *
 * The confirmation is typed: upstream refuses any `confirm` but the conference code, so the dialog
 * sends exactly what was typed. An active league is refused with `season_active`; only then does the
 * dialog offer to tear down anyway, so whether the season is active comes from the API's answer
 * rather than a flag this page may not be able to read. The mutation lives in the panel, which
 * outlives the dialog, and the per-object report stays here after it closes.
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { FormDialog } from "../../FormDialog";
import { RadioOptions } from "../../RadioOptions";
import { ErrorLine } from "../../admin/adminUi";
import { SettingsRow } from "../../settings/SettingsSection";
import {
  errorMessage,
  teamDiscordRefusal,
  teardownTeamDiscord,
  type TeamDiscordStatus,
  type TeamDiscordTeardownMode,
  type TeamDiscordTeardownReport,
  type TeamDiscordTeardownResult,
} from "../../../lib/api";
import { RESOURCE_LABEL, TEARDOWN_MODE, TEARDOWN_RESULT } from "./discordLabels";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

const MODES = (["archive", "delete"] as const).map(value => ({ value, ...TEARDOWN_MODE[value] }));

export function TeardownPanel({ conf, status, canEdit, onDone }: {
  conf: string;
  status: TeamDiscordStatus;
  /** League admin scope and a connected Discord. */
  canEdit: boolean;
  onDone: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<TeamDiscordTeardownMode>("archive");
  const [confirm, setConfirm] = useState("");
  const [force, setForce] = useState(false);

  const teardown = useMutation({
    mutationFn: () => teardownTeamDiscord(conf, { confirm, mode, force }),
    // A lost response can hide deletions; only an explicit click sends another request.
    retry: false,
    onSuccess: async report => {
      setOpen(false);
      await onDone();
      const failed = report.results.filter(row => row.result === "failed").length;
      toast.success(failed ? `Teardown finished with ${failed} ${failed === 1 ? "failure" : "failures"}.` : "Teardown finished.");
    },
  });
  const active = teamDiscordRefusal(teardown.error)?.status === "season_active";
  const { remove, archive, pending } = status.teardown;
  const nothing = remove === 0 && pending === 0;

  const close = (next: boolean) => {
    if (next || teardown.isPending) return;
    setOpen(false);
    setConfirm("");
    setForce(false);
    teardown.reset();
  };

  return (
    <section aria-labelledby="discord-teardown" className="flex flex-col gap-3">
      <h3 id="discord-teardown" className="font-heading text-sm text-text-bright">End of season</h3>
      <p className="text-sm text-text-secondary">
        {nothing ? "Nothing recorded for this league to tear down." : (
          <>
            Delete would remove {remove} recorded {remove === 1 ? "object" : "objects"}. Archive would keep
            {" "}{archive} text {archive === 1 ? "channel" : "channels"}, read-only for staff roles.
            {pending > 0 && <> {pending} unfinished {pending === 1 ? "create is" : "creates are"} adopted or released.</>}
          </>
        )}
      </p>
      {canEdit && !nothing && (
        <div>
          <Button variant="destructive" size="sm" type="button" onClick={() => setOpen(true)}>Tear down…</Button>
        </div>
      )}
      {teardown.data && !open && <TeardownReport report={teardown.data} teams={status.teams} />}

      <FormDialog
        open={open}
        onOpenChange={close}
        title="Tear down this league's Discord?"
        description="Only objects the bot recorded are touched. The background sync stops for this league."
        footer={
          <>
            <Button variant="outline" disabled={teardown.isPending} onClick={() => close(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={teardown.isPending || confirm !== conf || (active && !force)}
              onClick={() => teardown.mutate()}
            >
              {teardown.isPending ? "Tearing down…" : TEARDOWN_MODE[mode].label}
            </Button>
          </>
        }
      >
        <SettingsRow label="Mode">
          <RadioOptions name="teardown-mode" options={MODES} value={mode} disabled={teardown.isPending}
            onChange={next => { setMode(next); teardown.reset(); }} />
        </SettingsRow>
        <SettingsRow label="Confirm" hint={<>Type <span className="font-mono text-text">{conf}</span> to confirm.</>}>
          {field => (
            <Input {...field} value={confirm} autoComplete="off" disabled={teardown.isPending} className="font-mono"
              onChange={event => setConfirm(event.target.value)} />
          )}
        </SettingsRow>
        {active && (
          <label className="mb-4 flex items-start gap-2 text-sm text-text">
            <Checkbox checked={force} disabled={teardown.isPending} onCheckedChange={value => setForce(value === true)} className="mt-0.5" />
            Tear down anyway while the season is still active
          </label>
        )}
        <ErrorLine message={teardown.error ? errorMessage(teardown.error) : null} />
      </FormDialog>
    </section>
  );
}

const RESULT_ORDER: readonly TeamDiscordTeardownResult[] = ["failed", "deleted", "archived", "gone", "released"];

function TeardownReport({ report, teams }: { report: TeamDiscordTeardownReport; teams: TeamDiscordStatus["teams"] }) {
  const teamName = (id: number | null) => {
    const team = id === null ? undefined : teams.find(t => t.teamId === id);
    return team ? `${team.name || team.code} ` : "";
  };
  const failed = report.results.filter(row => row.result === "failed");
  const counts = RESULT_ORDER
    .map(result => [result, report.results.filter(row => row.result === result).length] as const)
    .filter(([, n]) => n > 0);
  return (
    <div className="space-y-2" aria-live="polite">
      <h4 className="font-heading text-sm text-text-bright">
        {report.mode ? `${TEARDOWN_MODE[report.mode].label} report` : "Teardown report"}
      </h4>
      {counts.length === 0 ? <p className="text-sm text-text-dim">Nothing was changed.</p> : (
        <p className="text-sm text-text-secondary">{counts.map(([result, n]) => `${TEARDOWN_RESULT[result]}: ${n}`).join(" · ")}</p>
      )}
      {failed.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-sm text-ccs-red">
          {failed.map(row => (
            <li key={row.id}>{teamName(row.teamId)}{row.kind ? RESOURCE_LABEL[row.kind].toLowerCase() : "object"}: {row.error ?? "Failed"}</li>
          ))}
        </ul>
      )}
      {failed.length > 0 && <p className="text-xs text-text-dim">Tear down again to retry what failed.</p>}
    </div>
  );
}
