/**
 * Site Admin > Drafts: the global Drafter settings, the repair inbox, and played games whose draft
 * is wrong or missing. Correcting a game replaces the section with its editor until Back.
 *
 * Settings are one revisioned document saved whole. A 409 means someone else saved first, so the
 * document reloads and the form resets to it. A change applies only to rooms created afterwards;
 * existing rooms keep the settings they were created with.
 */
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { toast } from "sonner";
import { ErrorLine } from "../adminUi";
import { ChampionIcon } from "../../ChampionIcon";
import { RadioOptions } from "../../RadioOptions";
import { SettingsGroup, SettingsRow } from "../../settings/SettingsSection";
import { DRAFT_MODE_LABEL, draftErrorText } from "../../drafts/draftLabels";
import { DraftCorrectionEditor } from "./DraftCorrectionEditor";
import { DraftGameIssuesPanel } from "./DraftGameIssuesPanel";
import { draftGameRefOf, withDraftGame, withoutDraftGame, type DraftGameRef } from "./draftCorrectionLink";
import { DraftIssuesPanel } from "./DraftIssuesPanel";
import { useChampions } from "../../../hooks/useChampions";
import { useAuth } from "../../../lib/authContext";
import { queries, queryRoots } from "../../../lib/queries";
import { fmtKickoff } from "../../../lib/utils";
import {
  ApiError,
  saveDraftSettings,
  DRAFT_DISABLED_CHAMPIONS_MAX,
  DRAFT_MODES,
  type DraftMode,
  type DraftSettings,
  type DraftSettingsInput,
} from "../../../lib/api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";

export function DraftsSection() {
  const { profile } = useAuth();
  const viewerId = profile?.id ?? null;
  // The open game is in the query so other pages can link straight to it (`draftCorrectionLink.ts`).
  const [params, setParams] = useSearchParams();
  const correcting = draftGameRefOf(params);
  const setCorrecting = (ref: DraftGameRef | null) =>
    setParams(current => (ref ? withDraftGame(current, ref) : withoutDraftGame(current)));
  if (correcting) {
    return (
      <DraftCorrectionEditor
        key={`${correcting.drafterSeriesId}-${correcting.game}`}
        viewerId={viewerId}
        target={correcting}
        onBack={() => setCorrecting(null)}
      />
    );
  }
  return (
    <div className="flex flex-col gap-8">
      <SettingsGroup title="Settings for new rooms"><Settings viewerId={viewerId} /></SettingsGroup>
      <SettingsGroup title="Issues"><DraftIssuesPanel viewerId={viewerId} /></SettingsGroup>
      <SettingsGroup title="Game issues"><DraftGameIssuesPanel viewerId={viewerId} onCorrect={setCorrecting} /></SettingsGroup>
    </div>
  );
}

function Settings({ viewerId }: { viewerId: number | null }) {
  const qc = useQueryClient();
  const settings = useQuery(queries.draftSettings(viewerId));
  // Owned here rather than by the form, which remounts on a new revision and would lose the error.
  const save = useMutation({
    mutationFn: (input: DraftSettingsInput) => saveDraftSettings(input),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryRoots.drafts });
      toast.success("Draft settings saved. Rooms created from now on use them.");
    },
    onError: async error => {
      if (error instanceof ApiError && error.status === 409) await qc.invalidateQueries({ queryKey: queryRoots.drafts });
    },
  });

  if (settings.isPending) return <p role="status" className="text-sm text-text-dim">Loading draft settings…</p>;
  if (settings.isError) return <ErrorLine message={draftErrorText(settings.error)} />;
  return (
    <>
      <SettingsForm
        key={settings.data.revision ?? "unknown"}
        settings={settings.data}
        saving={save.isPending}
        onSave={input => save.mutate(input)}
      />
      <ErrorLine message={save.isError ? draftErrorText(save.error) : null} />
    </>
  );
}

function SettingsForm({ settings, saving, onSave }: {
  settings: DraftSettings;
  saving: boolean;
  onSave: (input: DraftSettingsInput) => void;
}) {
  const champions = useChampions();
  const [mode, setMode] = useState<DraftMode | null>(settings.draftMode);
  const [firstSelection, setFirstSelection] = useState(settings.firstSelection);
  const [disabled, setDisabled] = useState<number[]>(settings.disabledChampionIds);

  const dirty = mode !== settings.draftMode
    || firstSelection !== settings.firstSelection
    || disabled.length !== settings.disabledChampionIds.length
    || disabled.some(id => !settings.disabledChampionIds.includes(id));
  const revision = settings.revision;
  const full = disabled.length >= DRAFT_DISABLED_CHAMPIONS_MAX;
  const options = (champions?.all() ?? [])
    .filter(champion => !disabled.includes(champion.key))
    .map(champion => ({ value: String(champion.key), label: champion.name, keywords: [champion.id] }));

  return (
    <form
      onSubmit={event => {
        event.preventDefault();
        if (mode === null || revision === null) return;
        onSave({ draftMode: mode, firstSelection, disabledChampionIds: disabled, expectedRevision: revision });
      }}
    >
      <SettingsRow
        label="Draft mode"
        error={settings.draftMode === null ? "The saved mode is one this site does not recognize. Choose a mode to replace it." : null}
      >
        <RadioOptions
          name="draft-mode"
          options={DRAFT_MODES.map(value => ({ value, ...DRAFT_MODE_LABEL[value] }))}
          // An unrecognized saved mode selects nothing until the admin picks one.
          value={mode ?? ("" as DraftMode)}
          disabled={saving}
          onChange={setMode}
        />
      </SettingsRow>

      <SettingsRow label="First selection" hint="When on, a team can take first pick from red side. When off, blue side always picks first.">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-text">
          <Checkbox checked={firstSelection} disabled={saving} onCheckedChange={value => setFirstSelection(value === true)} />
          Allow first selection
        </label>
      </SettingsRow>

      <SettingsRow
        label="Disabled champions"
        hint={champions === null
          ? "The champion list is unavailable, so champions cannot be added right now."
          : `Unavailable in every game of new rooms. Up to ${DRAFT_DISABLED_CHAMPIONS_MAX}.`}
      >
        <div className="flex flex-col gap-2">
          <Combobox
            options={options}
            value={null}
            onChange={value => setDisabled(current => [...current, Number(value)])}
            disabled={saving || champions === null || full}
            aria-label="Add a disabled champion"
            placeholder="Add a champion"
            searchPlaceholder="Search champions"
            emptyText="No champion matches."
            className="sm:w-80"
          />
          {disabled.length === 0 ? (
            <p className="text-xs text-text-dim">Every champion is available.</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {disabled.map(id => {
                const name = champions?.get(id)?.name ?? `Champion ${id}`;
                return (
                  <li key={id} className="flex items-center gap-1 rounded-md border border-border bg-bg3 py-0.5 pr-0.5 pl-1">
                    <ChampionIcon champion={id} lookup={champions} size={18} showName fallbackLabel={name} />
                    <Button
                      type="button"
                      variant="quiet"
                      size="inline"
                      disabled={saving}
                      aria-label={`Allow ${name}`}
                      onClick={() => setDisabled(current => current.filter(other => other !== id))}
                    >
                      <X size={12} aria-hidden="true" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SettingsRow>

      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border pt-5">
        <Button type="submit" disabled={!dirty || saving || mode === null || revision === null}>
          {saving ? "Saving…" : "Save settings"}
        </Button>
        {dirty && !saving && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setMode(settings.draftMode);
              setFirstSelection(settings.firstSelection);
              setDisabled(settings.disabledChampionIds);
            }}
          >
            Discard changes
          </Button>
        )}
        {settings.updatedAt && <span className="text-xs text-text-dim">Last saved {fmtKickoff(settings.updatedAt)}</span>}
      </div>
    </form>
  );
}
