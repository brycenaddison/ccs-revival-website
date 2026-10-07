/**
 * Adopting an existing Discord category as this league's bot-managed text or voice category.
 *
 * Offered for a kind whose recorded categories are all confirmed missing, or that has none recorded
 * (before the first Provision, say), so new team channels go into a category that already exists.
 * The API does not list server categories, so the admin pastes the category's ID. Adoption makes
 * the category bot-managed, so the confirmation says Teardown will delete it. Every `409` (not a
 * category, recorded elsewhere, a pending claim, a recorded category that still exists, a change
 * meanwhile) renders its sentence verbatim and refreshes status, since nothing was written.
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { FormDialog } from "../../FormDialog";
import { ErrorLine } from "../../admin/adminUi";
import { SettingsRow } from "../../settings/SettingsSection";
import {
  adoptTeamDiscordCategory,
  ApiError,
  DISCORD_SNOWFLAKE,
  errorMessage,
  TEAM_DISCORD_ADOPTABLE_CATEGORIES,
  type TeamDiscordAdoptableCategory,
  type TeamDiscordStatus,
} from "../../../lib/api";
import { DiscordResourceBadge } from "./DiscordResourceBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const KIND_NAME: Record<TeamDiscordAdoptableCategory, string> = { category: "text", voice_category: "voice" };

export function CategoryAdoption({ conf, status, onDone }: {
  conf: string;
  /** Shown only to league admins while Discord is connected. */
  status: TeamDiscordStatus;
  onDone: () => Promise<unknown>;
}) {
  const [kind, setKind] = useState<TeamDiscordAdoptableCategory | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const adopt = useMutation({
    mutationFn: (input: { kind: TeamDiscordAdoptableCategory; categoryId: string }) =>
      adoptTeamDiscordCategory(conf, input.kind, input.categoryId),
    retry: false,
    onSuccess: async (result, input) => {
      setKind(null);
      setCategoryId("");
      await onDone();
      toast.success(result.status === "unchanged"
        ? `That ${KIND_NAME[input.kind]} category was already recorded.`
        : `Adopted the ${KIND_NAME[input.kind]} category.`);
    },
    onError: async error => {
      if (error instanceof ApiError && error.status === 409) await onDone();
    },
  });

  const candidates = TEAM_DISCORD_ADOPTABLE_CATEGORIES.flatMap(value => {
    const recorded = status.categories.filter(category => category.kind === value);
    return recorded.every(category => category.diagnostic === "missing") ? [{ kind: value, resource: recorded[0] ?? null }] : [];
  });
  const trimmed = categoryId.trim();
  const invalid = trimmed !== "" && !DISCORD_SNOWFLAKE.test(trimmed);

  const close = (next: boolean) => {
    if (next || adopt.isPending) return;
    setKind(null);
    setCategoryId("");
    adopt.reset();
  };

  return (
    <>
      {candidates.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-text-secondary">
            Provision creates a category for new channels when this league has none. To use a category
            that already exists in Discord, adopt it first.
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {candidates.map(candidate => (
              <span key={candidate.kind} className="flex flex-wrap items-center gap-2">
                <DiscordResourceBadge kind={candidate.kind} resource={candidate.resource} />
                <Button variant="outline" size="sm" type="button" onClick={() => setKind(candidate.kind)}>
                  Adopt existing {KIND_NAME[candidate.kind]} category…
                </Button>
              </span>
            ))}
          </div>
        </div>
      )}

      <FormDialog
        open={kind !== null}
        onOpenChange={close}
        title={`Adopt an existing ${kind ? KIND_NAME[kind] : ""} category?`}
        description={
          <>
            The category becomes bot-managed: new team channels go into it, and Teardown will delete it.
            Channels still inside it then move to the top level of the server; they are not deleted.
          </>
        }
        footer={
          <>
            <Button variant="outline" disabled={adopt.isPending} onClick={() => close(false)}>Cancel</Button>
            <Button
              disabled={adopt.isPending || !kind || trimmed === "" || invalid}
              onClick={() => { if (kind) adopt.mutate({ kind, categoryId: trimmed }); }}
            >
              {adopt.isPending ? "Adopting…" : "Adopt category"}
            </Button>
          </>
        }
      >
        <SettingsRow
          label="Category ID"
          hint="In Discord, turn on Developer Mode, then right-click the category and choose Copy Category ID."
          error={invalid ? "A Discord category ID is 17 to 20 digits." : null}
        >
          {field => (
            <Input {...field} value={categoryId} inputMode="numeric" autoComplete="off" disabled={adopt.isPending} className="font-mono"
              onChange={event => { setCategoryId(event.target.value); if (adopt.error) adopt.reset(); }} />
          )}
        </SettingsRow>
        <ErrorLine message={adopt.error ? errorMessage(adopt.error) : null} />
      </FormDialog>
    </>
  );
}
