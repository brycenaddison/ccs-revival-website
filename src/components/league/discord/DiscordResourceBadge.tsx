import type { TeamDiscordResource, TeamDiscordResourceKind } from "../../../lib/api";
import { Badge } from "@/components/ui/badge";
import { RESOURCE_LABEL } from "./discordLabels";

/** Exact-read uncertainty must remain visible even when a recorded create is still pending. */
export function DiscordResourceBadge({ kind, resource }: {
  kind: TeamDiscordResourceKind;
  resource: TeamDiscordResource | null;
}) {
  const label = RESOURCE_LABEL[kind];
  if (!resource) return <Badge variant="muted">{label}: not created</Badge>;
  if (resource.diagnostic === "uncertain") return <Badge variant="destructive">{label}: needs inspection</Badge>;
  if (resource.status === "pending" || resource.diagnostic === "pending") return <Badge variant="muted">{label}: creating</Badge>;
  if (resource.diagnostic === "missing" || resource.exists === false) return <Badge variant="destructive">{label}: missing in Discord</Badge>;
  if (resource.status === "archived") return <Badge variant="muted">{label}: archived</Badge>;
  return <Badge variant={resource.exists === null ? "muted" : "secondary"}>{label}</Badge>;
}
