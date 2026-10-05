/**
 * Private league results destinations, restricted to conference admin or site admin.
 * Credentials are write-only; reads expose snapshots, not live Discord connectivity.
 * Generation/test UUIDs pin one attempt forever. Recheck recovers the original creation
 * from audit evidence without creating again. Changes never replay historical results.
 */
import { credentialedRequest } from "./credentialed";
import { type RequestOpts } from "./http";
import { DISCORD_SNOWFLAKE } from "./teamDiscord";

export const RESULTS_WEBHOOK_URL = /^https:\/\/discord\.com\/api\/webhooks\/[0-9]{17,20}\/[A-Za-z0-9_-]{60,200}$/;
/** The backend reserves the top PostgreSQL integer value so a write can increment its revision. */
const RESULTS_REVISION_MAX = 2147483646;
export const RESULTS_OPERATION_STATUSES = ["creating", "ready", "uncertain", "failed", "active", "cancelled"] as const;
export type ResultsOperationStatus = (typeof RESULTS_OPERATION_STATUSES)[number];

export interface ResultsOperation {
  id: string;
  conf: string | null;
  requestId: string | null;
  expectedRevision: number | null;
  channelId: string | null;
  guildId: string | null;
  status: ResultsOperationStatus | null;
  webhookId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ResultsDestination {
  webhookId: string | null;
  guildId: string | null;
  channelId: string | null;
  channelName: string | null;
  webhookName: string | null;
  source: "managed" | "external" | null;
  updatedAt: string | null;
}

export interface ResultsTest {
  requestId: string | null;
  /** The API deliberately leaves test outcomes open-ended. Unknown values need inspection. */
  status: string | null;
}

export interface ResultsWebhookStatus {
  conf: string | null;
  revision: number | null;
  destination: ResultsDestination | null;
  operations: ResultsOperation[];
  lastTest: (ResultsTest & { revision: number | null; webhookId: string | null; updatedAt: string | null }) | null;
}

export interface ResultsChannel {
  id: string;
  name: string | null;
  canGenerate: boolean;
  assignedConf: string | null;
  available: boolean;
}

export interface ResultsChannels {
  guildId: string | null;
  channels: ResultsChannel[];
}

export interface ResultsTestInput { expectedRevision: number; requestId: string }
export interface ResultsGenerateInput extends ResultsTestInput { channelId: string }

type Raw = Record<string, unknown>;
const raw = (v: unknown): Raw => v && typeof v === "object" && !Array.isArray(v) ? v as Raw : {};
const str = (v: unknown): string | null => typeof v === "string" ? v : null;
const snowflake = (v: unknown): string | null => typeof v === "string" && DISCORD_SNOWFLAKE.test(v) ? v : null;
const revision = (v: unknown): number | null => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= RESULTS_REVISION_MAX ? v : null;
const rows = (v: unknown): unknown[] => Array.isArray(v) ? v : [];

function mapOperation(v: unknown): ResultsOperation | null {
  const r = raw(v);
  const id = str(r.id);
  if (!id) return null;
  return {
    id, conf: str(r.conf), requestId: str(r.requestId), expectedRevision: revision(r.expectedRevision),
    channelId: snowflake(r.channelId), guildId: snowflake(r.guildId), webhookId: snowflake(r.webhookId),
    status: RESULTS_OPERATION_STATUSES.find(s => s === r.status) ?? null,
    createdAt: str(r.createdAt), updatedAt: str(r.updatedAt),
  };
}

function mapTest(v: unknown): ResultsTest {
  const r = raw(v);
  return { requestId: str(r.requestId), status: str(r.status) };
}

function mapStatus(v: unknown): ResultsWebhookStatus | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const r = raw(v);
  const d = raw(r.destination);
  const t = raw(r.lastTest);
  return {
    conf: str(r.conf), revision: revision(r.revision),
    destination: r.destination && typeof r.destination === "object" ? {
      webhookId: snowflake(d.webhookId), guildId: snowflake(d.guildId), channelId: snowflake(d.channelId),
      channelName: str(d.channelName), webhookName: str(d.webhookName),
      source: d.source === "managed" || d.source === "external" ? d.source : null,
      updatedAt: str(d.updatedAt),
    } : null,
    operations: rows(r.operations).flatMap(v => { const op = mapOperation(v); return op ? [op] : []; }),
    lastTest: r.lastTest && typeof r.lastTest === "object" ? {
      ...mapTest(t), revision: revision(t.revision), webhookId: snowflake(t.webhookId), updatedAt: str(t.updatedAt),
    } : null,
  };
}

const base = (conf: string) => `/tournaments/${encodeURIComponent(conf)}/discord/results`;

export async function resultsWebhookStatus(conf: string, opts?: RequestOpts): Promise<ResultsWebhookStatus | null> {
  return mapStatus(await credentialedRequest(base(conf), { cache: "no-store" }, opts));
}

export async function resultsWebhookChannels(conf: string, opts?: RequestOpts): Promise<ResultsChannels | null> {
  const value = await credentialedRequest(`${base(conf)}/channels`, { cache: "no-store" }, opts);
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const r = raw(value);
  return {
    guildId: snowflake(r.guildId),
    channels: rows(r.channels).flatMap(v => {
      const c = raw(v);
      const id = snowflake(c.id);
      return id ? [{ id, name: str(c.name), canGenerate: c.canGenerate === true,
        assignedConf: str(c.assignedConf), available: c.available === true }] : [];
    }),
  };
}

export async function resultsWebhookOperation(conf: string, operationId: string, opts?: RequestOpts): Promise<ResultsOperation | null> {
  return mapOperation(await credentialedRequest(`${base(conf)}/operations/${encodeURIComponent(operationId)}`, { cache: "no-store" }, opts));
}

export async function generateResultsWebhook(conf: string, body: ResultsGenerateInput): Promise<ResultsOperation> {
  const op = mapOperation(await credentialedRequest(`${base(conf)}/generate`, { method: "POST", body }));
  if (!op) throw new Error("The creation response is unavailable. Check the recorded attempt before creating again.");
  return op;
}

export async function saveResultsWebhook(conf: string, body: { expectedRevision: number; webhookUrl: string }): Promise<ResultsWebhookStatus> {
  const status = mapStatus(await credentialedRequest(base(conf), { method: "PUT", body }));
  if (!status) throw new Error("The saved results configuration is unavailable. Check again before making another change.");
  return status;
}

export async function disconnectResultsWebhook(conf: string, expectedRevision: number): Promise<ResultsWebhookStatus> {
  const status = mapStatus(await credentialedRequest(base(conf), { method: "DELETE", body: { expectedRevision } }));
  if (!status) throw new Error("The results configuration is unavailable. Check again to confirm the disconnect.");
  return status;
}

export async function recheckResultsWebhook(conf: string, operationId: string): Promise<ResultsOperation> {
  const op = mapOperation(await credentialedRequest(`${base(conf)}/operations/${encodeURIComponent(operationId)}/recheck`, { method: "POST", body: {} }));
  if (!op) throw new Error("The creation response is unavailable. Check the recorded attempt again.");
  return op;
}

export async function testResultsWebhook(conf: string, body: ResultsTestInput): Promise<ResultsTest> {
  const test = mapTest(await credentialedRequest(`${base(conf)}/test`, { method: "POST", body }));
  if (!test.requestId || !test.status) throw new Error("The test response is unavailable. Inspect Discord before sending another test.");
  return test;
}
