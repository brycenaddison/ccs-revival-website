/**
 * Editor templates: Markdown snippets for the shared editor's Templates menu.
 *
 * Upstream behavior worth knowing:
 *
 *  - One global, ordered list with a single revision. Reading it needs the `content` role or site
 *    admin; league grants convey nothing. Replacing it is site admin only. Both routes are private
 *    no-store and exist only when Discord OAuth is configured.
 *  - A save replaces the whole list in the order sent: an item with `id` updates that template, one
 *    without creates a template, and a stored template whose `id` is left out is deleted.
 *  - Checks run in order: shape (plain-text 400 naming the first problem), revision (409
 *    `editor_templates_revision_conflict`), then every rule at once (422 issues at
 *    `templates`, `templates.N.id`, `templates.N.name` and `templates.N.body`). An identical save
 *    keeps the revision. Names are trimmed upstream; bodies are stored verbatim.
 *  - A body holds at most one cursor placeholder, which the site removes at insertion. There is no
 *    escape syntax. Inserted text keeps no link to its template.
 */

import { credentialedRequest } from "./credentialed";
import type { RequestOpts } from "./http";

// ---------------------------------------------------------------------------------- constraints

export const EDITOR_TEMPLATE_NAME_MAX = 40;
export const EDITOR_TEMPLATE_BODY_MAX = 5000;
export const EDITOR_TEMPLATES_MAX = 30;
/** Upstream refuses these line breaks in a name (NEL and the line and paragraph separators too), even after trimming. */
export const EDITOR_TEMPLATE_NAME_BREAK = /[\r\n\x85\p{Zl}\p{Zp}]/u;
/** `{cursor}` or `{cursor:Selected text}`, the same pattern upstream counts. */
export const CURSOR_PLACEHOLDER = /\{cursor(?::[^{}\n]*)?\}/;

/** How many placeholders a body holds. Upstream accepts at most one. */
export function cursorPlaceholderCount(body: string): number {
  return body.match(new RegExp(CURSOR_PLACEHOLDER.source, "g"))?.length ?? 0;
}

// -------------------------------------------------------------------------------------- types

export interface EditorTemplate {
  id: number;
  name: string;
  body: string;
}

export interface EditorTemplateList {
  /**
   * Null when the served list could not be mapped whole. A row this mapper dropped would read as a
   * deletion on the next whole-list save, so a list without a revision cannot be saved.
   */
  revision: number | null;
  templates: EditorTemplate[];
}

export interface EditorTemplateInput {
  /** Present to update that template, absent to create one. */
  id?: number;
  name: string;
  body: string;
}

export interface EditorTemplatesSave {
  expectedRevision: number;
  templates: EditorTemplateInput[];
}

// ---------------------------------------------------------------------------------- normalizing

type Raw = Record<string, unknown>;

const raw = (value: unknown): Raw => value && typeof value === "object" && !Array.isArray(value) ? value as Raw : {};
const integer = (value: unknown): number | null => typeof value === "number" && Number.isSafeInteger(value) ? value : null;

function templateOf(value: unknown): EditorTemplate | null {
  const r = raw(value);
  const id = integer(r.id);
  if (id === null || typeof r.name !== "string" || typeof r.body !== "string") return null;
  return { id, name: r.name, body: r.body };
}

function listOf(value: unknown): EditorTemplateList {
  const r = raw(value);
  const served = Array.isArray(r.templates) ? r.templates : null;
  const templates = (served ?? []).flatMap(row => {
    const template = templateOf(row);
    return template ? [template] : [];
  });
  const revision = integer(r.revision);
  const whole = served !== null && templates.length === served.length && revision !== null && revision >= 0;
  return { revision: whole ? revision : null, templates };
}

// ------------------------------------------------------------------------------------ endpoints

export async function editorTemplates(opts?: RequestOpts): Promise<EditorTemplateList> {
  return listOf(await credentialedRequest("/editor-templates", { cache: "no-store" }, opts));
}

export async function saveEditorTemplates(input: EditorTemplatesSave, opts?: RequestOpts): Promise<EditorTemplateList> {
  return listOf(await credentialedRequest("/admin/editor-templates", { method: "PUT", body: input }, opts));
}
