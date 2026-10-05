/**
 * Site Admin > Tournament codes. The pick type shares /admin/settings' version with Predictions.
 * Keep the mutation above the version-keyed form so a refresh cannot lose its pending/error state.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RadioOptions } from "../RadioOptions";
import { SettingsGroup, SettingsRow } from "../settings/SettingsSection";
import { ErrorLine } from "./adminUi";
import { useAuth } from "../../lib/authContext";
import {
  ApiError,
  errorMessage,
  saveTournamentCodePickType,
  TOURNAMENT_CODE_PICK_TYPES,
  type PredictionSiteSettings,
  type TournamentCodePickType,
} from "../../lib/api";
import { queries, queryRoots } from "../../lib/queries";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

const PICK_TYPE_LABEL: Record<TournamentCodePickType, string> = {
  BLIND_PICK: "Blind pick",
  TOURNAMENT_DRAFT: "Tournament draft",
};

export function TournamentCodesSection() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const settings = useQuery(queries.predictionSiteSettings(profile?.id ?? null));
  const save = useMutation({
    mutationFn: ({ pickType, version }: { pickType: TournamentCodePickType; version: number }) =>
      saveTournamentCodePickType(pickType, version),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryRoots.predictions });
      toast.success("Tournament code settings saved.");
    },
    onError: async error => {
      if (error instanceof ApiError && error.status === 409) {
        await qc.invalidateQueries({ queryKey: queryRoots.predictions });
      }
    },
  });

  if (settings.isPending) return <p role="status" className="text-sm text-text-dim">Loading tournament code settings…</p>;
  if (settings.isError) return (
    <Alert variant="destructive">
      <AlertDescription>{errorMessage(settings.error)}</AlertDescription>
    </Alert>
  );

  return (
    <SettingsGroup title="New codes">
      <PickTypeForm
        key={settings.data.version ?? "unknown"}
        settings={settings.data}
        saving={save.isPending}
        onSave={(pickType, version) => save.mutate({ pickType, version })}
      />
      <ErrorLine message={save.isError ? errorMessage(save.error) : null} />
    </SettingsGroup>
  );
}

function PickTypeForm({ settings, saving, onSave }: {
  settings: PredictionSiteSettings;
  saving: boolean;
  onSave: (pickType: TournamentCodePickType, version: number) => void;
}) {
  const [pickType, setPickType] = useState<TournamentCodePickType | null>(settings.tournamentCodePickType);
  const available = settings.tournamentCodePickType !== null && settings.version !== null;
  const dirty = pickType !== settings.tournamentCodePickType;

  return (
    <form onSubmit={event => {
      event.preventDefault();
      if (!available || saving || !dirty || pickType === null || settings.version === null) return;
      onSave(pickType, settings.version);
    }}>
      <SettingsRow
        label="Pick type"
        hint="Applies immediately to codes generated after saving."
        error={!available ? "The API did not supply a supported pick type and settings version. Reload after the API is updated." : null}
      >
        <RadioOptions<TournamentCodePickType>
          name="tournament-code-pick-type"
          options={TOURNAMENT_CODE_PICK_TYPES.map(value => ({ value, label: PICK_TYPE_LABEL[value] }))}
          value={pickType ?? ("" as TournamentCodePickType)}
          disabled={saving || !available}
          onChange={setPickType}
        />
      </SettingsRow>
      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border pt-5">
        <Button type="submit" disabled={saving || !available || !dirty || pickType === null}>
          {saving ? "Saving…" : "Save settings"}
        </Button>
        {dirty && !saving && (
          <Button type="button" variant="outline" onClick={() => setPickType(settings.tournamentCodePickType)}>
            Discard changes
          </Button>
        )}
      </div>
    </form>
  );
}
