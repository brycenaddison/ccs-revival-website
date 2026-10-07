/**
 * Site Admin > Editor templates: the Markdown snippets content editors insert from the editor's
 * Templates menu (`lib/api/editorTemplates.ts`).
 *
 * The list is one revisioned document saved whole, so this edits a local copy and saves it in one
 * request. The copy stays put when the server's list moves: a read that brings a newer revision shows
 * a notice and waits for Load the latest, rather than replacing edits that can run to thousands of
 * characters. A 409 refetches, which raises the same notice. The local checks mirror upstream's
 * rules so a refusal is rare; one still lists every issue above the form.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  ApiError,
  cursorPlaceholderCount,
  errorMessage,
  issuesOf,
  saveEditorTemplates,
  EDITOR_TEMPLATE_BODY_MAX,
  EDITOR_TEMPLATE_NAME_BREAK,
  EDITOR_TEMPLATE_NAME_MAX,
  EDITOR_TEMPLATES_MAX,
  type EditorTemplateList,
  type EditorTemplatesSave,
  type ValidationIssue,
} from "../../lib/api";
import { useAuth } from "../../lib/authContext";
import { queries, queryRoots } from "../../lib/queries";
import { cn } from "@/lib/cn";
import { ConfirmButton } from "../ConfirmButton";
import { MoveButtons } from "../MoveButtons";
import { MarkdownEditor } from "../content/MarkdownEditor";
import { SettingsGroup, SettingsRow } from "../settings/SettingsSection";
import { ErrorLine } from "./adminUi";
import { IssueList, invalidAt } from "./season/issues";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";

interface Draft {
  /** Local identity, so a template keeps its row and editor while it moves or before it has an ID. */
  key: number;
  id: number | null;
  name: string;
  body: string;
}
interface FieldIssues { name?: string; body?: string }

let nextKey = 0;
const draftsOf = (list: EditorTemplateList): Draft[] =>
  list.templates.map(template => ({ key: nextKey++, id: template.id, name: template.name, body: template.body }));
const displayName = (draft: Draft) => draft.name.trim() || "Untitled template";

const ISSUE_PATH = /^templates\.(\d+)\.(id|name|body)$/;
const FIELD_LABEL = { id: "ID", name: "name", body: "text" } as const;

/** Upstream's rules, in its order, so Save is offered only for a list it would accept. */
function localIssues(drafts: Draft[]): Map<number, FieldIssues> {
  const issues = new Map<number, FieldIssues>();
  const names = new Set<string>();
  for (const draft of drafts) {
    const found: FieldIssues = {};
    const name = draft.name.trim();
    if (!name) found.name = "Enter a name.";
    else if (name.length > EDITOR_TEMPLATE_NAME_MAX) found.name = `Use ${EDITOR_TEMPLATE_NAME_MAX} characters or fewer.`;
    else if (EDITOR_TEMPLATE_NAME_BREAK.test(name)) found.name = "Use a single line.";
    else if (names.has(name.toLowerCase())) found.name = "Another template has this name.";
    else names.add(name.toLowerCase());

    if (!draft.body.trim()) found.body = "Enter the template's text.";
    else if (draft.body.length > EDITOR_TEMPLATE_BODY_MAX) found.body = `Use ${EDITOR_TEMPLATE_BODY_MAX} characters or fewer.`;
    else if (cursorPlaceholderCount(draft.body) > 1) found.body = "Use at most one cursor placeholder.";

    if (found.name || found.body) issues.set(draft.key, found);
  }
  return issues;
}

export function EditorTemplatesSection() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const viewerId = profile?.id ?? null;
  const read = useQuery(queries.editorTemplates(viewerId));
  const [loaded, setLoaded] = useState<EditorTemplateList | null>(null);
  // Held here so the selection survives the form remounting on a new revision.
  const [selected, setSelected] = useState<number | null>(null);
  if (loaded === null && read.data) setLoaded(read.data);

  const save = useMutation({
    mutationFn: (input: EditorTemplatesSave) => saveEditorTemplates(input),
    onSuccess: async list => {
      // Seed the read first so the saved revision never looks like someone else's change.
      qc.setQueryData(queries.editorTemplates(viewerId).queryKey, list);
      setLoaded(list);
      toast.success("Templates saved.");
      await qc.invalidateQueries({ queryKey: queryRoots.editorTemplates });
    },
    onError: async error => {
      if (error instanceof ApiError && error.status === 409) await qc.invalidateQueries({ queryKey: queryRoots.editorTemplates });
    },
  });

  if (!loaded) {
    if (read.isError) return <ErrorLine message={errorMessage(read.error)} />;
    return <p role="status" className="text-sm text-text-dim">Loading templates…</p>;
  }
  const stale = !!read.data && read.data.revision !== loaded.revision;
  const issues = issuesOf(save.error) ?? [];

  return (
    <SettingsGroup title="Templates">
      <p className="mb-4 text-xs leading-relaxed text-text-dim">
        Content editors and site admins insert these from Templates in the Markdown editor's toolbar or
        right-click menu. Inserting copies the text, so editing or removing a template later never
        changes an article or Info page that used it.
      </p>
      {stale && (
        <Alert className="mb-4">
          <AlertTitle>The templates changed since this page loaded</AlertTitle>
          <AlertDescription>
            <p>Another save landed first, so this list can't be saved over it. Copy anything you want to keep, then load the latest list.</p>
            <Button
              type="button" variant="outline" size="sm" className="mt-2"
              onClick={() => {
                save.reset();
                if (read.data) setLoaded(read.data);
              }}
            >
              Load the latest
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {loaded.revision === null && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>Some templates could not be read, so this list can't be saved here without losing them.</AlertDescription>
        </Alert>
      )}
      <TemplatesForm
        key={loaded.revision ?? "unsaved"}
        list={loaded}
        selected={selected}
        onSelect={setSelected}
        locked={stale || loaded.revision === null}
        saving={save.isPending}
        issues={issues}
        onSave={input => save.mutate(input)}
        onDiscard={() => save.reset()}
      />
      <ErrorLine message={save.isError && !issuesOf(save.error) ? errorMessage(save.error) : null} />
    </SettingsGroup>
  );
}

function TemplatesForm({ list, selected, onSelect, locked, saving, issues, onSave, onDiscard }: {
  list: EditorTemplateList;
  selected: number | null;
  onSelect: (index: number | null) => void;
  /** The list cannot be saved: it is stale or was not read whole. */
  locked: boolean;
  saving: boolean;
  issues: ValidationIssue[];
  onSave: (input: EditorTemplatesSave) => void;
  onDiscard: () => void;
}) {
  const [drafts, setDrafts] = useState(() => draftsOf(list));
  // Refusal paths index the list as it was sent, which later moves and removals do not change.
  const [sent, setSent] = useState<Draft[]>([]);
  const local = localIssues(drafts);
  const dirty = drafts.length !== list.templates.length || drafts.some((draft, index) => {
    const stored = list.templates[index];
    return draft.id !== stored.id || draft.name !== stored.name || draft.body !== stored.body;
  });
  const refused = new Set(issues.flatMap(issue => {
    const draft = sent[Number(ISSUE_PATH.exec(issue.path)?.[1])];
    return draft ? [draft.key] : [];
  }));
  const current = selected === null ? null : drafts[selected] ?? null;
  const currentIssues = current ? local.get(current.key) ?? {} : {};
  const sentIndex = current ? sent.findIndex(draft => draft.key === current.key) : -1;
  const full = drafts.length >= EDITOR_TEMPLATES_MAX;

  const update = (key: number, patch: Partial<Draft>) =>
    setDrafts(previous => previous.map(draft => (draft.key === key ? { ...draft, ...patch } : draft)));
  function move(index: number, by: -1 | 1) {
    setDrafts(previous => {
      const next = [...previous];
      [next[index], next[index + by]] = [next[index + by], next[index]];
      return next;
    });
    if (selected === index) onSelect(index + by);
    else if (selected === index + by) onSelect(index);
  }
  function remove(index: number) {
    setDrafts(previous => previous.filter((_, i) => i !== index));
    if (selected === index) onSelect(null);
    else if (selected !== null && selected > index) onSelect(selected - 1);
  }
  function add() {
    setDrafts(previous => [...previous, { key: nextKey++, id: null, name: "", body: "" }]);
    onSelect(drafts.length);
  }
  function submit() {
    if (list.revision === null) return;
    setSent(drafts);
    onSave({
      expectedRevision: list.revision,
      templates: drafts.map(draft => draft.id === null
        ? { name: draft.name.trim(), body: draft.body }
        : { id: draft.id, name: draft.name.trim(), body: draft.body }),
    });
  }
  const issueLabel = (path: string) => {
    if (path === "templates") return "Templates";
    const match = ISSUE_PATH.exec(path);
    const draft = match ? sent[Number(match[1])] : undefined;
    return match && draft ? `${displayName(draft)}, ${FIELD_LABEL[match[2] as keyof typeof FIELD_LABEL]}` : null;
  };

  return (
    <div>
      <IssueList issues={issues} label={issueLabel} />
      <div className="mb-2 mt-4 flex items-center justify-between gap-3">
        <span className="text-xs text-text-dim">Menu order, up to {EDITOR_TEMPLATES_MAX}.</span>
        <Button type="button" variant="quiet" size="inline" onClick={add} disabled={full}>
          <Plus size={12} aria-hidden="true" />
          New template
        </Button>
      </div>

      {drafts.length === 0 ? (
        <Empty className="p-6 md:p-6">
          <EmptyHeader><EmptyTitle>No templates yet.</EmptyTitle></EmptyHeader>
        </Empty>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {drafts.map((draft, index) => (
            <li key={draft.key} className={cn("flex items-center gap-2 px-3 py-2", selected === index && "bg-bg-input")}>
              <button
                type="button"
                aria-current={selected === index ? "true" : undefined}
                onClick={() => onSelect(selected === index ? null : index)}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left"
              >
                <FileText size={14} className="shrink-0 text-text-dim" aria-hidden="true" />
                <span className="min-w-0 truncate text-sm text-text-bright">{displayName(draft)}</span>
                {draft.id === null && <Badge variant="muted">New</Badge>}
                {(local.has(draft.key) || refused.has(draft.key)) && <Badge variant="destructive">Needs attention</Badge>}
              </button>
              <MoveButtons
                variant="quiet"
                onMove={by => move(index, by)}
                isFirst={index === 0}
                isLast={index === drafts.length - 1}
                upLabel={`Move ${displayName(draft)} up`}
                downLabel={`Move ${displayName(draft)} down`}
              />
              <ConfirmButton
                title={`Remove ${displayName(draft)}?`}
                description="It leaves the Templates menu when you save. Articles and Info pages that already used it keep their text."
                confirmLabel="Remove"
                onConfirm={() => remove(index)}
                trigger={
                  <Button type="button" variant="quiet" size="inline" className="text-ccs-red hover:text-text-bright" aria-label={`Remove ${displayName(draft)}`}>
                    <Trash2 size={14} aria-hidden="true" />
                  </Button>
                }
              />
            </li>
          ))}
        </ul>
      )}

      {current && (
        <div className="mt-5 border-t border-border pt-5">
          <SettingsRow label="Name" hint="Shown in the Templates menu." error={currentIssues.name ?? null}>
            {field => (
              <Input
                {...field}
                aria-invalid={field["aria-invalid"] ?? (sentIndex >= 0 ? invalidAt(issues, `templates.${sentIndex}.name`) : undefined)}
                value={current.name}
                maxLength={EDITOR_TEMPLATE_NAME_MAX}
                placeholder="Pull quote"
                onChange={event => update(current.key, { name: event.target.value })}
              />
            )}
          </SettingsRow>
          <SettingsRow
            label="Text"
            hint={<>
              Markdown, up to {EDITOR_TEMPLATE_BODY_MAX} characters. Put <code>{"{cursor}"}</code> where the cursor
              should land, or <code>{"{cursor:Text}"}</code> to leave Text selected for typing over. Use one at most.
            </>}
            error={currentIssues.body ?? null}
          >
            <MarkdownEditor
              key={current.key}
              value={current.body}
              onChange={body => update(current.key, { body })}
              ariaLabel={`${displayName(current)} text`}
              size="notes"
              placeholder={"> {cursor:Quote text}\n>\n> Name, team"}
            />
          </SettingsRow>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border pt-5">
        <Button type="button" onClick={submit} disabled={!dirty || saving || locked || local.size > 0}>
          {saving ? "Saving…" : "Save templates"}
        </Button>
        {dirty && !saving && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setDrafts(draftsOf(list));
              setSent([]);
              onDiscard();
              onSelect(null);
            }}
          >
            Discard changes
          </Button>
        )}
        {dirty && local.size > 0 && <span className="text-xs text-text-dim">Fix the templates marked Needs attention to save.</span>}
      </div>
    </div>
  );
}
