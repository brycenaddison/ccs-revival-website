import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ErrorLine } from "../../admin/adminUi";
import { SettingsGroup } from "../../settings/SettingsSection";
import { errorMessage, type ResultsChannel, type ResultsOperation } from "../../../lib/api";
import { queries } from "../../../lib/queries";
import { fmtLocalDateTime } from "../../../lib/utils";
import { RESULTS_OPERATION_LABEL, resultsOperationPending } from "./resultsLabels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function ResultsOperations({ conf, viewerId, operations, channels, working, onRecheck }: {
  conf: string;
  viewerId: number | null;
  operations: ResultsOperation[];
  channels: ResultsChannel[];
  working: boolean;
  onRecheck: (id: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const qc = useQueryClient();
  const options = queries.resultsWebhookOperation(conf, viewerId, selected);
  const inspected = useQuery(options);
  const inspect = (id: string) => {
    if (selected === id) void qc.invalidateQueries({ queryKey: options.queryKey });
    else setSelected(id);
  };

  if (operations.length === 0) return null;
  return (
    <SettingsGroup title="Creation attempts">
      <p className="mb-3 text-sm text-text-secondary">
        The latest 20 attempts are shown. Recheck uses the original creation&apos;s audit evidence
        and can activate it without creating another webhook. Unresolved attempts keep their channel
        reserved; missing audit evidence or permissions require investigation.
      </p>
      <div className="space-y-3">
        {operations.map(saved => {
          const op = saved.id === selected && inspected.data ? inspected.data : saved;
          const name = channels.find(c => c.id === op.channelId)?.name;
          const pending = resultsOperationPending(op);
          return (
            <div key={op.id} className="min-w-0 space-y-2 rounded-md border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-text-bright">{name ? `#${name}` : "Results channel"}</span>
                {op.requestedWebhookName && <span className="text-sm text-text-secondary">{op.requestedWebhookName}</span>}
                <Badge variant={op.status === "active" ? "default" : "muted"}>
                  {op.status ? RESULTS_OPERATION_LABEL[op.status] : "Unknown creation state"}
                </Badge>
                {op.updatedAt && <span className="text-xs text-text-dim">{fmtLocalDateTime(op.updatedAt)}</span>}
              </div>
              <p className="break-all font-mono text-xs text-text-dim">Attempt {op.id}</p>
              {op.channelId && <p className="break-all text-xs text-text-dim">Channel ID: {op.channelId}</p>}
              {pending && <p className="text-xs text-text-secondary">
                Inspect Discord before making another creation attempt. The current destination remains
                active until a replacement is confirmed.
              </p>}
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" disabled={working || (selected === op.id && inspected.isFetching)}
                  onClick={() => inspect(op.id)}>
                  {selected === op.id && inspected.isFetching ? "Checking…" : "Check status"}
                </Button>
                {pending && op.status !== null && <Button type="button" variant="outline" size="sm" disabled={working}
                  onClick={() => onRecheck(op.id)}>Recheck original creation</Button>}
              </div>
              {selected === op.id && <ErrorLine message={inspected.error ? errorMessage(inspected.error)
                : inspected.isSuccess && !inspected.data ? "This creation attempt is unavailable." : null} />}
            </div>
          );
        })}
      </div>
    </SettingsGroup>
  );
}
