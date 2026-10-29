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
 *
 * A delivery the importer refused (`proposal`) is shown beside the played game, each unresolved slot
 * with Drafter's raw value. With nothing stored the form starts from it; with a stored draft the
 * admin can switch to it. Any save resolves a webhook receipt for the game at once; a fetch receipt
 * resolves only once every game it carries is stored, so the toast claims only the first.
 *
 * Importing a players' room (a room the players made themselves) is pre-fill held here, not in the
 * revision-keyed form, because the form remounts after a save or a 409 and a mutation must start from
 * a component that outlives it. An import replaces the form in one step (the form is keyed by it too),
 * survives a 409 so the admin does not spend another Drafter request, and is cleared by a successful
 * save, after which the room is the game's stored link. The room link field decides `roomUrl`.
 */
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { BackButton, ErrorLine } from "../adminUi";
import { ChampionIcon } from "../../ChampionIcon";
import { RadioOptions } from "../../RadioOptions";
import { SettingsRow } from "../../settings/SettingsSection";
import {
  DRAFT_MODE_LABEL,
  DRAFT_ROLE_LABEL,
  DRAFT_ROLE_STATUS_LABEL,
  draftCodeText,
  draftErrorText,
  roomWarningText,
} from "../../drafts/draftLabels";
import { ChampionRow, DraftDifference, DraftSideLabel, useDraftTeamName } from "./DraftDifference";
import type { DraftGameRef } from "./draftCorrectionLink";
import {
  correctionInput,
  correctionProblems,
  formFromPlayed,
  formFromProposal,
  initialForm,
  playedRoles,
  roomLinkChoices,
  roomUrlFor,
  swapsFor,
  withPick,
  type CorrectionForm,
  type RoomLinkChoice,
  type SideSwap,
} from "./draftCorrection";
import { useChampions } from "../../../hooks/useChampions";
import type { ChampionLookup } from "../../../lib/championData";
import { queries, queryRoots } from "../../../lib/queries";
import { fmtKickoff } from "../../../lib/utils";
import {
  draftRefusal,
  importDraftRoom,
  roleLabel,
  saveDraftCorrection,
  DRAFT_CORRECTION_REASON_MAX,
  DRAFT_ROLES,
  DRAFT_SIDES,
  type DraftCorrectionInput,
  type DraftCorrectionWarning,
  type DraftEditor,
  type DraftPlayedTeam,
  type DraftProposal,
  type DraftProposalGame,
  type DraftProposalSlot,
  type DraftRoomImport,
  type DraftRoomImportInput,
  type DraftSide,
} from "../../../lib/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

/** The ban picker's value for a skipped slot. */
const SKIPPED = "skipped";

/** A players' room import held as pre-fill. `id` keys the form, so each import rebuilds it. */
interface HeldImport {
  id: number;
  room: DraftRoomImport;
  /** The link text it was imported from, so the room's game list follows only that link. */
  url: string;
}

export function DraftCorrectionEditor({ viewerId, target, backLabel, onBack }: {
  viewerId: number | null;
  target: DraftGameRef;
  backLabel: string;
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const editor = useQuery(queries.draftEditor(viewerId, target.drafterSeriesId, target.game));
  const [warnings, setWarnings] = useState<DraftCorrectionWarning[]>([]);
  const [imported, setImported] = useState<HeldImport | null>(null);
  // Writes nothing, so there is nothing to invalidate. A failure stays inline and is never retried,
  // since each attempt spends the shared Drafter budget.
  const importRoom = useMutation({
    mutationFn: (input: DraftRoomImportInput) => importDraftRoom(target.drafterSeriesId, target.game, input),
    onSuccess: (room, input) => setImported(current => ({ id: (current?.id ?? 0) + 1, room, url: input.url })),
  });
  const save = useMutation({
    mutationFn: ({ input }: { input: DraftCorrectionInput; proposal: DraftProposal | null; toPlayersRoom: boolean }) =>
      saveDraftCorrection(target.drafterSeriesId, target.game, input),
    onMutate: () => setWarnings([]),
    onSuccess: async (result, { proposal, toPlayersRoom }) => {
      setWarnings(result.warnings);
      // The game page's draft and the match page's markers read the corrected game too. The drafts
      // root also holds the inbox and fixture lists, which the resolved receipts leave.
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryRoots.drafts }),
        qc.invalidateQueries({ queryKey: queryRoots.game }),
        qc.invalidateQueries({ queryKey: queryRoots.schedule }),
      ]);
      // Only once the new revision is read, so the form never remounts on the old one in between.
      setImported(null);
      const resolved = proposal?.source === "webhook" ? " The refused delivery is resolved." : "";
      const room = toPlayersRoom ? " This game now links to the players' room." : "";
      toast.success(`Draft corrected.${resolved}${room} Statistics update on their next refresh, about 30 seconds from now.`);
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
        <BackButton onClick={onBack}>{backLabel}</BackButton>
      </div>
      {editor.isPending ? (
        <p role="status" className="text-sm text-text-dim">Loading the draft…</p>
      ) : editor.isError ? (
        <ErrorLine message={draftErrorText(editor.error)} />
      ) : (
        <>
          <Summary
            editor={editor.data}
            imported={imported?.room ?? null}
            disabled={save.isPending}
            onDiscard={() => setImported(null)}
          />
          {warnings.length > 0 && <Warnings warnings={warnings} />}
          <ImportRoom
            game={editor.data.game}
            held={imported}
            pending={importRoom.isPending}
            error={importRoom.error}
            disabled={save.isPending}
            onImport={input => importRoom.mutate(input)}
            onEdit={() => { if (importRoom.isError) importRoom.reset(); }}
          />
          <CorrectionFormView
            key={`${editor.data.draft?.updatedAt ?? "new"}:${imported?.id ?? "none"}`}
            editor={editor.data}
            imported={imported?.room ?? null}
            saving={save.isPending}
            disabled={save.isPending || importRoom.isPending}
            onSave={input => save.mutate({
              input,
              proposal: editor.data.proposal,
              toPlayersRoom: input.roomUrl !== undefined && input.roomUrl === imported?.room.source.url && input.roomUrl !== editor.data.url,
            })}
          />
          <ErrorLine message={save.isError ? draftErrorText(save.error) : null} />
        </>
      )}
    </div>
  );
}

function Summary({ editor, imported, disabled, onDiscard }: {
  editor: DraftEditor;
  imported: DraftRoomImport | null;
  disabled: boolean;
  onDiscard: () => void;
}) {
  const draft = editor.draft;
  const room = draft?.url ?? editor.url;
  const playersRoom = draft?.url != null && editor.url !== null && draft.url !== editor.url;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="font-display text-[22px] text-text-bright">Game {editor.game} draft</h3>
        {editor.draftMode && <Badge variant="muted">{DRAFT_MODE_LABEL[editor.draftMode].label}</Badge>}
        {draft?.roleStatus && <Badge variant="muted">{DRAFT_ROLE_STATUS_LABEL[draft.roleStatus]}</Badge>}
        {!draft && <Badge variant="muted">No draft stored</Badge>}
        {playersRoom && <Badge variant="muted">Drafted in the players&apos; room</Badge>}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {editor.scheduleMatchId !== null && (
          <Link to={`/match/${editor.scheduleMatchId}`} className="text-brand hover:underline">Match</Link>
        )}
        {editor.played && (
          <Link to={`/game/${encodeURIComponent(editor.played.matchId)}`} className="text-brand hover:underline">Played game</Link>
        )}
        {room && <RoomLink href={room}>Draft room</RoomLink>}
        {playersRoom && editor.url && <RoomLink href={editor.url}>Registered room</RoomLink>}
        <span className="text-text-dim">{editor.conf}</span>
      </div>
      {draft?.correction && (
        <p className="text-xs text-text-secondary">
          Corrected {fmtKickoff(draft.correction.correctedAt)}
          {draft.correction.reason && <>: {draft.correction.reason}</>}
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <PlayedGame editor={editor} />
        {imported ? (
          <PlayersRoom room={imported} disabled={disabled} onDiscard={onDiscard} />
        ) : (
          editor.proposal && <RefusedDelivery proposal={editor.proposal} />
        )}
      </div>
    </div>
  );
}

function RoomLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline">
      {children}
      <ExternalLink size={12} aria-hidden="true" />
    </a>
  );
}

/** The delivery the importer refused, as Drafter sent it. */
function RefusedDelivery({ proposal }: { proposal: DraftProposal }) {
  const source = proposal.source === "fetch" ? "Fetch" : proposal.source === "webhook" ? "Webhook" : null;
  return (
    <ProposalCard
      title="Refused delivery"
      game={proposal}
      meta={
        <>
          <p className="text-xs text-text-dim">
            {[`Received ${fmtKickoff(proposal.receivedAt)}`, source, proposal.event, proposal.patch && `Patch ${proposal.patch}`]
              .filter(Boolean).join(" · ")}
          </p>
          {proposal.errorCategory && <p className="mt-0.5 text-xs text-ccs-red">{draftCodeText(proposal.errorCategory)}</p>}
        </>
      }
    />
  );
}

/** The imported players' room, held as pre-fill until a save or Discard import. */
function PlayersRoom({ room, disabled, onDiscard }: { room: DraftRoomImport; disabled: boolean; onDiscard: () => void }) {
  const { source } = room;
  const teams = source.team1Name && source.team2Name ? `${source.team1Name} vs ${source.team2Name}` : null;
  return (
    <ProposalCard
      title="Players' room"
      game={room.proposal}
      meta={
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="text-text-dim">{[`Game ${source.sourceGame} of the room`, teams].filter(Boolean).join(" · ")}</span>
          <RoomLink href={source.url}>Room</RoomLink>
          <Button type="button" variant="quiet" size="inline" disabled={disabled} onClick={onDiscard}>Discard import</Button>
        </div>
      }
      notices={room.warnings.length > 0 && (
        <Alert variant="warning">
          <AlertDescription>
            <ul className="flex flex-col gap-1">
              {room.warnings.map(warning => <li key={warning.code}>{roomWarningText(warning)}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    />
  );
}

/** A game read leniently from Drafter. Unresolved slots show the raw value. */
function ProposalCard({ title, meta, game: proposal, notices }: {
  title: string;
  meta: ReactNode;
  game: DraftProposalGame;
  notices?: ReactNode;
}) {
  const champions = useChampions();
  const roles = proposal.roles;
  return (
    <div className="min-w-0 rounded-md border border-border bg-bg3 p-3">
      <h4 className="mb-1 font-heading text-sm text-text-secondary">{title}</h4>
      {meta}
      {proposal.firstPick && (
        <p className="mt-0.5 text-xs text-text-secondary">{proposal.firstPick === "blue" ? "Blue" : "Red"} draft picked first</p>
      )}
      {notices && <div className="mt-2">{notices}</div>}
      <div className="mt-2 flex flex-col gap-3">
        {DRAFT_SIDES.map(side => (
          <div key={side} className="flex flex-col gap-1.5">
            <span className="font-heading text-xs text-text-bright">
              {side === "blue" ? "Blue draft" : "Red draft"}
              {proposal[side].name && <span className="text-text-dim"> · {proposal[side].name}</span>}
            </span>
            <ProposalSlots label="Picks" slots={proposal[side].picks} champions={champions} />
            <ProposalSlots label="Bans" slots={proposal[side].bans} champions={champions} ban />
            {roles && (
              <ProposalSlots
                label="Roles"
                slots={DRAFT_ROLES.map(role => roles[side][role])}
                captions={DRAFT_ROLES.map(role => DRAFT_ROLE_LABEL[role])}
                champions={champions}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ProposalSlots({ label, slots, captions, champions, ban = false }: {
  label: string;
  slots: readonly DraftProposalSlot[];
  captions?: readonly string[];
  champions: ChampionLookup | null;
  ban?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="w-10 shrink-0 text-[10px] text-text-muted">{label}</span>
      <ul className="flex min-w-0 flex-wrap items-center gap-2">
        {slots.map((slot, i) => (
          <li key={i} className="flex items-center gap-1">
            {captions && <span className="text-[10px] text-text-dim">{captions[i]}</span>}
            {slot.championId !== null ? (
              <ChampionIcon champion={slot.championId} lookup={champions} size={22} tile className={`flex${ban ? " opacity-60" : ""}`} />
            ) : (
              <span className="text-[11px] text-ccs-orange">
                {slot.token === null ? "Nothing sent" : `Drafter sent "${slot.token}"`}
              </span>
            )}
          </li>
        ))}
      </ul>
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
        {editor.played.patch && <span className="ml-2 text-xs text-text-dim">Patch {editor.played.patch}</span>}
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

/**
 * "Import from a players' room". The server parses the link before any fetch, so no parser is
 * mirrored here: a malformed link costs no Drafter budget and its sentence renders verbatim. The
 * room's game list comes from the last refusal that named one, or from the held import while the
 * link is the one it was imported from.
 */
function ImportRoom({ game, held, pending, error, disabled, onImport, onEdit }: {
  /** This editor's game number, the default room game when the room has it. */
  game: number;
  held: HeldImport | null;
  pending: boolean;
  error: unknown;
  disabled: boolean;
  onImport: (input: DraftRoomImportInput) => void;
  /** The link text changed, so an earlier refusal no longer describes it. */
  onEdit: () => void;
}) {
  const [link, setLink] = useState("");
  const [chosen, setChosen] = useState<number | null>(null);
  const url = link.trim();
  const refusal = error ? draftRefusal(error) : null;
  const refusedGames = refusal?.category === "source_game_required" || refusal?.category === "source_game_not_found"
    ? refusal.games
    : [];
  const heldGames = held && held.url === url && held.room.source.games.length > 1 ? held.room.source.games : [];
  const games = refusedGames.length > 0 ? refusedGames : heldGames;
  const sourceGame = games.length === 0
    ? undefined
    : chosen !== null && games.includes(chosen) ? chosen : games.includes(game) ? game : games[0];
  const message = !error
    ? null
    : refusal?.category === "source_game_not_found" && refusal.games.length === 0
      ? "The room has no completed game yet."
      : draftErrorText(error);

  return (
    <div className="rounded-md border border-border p-3">
      <h4 className="mb-2 font-heading text-sm text-text-secondary">Import from a players&apos; room</h4>
      <form
        className="flex flex-col gap-3"
        onSubmit={event => {
          event.preventDefault();
          if (url) onImport(sourceGame === undefined ? { url } : { url, sourceGame });
        }}
      >
        <SettingsRow
          label="Room link"
          hint="When players drafted in a room they made, paste its link. The draft replaces the form; nothing is saved until you save the correction."
        >
          {field => (
            <Input
              {...field}
              value={link}
              disabled={disabled || pending}
              placeholder="https://drafter.lol/draft/..."
              onChange={event => {
                setLink(event.target.value);
                onEdit();
              }}
            />
          )}
        </SettingsRow>
        <div className="flex flex-wrap items-center gap-3">
          {sourceGame !== undefined && (
            <label className="flex items-center gap-2 text-xs text-text">
              <span>Room game</span>
              <NativeSelect
                value={String(sourceGame)}
                disabled={disabled || pending}
                onChange={event => setChosen(Number(event.target.value))}
              >
                {games.map(n => <NativeSelectOption key={n} value={String(n)}>Game {n}</NativeSelectOption>)}
              </NativeSelect>
            </label>
          )}
          <Button type="submit" variant="outline" size="sm" disabled={disabled || pending || url === ""}>
            {pending ? "Importing…" : sourceGame === undefined ? "Import" : `Import game ${sourceGame}`}
          </Button>
        </div>
      </form>
      <ErrorLine message={message} />
    </div>
  );
}

function CorrectionFormView({ editor, imported, saving, disabled, onSave }: {
  editor: DraftEditor;
  imported: DraftRoomImport | null;
  saving: boolean;
  /** Saving or importing; an import landing mid-edit replaces the form. */
  disabled: boolean;
  onSave: (input: DraftCorrectionInput) => void;
}) {
  const champions = useChampions();
  const [form, setForm] = useState<CorrectionForm>(() => initialForm(editor, imported));
  const [reason, setReason] = useState(() => imported?.suggestedReason ?? "");
  const choices = roomLinkChoices(editor, imported);
  const [picked, setPicked] = useState<RoomLinkChoice | null>(null);
  const roomChoice = picked !== null && choices.includes(picked) ? picked : choices[0] ?? null;
  const problems = correctionProblems(form, editor, reason);
  const input = correctionInput(form, editor, reason, roomUrlFor(roomChoice, editor, imported));
  const swaps = swapsFor(form, editor.difference);
  const playedTeams = editor.played?.teams ?? [];
  const proposal = editor.proposal;
  const patch = patchNote(editor);
  const teamOf = (side: DraftSide) => editor.difference.find(d => d.side === side)?.teamId ?? null;

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={event => {
        event.preventDefault();
        if (input) onSave(input);
      }}
    >
      {swaps.length > 0 && <MatchPlayed swaps={swaps} conf={editor.conf} teamOf={teamOf} champions={champions} disabled={disabled} onApply={setForm} form={form} />}
      {!editor.draft && playedTeams.length === 2 && (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => setForm(current => formFromPlayed(current, playedTeams))}>
            Start from the played game
          </Button>
          <span className="text-xs text-text-dim">
            Fills each side with a played team in role order. Set the real pick order and sides before saving.
          </span>
        </div>
      )}
      {editor.draft && proposal && !imported && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => setForm(formFromProposal(proposal, playedTeams))}
          >
            Use this delivery
          </Button>
          <span className="text-xs text-text-dim">
            Replaces the form with the refused delivery. Champions it did not name are left empty, and bans it did
            not name are skipped.
          </span>
        </div>
      )}
      {patch && <p className="text-xs text-text-dim">{patch}</p>}

      <SettingsRow
        label="First pick"
        hint={editor.firstSelection ? undefined : "This series does not allow first selection, so blue picks first."}
      >
        <RadioOptions
          name="first-pick"
          options={DRAFT_SIDES.map(side => ({ value: side, label: side === "blue" ? "Blue draft" : "Red draft" }))}
          value={form.firstPick}
          disabled={disabled}
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
            disabled={disabled}
            onChange={setForm}
            onPlayedRoles={() => setForm(current => ({
              ...current,
              roles: { ...current.roles, [side]: playedRoles(playedTeams, current.picks[side]) },
            }))}
            canUsePlayedRoles={playedTeams.length > 0}
          />
        ))}
      </div>

      {choices.length > 1 && roomChoice !== null && (
        <SettingsRow label="Game's room link" hint="Where this game's draft links. The match and its codes keep the registered room.">
          <RadioOptions
            name="room-link"
            options={choices.map(choice => roomLinkOption(choice, editor, imported))}
            value={roomChoice}
            disabled={disabled}
            onChange={setPicked}
          />
        </SettingsRow>
      )}

      <SettingsRow label="Reason" hint={`Recorded with the correction. Up to ${DRAFT_CORRECTION_REASON_MAX} characters.`}>
        {field => (
          <Textarea
            {...field}
            value={reason}
            maxLength={DRAFT_CORRECTION_REASON_MAX}
            disabled={disabled}
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
        <Button type="submit" disabled={disabled || input === null}>{saving ? "Saving…" : "Save correction"}</Button>
        <span className="text-xs text-text-dim">A correction can only be undone by correcting again.</span>
      </div>
    </form>
  );
}

/**
 * The patch a save stores, following the server's rule: a new game takes the played game's patch,
 * else the refused delivery's; an update only fills a missing patch. An import's patch is ignored.
 */
function patchNote(editor: DraftEditor): string | null {
  const played = editor.played?.patch ?? null;
  if (!editor.draft) {
    if (played) return `Saved with patch ${played} from the played game.`;
    if (editor.proposal?.patch) return `Saved with patch ${editor.proposal.patch} from the delivery.`;
    return null;
  }
  return editor.draft.patch === null && played ? `Saving fills patch ${played} from the played game.` : null;
}

function roomLinkOption(choice: RoomLinkChoice, editor: DraftEditor, imported: DraftRoomImport | null) {
  switch (choice) {
    case "imported": return { value: choice, label: "Players' room (imported)", detail: imported?.source.url };
    case "keep": return { value: choice, label: "Keep the current link", detail: editor.draft?.url ?? undefined };
    case "registered": return { value: choice, label: "Registered room", detail: editor.url ?? undefined };
  }
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
