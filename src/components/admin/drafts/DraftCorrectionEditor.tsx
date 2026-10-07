/**
 * Site Admin > Drafts > Correct draft: one game's stored draft beside the game Riot recorded.
 *
 * The admin sets each side's five picks in pick order, five ban slots (a slot may be skipped), first
 * pick and all ten roles, and gives a reason. Roles are required because a save completes role
 * confirmation. The save is revision-checked against the read; a 409 reloads the editor and the
 * admin corrects again on top of the new draft. There is no revert.
 *
 * The form is keyed by the read's revision, so it resets only when the stored draft changes.
 * Fearless repeats save anyway and come back as warnings, held here so they outlive that reset.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { BackButton, ErrorLine } from "../adminUi";
import { ChampionIcon } from "../../ChampionIcon";
import { RadioOptions } from "../../RadioOptions";
import { SettingsRow } from "../../settings/SettingsSection";
import { DRAFT_MODE_LABEL, DRAFT_ROLE_LABEL, DRAFT_ROLE_STATUS_LABEL, draftErrorText } from "../../drafts/draftLabels";
import { ChampionRow, DraftDifference, DraftSideLabel, useDraftTeamName } from "./DraftDifference";
import type { DraftGameRef } from "./draftCorrectionLink";
import {
  correctionInput,
  correctionProblems,
  formFromPlayed,
  initialForm,
  playedRoles,
  swapsFor,
  withPick,
  type CorrectionForm,
  type SideSwap,
} from "./draftCorrection";
import { useChampions } from "../../../hooks/useChampions";
import type { ChampionLookup } from "../../../lib/championData";
import { queries, queryRoots } from "../../../lib/queries";
import { fmtKickoff } from "../../../lib/utils";
import {
  draftRefusal,
  roleLabel,
  saveDraftCorrection,
  DRAFT_CORRECTION_REASON_MAX,
  DRAFT_ROLES,
  DRAFT_SIDES,
  type DraftCorrectionInput,
  type DraftCorrectionWarning,
  type DraftEditor,
  type DraftPlayedTeam,
  type DraftSide,
} from "../../../lib/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

/** The ban picker's value for a skipped slot. */
const SKIPPED = "skipped";

export function DraftCorrectionEditor({ viewerId, target, onBack }: {
  viewerId: number | null;
  target: DraftGameRef;
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const editor = useQuery(queries.draftEditor(viewerId, target.drafterSeriesId, target.game));
  const [warnings, setWarnings] = useState<DraftCorrectionWarning[]>([]);
  const save = useMutation({
    mutationFn: (input: DraftCorrectionInput) => saveDraftCorrection(target.drafterSeriesId, target.game, input),
    onMutate: () => setWarnings([]),
    onSuccess: async result => {
      setWarnings(result.warnings);
      // The game page's draft and the match page's markers read the corrected game too.
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryRoots.drafts }),
        qc.invalidateQueries({ queryKey: queryRoots.game }),
        qc.invalidateQueries({ queryKey: queryRoots.schedule }),
      ]);
      toast.success("Draft corrected. Statistics update on their next refresh, about 30 seconds from now.");
    },
    onError: async error => {
      if (draftRefusal(error)?.category === "draft_revision_conflict") {
        await qc.invalidateQueries({ queryKey: queryRoots.drafts });
      }
    },
  });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <BackButton onClick={onBack}>Back to issues</BackButton>
      </div>
      {editor.isPending ? (
        <p role="status" className="text-sm text-text-dim">Loading the draft…</p>
      ) : editor.isError ? (
        <ErrorLine message={draftErrorText(editor.error)} />
      ) : (
        <>
          <Summary editor={editor.data} />
          {warnings.length > 0 && <Warnings warnings={warnings} />}
          <CorrectionFormView
            key={editor.data.draft?.updatedAt ?? "new"}
            editor={editor.data}
            saving={save.isPending}
            onSave={input => save.mutate(input)}
          />
          <ErrorLine message={save.isError ? draftErrorText(save.error) : null} />
        </>
      )}
    </div>
  );
}

function Summary({ editor }: { editor: DraftEditor }) {
  const draft = editor.draft;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="font-display text-[22px] text-text-bright">Game {editor.game} draft</h3>
        {editor.draftMode && <Badge variant="muted">{DRAFT_MODE_LABEL[editor.draftMode].label}</Badge>}
        {draft?.roleStatus && <Badge variant="muted">{DRAFT_ROLE_STATUS_LABEL[draft.roleStatus]}</Badge>}
        {!draft && <Badge variant="muted">No draft stored</Badge>}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {editor.scheduleMatchId !== null && (
          <Link to={`/match/${editor.scheduleMatchId}`} className="text-brand hover:underline">Match</Link>
        )}
        {editor.played && (
          <Link to={`/game/${encodeURIComponent(editor.played.matchId)}`} className="text-brand hover:underline">Played game</Link>
        )}
        {editor.url && (
          <a href={editor.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline">
            Draft room
            <ExternalLink size={12} aria-hidden="true" />
          </a>
        )}
        <span className="text-text-dim">{editor.conf}</span>
      </div>
      {draft?.correction && (
        <p className="text-xs text-text-secondary">
          Corrected {fmtKickoff(draft.correction.correctedAt)}
          {draft.correction.reason && <>: {draft.correction.reason}</>}
        </p>
      )}
      <PlayedGame editor={editor} />
    </div>
  );
}

function PlayedGame({ editor }: { editor: DraftEditor }) {
  const champions = useChampions();
  if (!editor.played) return <p className="text-xs text-text-dim">No played game is recorded for this game number.</p>;
  return (
    <div className="rounded-md border border-border bg-bg3 p-3">
      <h4 className="mb-2 font-heading text-sm text-text-secondary">
        Played game
        {editor.played.championsMatch && <span className="ml-2 text-xs text-ccs-green">Matches the draft</span>}
      </h4>
      <ul className="flex flex-col gap-2">
        {editor.played.teams.map((team, i) => (
          <PlayedTeamRow key={team.teamId ?? i} team={team} conf={editor.conf} champions={champions} />
        ))}
      </ul>
      {editor.difference.length > 0 && (
        <div className="mt-3 border-t border-border pt-3">
          <DraftDifference difference={editor.difference} conf={editor.conf} />
        </div>
      )}
    </div>
  );
}

function PlayedTeamRow({ team, conf, champions }: { team: DraftPlayedTeam; conf: string; champions: ChampionLookup | null }) {
  const name = useDraftTeamName(conf, team.teamId);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="min-w-0 basis-full truncate font-heading text-xs text-text-bright sm:basis-40">{name ?? "Team"}</span>
      <ul className="flex flex-wrap items-center gap-2">
        {team.champions.map((c, i) => (
          <li key={`${c.championId ?? "none"}-${i}`} className="flex items-center gap-1">
            <ChampionIcon champion={c.championId} lookup={champions} size={22} tile className="flex" />
            <span className="text-[10px] text-text-dim">{roleLabel(c.role)}</span>
          </li>
        ))}
      </ul>
    </li>
  );
}

function Warnings({ warnings }: { warnings: readonly DraftCorrectionWarning[] }) {
  const champions = useChampions();
  return (
    <Alert variant="warning">
      <AlertDescription>
        <p>Saved. These champions were also picked elsewhere in this fearless series:</p>
        <ul className="mt-1 flex flex-col gap-1">
          {warnings.map(w => (
            <li key={`${w.championId}-${w.game}`} className="flex items-center gap-2">
              <ChampionIcon champion={w.championId} lookup={champions} size={18} showName />
              <span>also picked in game {w.game}</span>
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

function CorrectionFormView({ editor, saving, onSave }: {
  editor: DraftEditor;
  saving: boolean;
  onSave: (input: DraftCorrectionInput) => void;
}) {
  const champions = useChampions();
  const [form, setForm] = useState<CorrectionForm>(() => initialForm(editor));
  const [reason, setReason] = useState("");
  const problems = correctionProblems(form, editor, reason);
  const input = correctionInput(form, editor, reason);
  const swaps = swapsFor(form, editor.difference);
  const playedTeams = editor.played?.teams ?? [];
  const teamOf = (side: DraftSide) => editor.difference.find(d => d.side === side)?.teamId ?? null;

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={event => {
        event.preventDefault();
        if (input) onSave(input);
      }}
    >
      {swaps.length > 0 && <MatchPlayed swaps={swaps} conf={editor.conf} teamOf={teamOf} champions={champions} disabled={saving} onApply={setForm} form={form} />}
      {!editor.draft && playedTeams.length === 2 && (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => setForm(current => formFromPlayed(current, playedTeams))}>
            Start from the played game
          </Button>
          <span className="text-xs text-text-dim">
            Fills each side with a played team in role order. Set the real pick order and sides before saving.
          </span>
        </div>
      )}

      <SettingsRow
        label="First pick"
        hint={editor.firstSelection ? undefined : "This series does not allow first selection, so blue picks first."}
      >
        <RadioOptions
          name="first-pick"
          options={DRAFT_SIDES.map(side => ({ value: side, label: side === "blue" ? "Blue draft" : "Red draft" }))}
          value={form.firstPick}
          disabled={saving}
          onChange={side => setForm(current => ({ ...current, firstPick: side }))}
        />
      </SettingsRow>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {DRAFT_SIDES.map(side => (
          <SideEditor
            key={side}
            side={side}
            conf={editor.conf}
            teamId={teamOf(side)}
            form={form}
            champions={champions}
            disabled={saving}
            onChange={setForm}
            onPlayedRoles={() => setForm(current => ({
              ...current,
              roles: { ...current.roles, [side]: playedRoles(playedTeams, current.picks[side]) },
            }))}
            canUsePlayedRoles={playedTeams.length > 0}
          />
        ))}
      </div>

      <SettingsRow label="Reason" hint={`Recorded with the correction. Up to ${DRAFT_CORRECTION_REASON_MAX} characters.`}>
        {field => (
          <Textarea
            {...field}
            value={reason}
            maxLength={DRAFT_CORRECTION_REASON_MAX}
            disabled={saving}
            onChange={event => setReason(event.target.value)}
            placeholder="Riot shows Ahri in mid, not Lux"
          />
        )}
      </SettingsRow>

      {problems.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-xs text-text-secondary" aria-label="Before saving">
          {problems.map(problem => <li key={problem}>{problem}</li>)}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
        <Button type="submit" disabled={saving || input === null}>{saving ? "Saving…" : "Save correction"}</Button>
        <span className="text-xs text-text-dim">A correction can only be undone by correcting again.</span>
      </div>
    </form>
  );
}

function championOptions(
  champions: ChampionLookup | null,
  taken: ReadonlySet<number>,
  current: number | null,
): ComboboxOption[] {
  return (champions?.all() ?? []).map(champion => ({
    value: String(champion.key),
    label: champion.name,
    keywords: [champion.id],
    // Listed rather than hidden, so a search for a champion used elsewhere says why it is unavailable.
    disabled: champion.key !== current && taken.has(champion.key),
    detail: champion.key !== current && taken.has(champion.key) ? "Already in this draft" : undefined,
  }));
}

function SideEditor({ side, conf, teamId, form, champions, disabled, onChange, onPlayedRoles, canUsePlayedRoles }: {
  side: DraftSide;
  conf: string;
  teamId: number | null;
  form: CorrectionForm;
  champions: ChampionLookup | null;
  disabled: boolean;
  onChange: (update: (current: CorrectionForm) => CorrectionForm) => void;
  onPlayedRoles: () => void;
  canUsePlayedRoles: boolean;
}) {
  const taken = useMemo(
    () => new Set(DRAFT_SIDES.flatMap(s => [...form.picks[s], ...form.bans[s]]).filter((id): id is number => id !== null)),
    [form],
  );
  const nameOf = (id: number) => champions?.get(id)?.name ?? `Champion ${id}`;
  const sidePicks = form.picks[side].filter((id): id is number => id !== null);
  const sideLabel = side === "blue" ? "Blue" : "Red";

  return (
    <fieldset className="flex min-w-0 flex-col gap-3 rounded-md border border-border p-3" disabled={disabled}>
      <legend className="px-1"><DraftSideLabel side={side} conf={conf} teamId={teamId} /></legend>

      <div>
        <h5 className="mb-1.5 font-heading text-[11px] text-text-muted">Picks, in this side&apos;s pick order</h5>
        <ol className="flex flex-col gap-1.5">
          {form.picks[side].map((id, slot) => (
            <li key={slot} className="flex items-center gap-2">
              <span className="w-4 shrink-0 text-right font-mono text-[10px] text-text-dim">{slot + 1}</span>
              <ChampionIcon champion={id} lookup={champions} size={24} tile className="flex w-6 shrink-0" decorative />
              <Combobox
                options={championOptions(champions, taken, id)}
                value={id === null ? null : String(id)}
                onChange={value => onChange(current => withPick(current, side, slot, Number(value)))}
                disabled={disabled || champions === null}
                aria-label={`${sideLabel} pick ${slot + 1}`}
                placeholder="Choose a champion"
                searchPlaceholder="Search champions"
                emptyText="No champion matches."
                className="min-w-0 flex-1"
              />
            </li>
          ))}
        </ol>
      </div>

      <div>
        <h5 className="mb-1.5 font-heading text-[11px] text-text-muted">Bans, in slot order</h5>
        <ol className="flex flex-col gap-1.5">
          {form.bans[side].map((id, slot) => (
            <li key={slot} className="flex items-center gap-2">
              <span className="w-4 shrink-0 text-right font-mono text-[10px] text-text-dim">{slot + 1}</span>
              <ChampionIcon champion={id ?? -1} lookup={champions} size={24} tile className="flex w-6 shrink-0 opacity-60" decorative />
              <Combobox
                options={[{ value: SKIPPED, label: "Skipped" }, ...championOptions(champions, taken, id)]}
                value={id === null ? SKIPPED : String(id)}
                onChange={value => onChange(current => ({
                  ...current,
                  bans: { ...current.bans, [side]: current.bans[side].map((ban, i) => (i === slot ? (value === SKIPPED ? null : Number(value)) : ban)) },
                }))}
                disabled={disabled || champions === null}
                aria-label={`${sideLabel} ban ${slot + 1}`}
                searchPlaceholder="Search champions"
                emptyText="No champion matches."
                className="min-w-0 flex-1"
              />
            </li>
          ))}
        </ol>
      </div>

      <div>
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <h5 className="font-heading text-[11px] text-text-muted">Roles</h5>
          {canUsePlayedRoles && (
            <Button type="button" variant="quiet" size="inline" onClick={onPlayedRoles}>Use played roles</Button>
          )}
        </div>
        <p className="mb-2 text-xs text-text-dim">Required. Saving confirms all five roles for this side.</p>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {DRAFT_ROLES.map(role => (
            <label key={role} className="flex items-center gap-2 text-xs text-text">
              <span className="w-14 shrink-0">{DRAFT_ROLE_LABEL[role]}</span>
              <NativeSelect
                value={form.roles[side][role] === null ? "" : String(form.roles[side][role])}
                onChange={event => {
                  const value = event.target.value === "" ? null : Number(event.target.value);
                  onChange(current => ({ ...current, roles: { ...current.roles, [side]: { ...current.roles[side], [role]: value } } }));
                }}
              >
                <NativeSelectOption value="">Choose</NativeSelectOption>
                {sidePicks.map(id => <NativeSelectOption key={id} value={String(id)}>{nameOf(id)}</NativeSelectOption>)}
              </NativeSelect>
            </label>
          ))}
        </div>
      </div>
    </fieldset>
  );
}

/**
 * "Match the played game": each side's drafted-only picks replaced by its played-only champions.
 * With more than one swap on a side the admin confirms which slot each goes in, because pick order
 * drives blind pick and turn statistics.
 */
function MatchPlayed({ swaps, conf, teamOf, champions, disabled, form, onApply }: {
  swaps: readonly SideSwap[];
  conf: string;
  teamOf: (side: DraftSide) => number | null;
  champions: ChampionLookup | null;
  disabled: boolean;
  form: CorrectionForm;
  onApply: (form: CorrectionForm) => void;
}) {
  // Per side, the replacement chosen for each drafted-only slot. Served order until the admin
  // re-pairs them, and again whenever editing the picks changes how many slots there are.
  const [choices, setChoices] = useState<Partial<Record<DraftSide, number[]>>>({});
  const nameOf = (id: number | null) => (id === null ? "Empty" : champions?.get(id)?.name ?? `Champion ${id}`);
  const chosen = (swap: SideSwap) => {
    const picked = choices[swap.side];
    return picked && picked.length === swap.slots.length ? picked : swap.slots.map((_, i) => swap.replacements[i]);
  };
  const conflicting = swaps.some(swap => new Set(chosen(swap)).size !== chosen(swap).length);

  const apply = () => {
    let next = form;
    for (const swap of swaps) {
      chosen(swap).forEach((championId, i) => { next = withPick(next, swap.side, swap.slots[i], championId); });
    }
    onApply(next);
  };

  return (
    <div className="rounded-md border border-border p-3">
      <h4 className="mb-1 font-heading text-sm text-text-secondary">Match the played game</h4>
      <p className="mb-2 text-xs text-text-dim">
        Replaces each side&apos;s drafted-only picks with the champions its team played. Roles assigned to a replaced
        pick move to its replacement.
      </p>
      <ul className="flex flex-col gap-2">
        {swaps.map(swap => (
          <li key={swap.side} className="flex flex-col gap-1.5">
            <DraftSideLabel side={swap.side} conf={conf} teamId={teamOf(swap.side)} />
            {swap.uneven && (
              <p className="text-xs text-ccs-orange">
                The drafted-only and played-only counts differ. Place the rest by hand.
              </p>
            )}
            {swap.slots.map((slot, i) => (
              <label key={slot} className="flex flex-wrap items-center gap-2 text-xs text-text">
                <span>Pick {slot + 1}: replace {nameOf(form.picks[swap.side][slot])} with</span>
                {swap.replacements.length === 1 ? (
                  <ChampionRow ids={swap.replacements} champions={champions} label={nameOf(swap.replacements[0])} />
                ) : (
                  <NativeSelect
                    value={String(chosen(swap)[i])}
                    disabled={disabled}
                    onChange={event => {
                      const value = Number(event.target.value);
                      setChoices(current => ({ ...current, [swap.side]: chosen(swap).map((id, j) => (j === i ? value : id)) }));
                    }}
                  >
                    {swap.replacements.map(id => <NativeSelectOption key={id} value={String(id)}>{nameOf(id)}</NativeSelectOption>)}
                  </NativeSelect>
                )}
              </label>
            ))}
          </li>
        ))}
      </ul>
      {conflicting && <p className="mt-2 text-xs text-ccs-red">Each played champion can fill only one slot.</p>}
      <Button type="button" variant="outline" size="sm" className="mt-3" disabled={disabled || conflicting} onClick={apply}>
        Apply to the form
      </Button>
    </div>
  );
}
