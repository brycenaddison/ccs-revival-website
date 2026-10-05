/** Results settings are independent of team resources and stay mounted while switching tabs. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ConfirmButton } from "../../ConfirmButton";
import { RadioOptions } from "../../RadioOptions";
import { ErrorLine } from "../../admin/adminUi";
import { SettingsGroup, SettingsRow } from "../../settings/SettingsSection";
import {
  ApiError, RESULTS_WEBHOOK_NAME_MAX, RESULTS_WEBHOOK_URL, disconnectResultsWebhook, errorMessage, generateResultsWebhook,
  recheckResultsWebhook, saveResultsWebhook, testResultsWebhook,
  type ResultsGenerateInput, type ResultsOperation, type ResultsTest, type ResultsTestInput, type ResultsWebhookStatus,
} from "../../../lib/api";
import { queries, queryRoots } from "../../../lib/queries";
import { fmtLocalDateTime } from "../../../lib/utils";
import { ResultsChannelPicker } from "./ResultsChannelPicker";
import { ResultsOperations } from "./ResultsOperations";
import {
  resultsOperationPending, resultsTestLabel, resultsTestUncertain, resultsWebhookNameError,
} from "./resultsLabels";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Action =
  | { kind: "generate"; body: ResultsGenerateInput }
  | { kind: "test"; body: ResultsTestInput }
  | { kind: "save" | "disconnect"; expectedRevision: number }
  | { kind: "recheck"; operationId: string };

type ActionResult =
  | { kind: "generate" | "recheck"; value: ResultsOperation }
  | { kind: "save" | "disconnect"; value: ResultsWebhookStatus }
  | { kind: "test"; value: ResultsTest; revision: number };

type SetupMode = "generate" | "paste";

const SETUP_MODES = [
  { value: "generate", label: "Create a webhook", detail: "The bot creates one in a channel you choose." },
  { value: "paste", label: "Use an existing webhook", detail: "Paste a webhook link copied from Discord." },
] as const;

// A transport/5xx failure may conceal a committed request. Preserve its exact body for inspection.
const definiteRefusal = (e: unknown) => e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 408;

export function ResultsPanel({ conf, viewerId }: { conf: string; viewerId: number | null }) {
  const qc = useQueryClient();
  const status = useQuery(queries.resultsWebhook(conf, viewerId));
  const channels = useQuery(queries.resultsWebhookChannels(conf, viewerId));
  const [mode, setMode] = useState<SetupMode>("generate");
  const [channelId, setChannelId] = useState("");
  // Null follows the API's default until the admin types a name.
  const [webhookName, setWebhookName] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [generationRequest, setGenerationRequest] = useState<ResultsGenerateInput | null>(null);
  const [testRequest, setTestRequest] = useState<ResultsTestInput | null>(null);
  const [testReport, setTestReport] = useState<(ResultsTest & { revision: number }) | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: queryRoots.resultsWebhooks });

  const action = useMutation({
    mutationFn: async (input: Action): Promise<ActionResult> => {
      switch (input.kind) {
        case "generate": return { kind: input.kind, value: await generateResultsWebhook(conf, input.body) };
        case "test": return { kind: input.kind, value: await testResultsWebhook(conf, input.body), revision: input.body.expectedRevision };
        // Keep the pasted secret out of mutation variables/history and clear the field after saving.
        case "save": return { kind: input.kind, value: await saveResultsWebhook(conf, { expectedRevision: input.expectedRevision, webhookUrl: webhookUrl.trim() }) };
        case "disconnect": return { kind: input.kind, value: await disconnectResultsWebhook(conf, input.expectedRevision) };
        case "recheck": return { kind: input.kind, value: await recheckResultsWebhook(conf, input.operationId) };
      }
    },
    retry: false,
    onSuccess: result => {
      switch (result.kind) {
        case "save":
          setWebhookUrl("");
          toast.success("Results destination saved.");
          break;
        case "disconnect":
          setGenerationRequest(null);
          toast.success("Results destination disconnected.");
          break;
        case "generate":
          setGenerationRequest(null);
          if (result.value.status === "active") toast.success("Results destination generated and activated.");
          break;
        case "recheck":
          if (result.value.status === "active") toast.success("Original creation confirmed and activated.");
          break;
        case "test":
          setTestRequest(null);
          setTestReport({ ...result.value, revision: result.revision });
          if (result.value.status === "sent" || result.value.status === "already_sent") toast.success(resultsTestLabel(result.value.status));
          break;
      }
    },
    onError: (error, input) => {
      if (!definiteRefusal(error)) return;
      if (input.kind === "generate") setGenerationRequest(null);
      if (input.kind === "test") setTestRequest(null);
    },
    // Revision conflicts and response loss also need a fresh authoritative status/reservation read.
    onSettled: refresh,
  });

  const data = status.data;
  const working = action.isPending;
  const revision = data?.revision ?? null;
  const ready = !!data && !status.isError && !status.isFetching && revision !== null && !working;
  const recordedGeneration = data?.operations.find(op => op.requestId === generationRequest?.requestId);
  const lostGeneration = generationRequest !== null && !recordedGeneration;
  const pendingCreation = (data?.operations ?? []).some(resultsOperationPending);
  const canConfigure = ready && !lostGeneration && !pendingCreation;
  const channelList = channels.data?.channels ?? [];
  const channel = channelList.find(c => c.id === channelId);
  // A refresh can make the chosen channel ineligible; it then reads as unselected.
  const eligibleChannel = channel?.available && channel.canGenerate ? channel : undefined;
  const channelsUsable = !channels.isFetching && !channels.isError && !!channels.data;
  const defaultName = channels.data?.defaultWebhookName ?? null;
  const name = webhookName ?? defaultName ?? "";
  const nameError = defaultName !== null ? resultsWebhookNameError(name) : null;
  const canGenerate = canConfigure && channelsUsable && !!eligibleChannel && nameError === null;
  const validUrl = RESULTS_WEBHOOK_URL.test(webhookUrl.trim());
  const recordedTest = data?.lastTest;
  // The refreshed server snapshot also sees tests started by other administrators.
  const currentTest = recordedTest ?? testReport;
  const lostTest = testRequest !== null && recordedTest?.requestId !== testRequest.requestId;
  const testUncertain = currentTest !== null && currentTest !== undefined && resultsTestUncertain(currentTest.status);
  const canTest = ready && !!data?.destination && !lostTest;
  const testToCheck = testRequest ?? (currentTest?.requestId && typeof currentTest.revision === "number"
    ? { requestId: currentTest.requestId, expectedRevision: currentTest.revision } : null);
  const canDisconnect = ready && (!!data?.destination || pendingCreation || lostGeneration);

  const generate = () => {
    if (!canGenerate || revision === null || !eligibleChannel) return;
    // The name joins the pinned body only when the API advertises support for it.
    const body: ResultsGenerateInput = {
      channelId: eligibleChannel.id, expectedRevision: revision, requestId: crypto.randomUUID(),
      ...(defaultName !== null ? { webhookName: name.trim() } : {}),
    };
    setGenerationRequest(body);
    action.mutate({ kind: "generate", body });
  };
  const sendTest = () => {
    if (!canTest || revision === null) return;
    const body = { expectedRevision: revision, requestId: crypto.randomUUID() };
    setTestRequest(body);
    action.mutate({ kind: "test", body });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-secondary">Post completed series results to this league&apos;s Discord channel.</p>
        <Button type="button" variant="outline" size="sm" disabled={working || status.isFetching || channels.isFetching}
          onClick={() => { void refresh(); }}>Check again</Button>
      </div>
      {status.isPending && <p role="status" className="text-sm text-text-dim">Loading results setup…</p>}
      <ErrorLine message={status.error ? errorMessage(status.error)
        : status.isSuccess && !data ? "The results setup is unavailable." : null} />
      {working && <p role="status" className="text-sm text-text-secondary">Updating results setup…</p>}
      <ErrorLine message={action.error ? errorMessage(action.error) : null} />

      {data && <>
        <SettingsGroup title="Destination">
          <div className="space-y-4 rounded-md border border-border p-3">
            {data.destination ? (
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-text-bright">
                    {data.destination.channelName ? `#${data.destination.channelName}` : "Saved results channel"}
                  </span>
                  <Badge variant="muted">{data.destination.source === "managed" ? "Generated" : data.destination.source === "external" ? "Existing webhook" : "Saved"}</Badge>
                </div>
                {(data.destination.webhookName || data.destination.updatedAt) && <p className="text-sm text-text-secondary">
                  {[data.destination.webhookName, data.destination.updatedAt && `Saved ${fmtLocalDateTime(data.destination.updatedAt)}`]
                    .filter(Boolean).join(" · ")}
                </p>}
                <p className="text-xs text-text-dim">Saved metadata is a snapshot. Send a test to check the destination.</p>
              </div>
            ) : <p className="text-sm text-text-dim">No destination configured. Automatic results are skipped.</p>}

            <div className="flex flex-wrap gap-2">
              {data.destination && (testUncertain ? <ConfirmButton
                title="Send another test after inspecting Discord?"
                description="The previous test may already have been delivered. Check the channel first. This action starts a new test and may post another message."
                confirmLabel="Send another test" confirmVariant="default" disabled={!canTest}
                onConfirm={sendTest}
                trigger={<Button type="button" variant="outline" size="sm" disabled={!canTest}>Send another test after inspection…</Button>}
              /> : <Button type="button" variant="outline" size="sm" disabled={!canTest} onClick={sendTest}>
                {working && action.variables?.kind === "test" ? "Sending…" : "Send test"}
              </Button>)}
              {data.destination || pendingCreation || lostGeneration ? <ConfirmButton
                title="Disconnect this league's results destination?"
                description="Automatic results will be skipped until a destination is configured. Pending creation attempts will be cancelled. Remote webhooks and delivery history are kept."
                confirmLabel="Disconnect" disabled={!canDisconnect}
                onConfirm={() => { if (ready && revision !== null) action.mutate({ kind: "disconnect", expectedRevision: revision }); }}
                trigger={<Button type="button" variant="destructive" size="sm" disabled={!canDisconnect}>Disconnect…</Button>} /> : null}
            </div>
            {data.destination && <p className="text-xs text-text-dim">A test posts a result embed filled with sample teams, exactly as a real result appears. It does not consume series-result deliveries.</p>}

            {currentTest && <div aria-live="polite" className="space-y-1">
              <p className="text-sm text-text-secondary">Last test: {resultsTestLabel(currentTest.status)}</p>
              {currentTest.revision !== revision && <p className="text-xs text-text-dim">This test used a previous saved revision.</p>}
              {testUncertain && <p className="text-xs text-text-secondary">Inspect Discord before starting another test. Checking the same request never resends it.</p>}
            </div>}
            {testToCheck && (testRequest || testUncertain) && <div className="space-y-2">
              {lostTest && <p className="text-sm text-text-secondary">The test response is unresolved. Inspect Discord and check this request&apos;s outcome.</p>}
              <Button type="button" variant="outline" size="sm" disabled={working} onClick={() => action.mutate({ kind: "test", body: testToCheck })}>Check test request outcome</Button>
            </div>}
          </div>
          <p className="mt-2 text-xs text-text-dim">Changes apply to future results and never replay past ones.</p>
        </SettingsGroup>

        {revision === null && <Alert variant="warning"><AlertTitle>Configuration is unavailable</AlertTitle>
          <AlertDescription>The API did not supply a usable saved revision. Check again before editing.</AlertDescription></Alert>}

        {lostGeneration && generationRequest && <Alert variant="warning">
          <AlertTitle>Creation response unresolved</AlertTitle>
          <AlertDescription>
            <p>Check the recorded attempt and Discord before creating again. This check resends the original request ID, channel and name.</p>
            <Button type="button" variant="outline" size="sm" disabled={working}
              onClick={() => action.mutate({ kind: "generate", body: generationRequest })}>Check creation request outcome</Button>
          </AlertDescription>
        </Alert>}

        <SettingsGroup title={data.destination ? "Replace destination" : "Set up a destination"}>
          <div className="mb-5">
            <RadioOptions name="results-setup" options={SETUP_MODES} value={mode} disabled={working} onChange={setMode} />
          </div>
          {pendingCreation ? (
            <p className="text-sm text-text-secondary">Resolve the recorded creation below, or disconnect to cancel it, before assigning another destination.</p>
          ) : mode === "generate" ? <>
            <SettingsRow label="Channel" hint="Only ordinary text channels in the CCS server are listed. The bot needs View Channel and Manage Webhooks in the channel.">
              {field => <ResultsChannelPicker id={field.id} describedBy={field["aria-describedby"]} channels={channelList}
                value={eligibleChannel ? eligibleChannel.id : null} onChange={setChannelId}
                disabled={!canConfigure || !channelsUsable || channelList.length === 0} />}
            </SettingsRow>
            {channels.isPending && <p role="status" className="mb-3 text-sm text-text-dim">Loading channels…</p>}
            <ErrorLine message={channels.error ? errorMessage(channels.error) : channels.isSuccess && !channels.data ? "The channel list is unavailable." : null} />
            {channels.data?.channels.length === 0 && <p className="mb-3 text-sm text-text-dim">No eligible text channels were returned.</p>}
            {defaultName !== null && <SettingsRow label="Webhook name" error={nameError}
              hint={`Shown as the sender on every result post. Up to ${RESULTS_WEBHOOK_NAME_MAX} characters.`}>
              {field => <Input {...field} value={name} maxLength={RESULTS_WEBHOOK_NAME_MAX} autoComplete="off"
                disabled={!canConfigure} onChange={event => setWebhookName(event.target.value)} />}
            </SettingsRow>}
            <Button type="button" disabled={!canGenerate} onClick={generate}>
              {working && action.variables?.kind === "generate" ? "Creating…" : data.destination ? "Create replacement" : "Create webhook"}
            </Button>
          </> : <>
            <SettingsRow label="Discord webhook link" hint="Paste the canonical https://discord.com/api/webhooks/ link without query parameters or a fragment. Discord validates its guild and channel before replacing the destination. The link is cleared after saving."
              error={webhookUrl.trim() !== "" && !validUrl ? "Enter a canonical HTTPS Discord webhook link." : null}>
              {field => <Input {...field} type="password" value={webhookUrl} autoComplete="off" spellCheck={false}
                disabled={!canConfigure} onChange={event => setWebhookUrl(event.target.value)} />}
            </SettingsRow>
            <Button type="button" disabled={!canConfigure || !validUrl} onClick={() => {
              if (canConfigure && revision !== null && validUrl) action.mutate({ kind: "save", expectedRevision: revision });
            }}>{working && action.variables?.kind === "save" ? "Saving…" : "Save destination"}</Button>
          </>}
        </SettingsGroup>

        <ResultsOperations conf={conf} viewerId={viewerId} operations={data.operations}
          channels={channelList} working={working}
          onRecheck={operationId => action.mutate({ kind: "recheck", operationId })} />
      </>}
    </div>
  );
}
