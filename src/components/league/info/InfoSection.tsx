/**
 * The full-league-admin editor for one conf's evergreen Info document.
 *
 * There is one resource per conf, so this is a document form rather than the article portal's
 * master/detail list. `PUT` has complete-document semantics: link ordering and removals are
 * unambiguous, and the editor never has to coordinate several partial writes for one Save button.
 */

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useParams } from "react-router-dom";
import {
  errorMessage,
  INFO_LINK_LABEL_MAX,
  INFO_LINK_MAX,
  INFO_LINK_URL_MAX,
  INFO_TITLE_MAX,
  saveLeagueInfo,
  type InfoLink,
  type LeagueInfo,
  type LeagueInfoInput,
} from "../../../lib/api";
import { queries, queryRoots } from "../../../lib/queries";
import { Toast } from "../../Toast";
import {
  ACTION,
  ACTION_PRIMARY,
  ACTION_QUIET,
  ACTION_QUIET_BASE,
  ErrorLine,
  Pill,
} from "../../admin/adminUi";
import { SettingsRow } from "../../settings/SettingsSection";
import { CONTROL_CLASS, LABEL_CLASS } from "../../stats/FilterBar";

interface DraftLink extends InfoLink {
  key: number;
}

function validLinkUrl(value: string): boolean {
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function InfoEditor({ conf, info, onSaved }: { conf: string; info: LeagueInfo | null; onSaved: () => void }) {
  const qc = useQueryClient();
  const nextKey = useRef(info?.links.length ?? 0);
  const [title, setTitle] = useState(info?.title ?? "League Information");
  const [body, setBody] = useState(info?.body ?? "");
  const [links, setLinks] = useState<DraftLink[]>(
    () => info?.links.map((link, key) => ({ ...link, key })) ?? [],
  );
  const [isPublished, setIsPublished] = useState(info?.isPublished ?? false);

  const input = useMemo<LeagueInfoInput>(
    () => ({
      title: title.trim(),
      body: body.trim() === "" ? null : body,
      links: links.map(({ label, url }) => ({ label: label.trim(), url: url.trim() })),
      isPublished,
    }),
    [title, body, links, isPublished],
  );
  const stored = useMemo<LeagueInfoInput | null>(
    () =>
      info === null
        ? null
        : {
            title: info.title,
            body: info.body,
            links: info.links,
            isPublished: info.isPublished,
          },
    [info],
  );
  const dirty = stored === null || JSON.stringify(input) !== JSON.stringify(stored);
  const incompleteLink = input.links.some(link => link.label === "" || link.url === "");
  const unsafeLink = input.links.some(link => link.url !== "" && !validLinkUrl(link.url));
  const hasContent = input.body !== null || input.links.length > 0;
  const canSave = input.title !== "" && !incompleteLink && !unsafeLink && (!isPublished || hasContent);

  const save = useMutation({
    mutationFn: () => saveLeagueInfo(conf, input),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryRoots.info });
      onSaved();
    },
  });

  const addLink = () => {
    if (links.length >= INFO_LINK_MAX) return;
    const key = nextKey.current;
    nextKey.current += 1;
    setLinks(previous => [...previous, { key, label: "", url: "" }]);
  };
  const updateLink = (key: number, changes: Partial<InfoLink>) =>
    setLinks(previous => previous.map(link => (link.key === key ? { ...link, ...changes } : link)));
  const moveLink = (index: number, by: -1 | 1) =>
    setLinks(previous => {
      const target = index + by;
      if (target < 0 || target >= previous.length) return previous;
      const next = [...previous];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  return (
    <form
      onSubmit={event => {
        event.preventDefault();
        if (canSave && dirty && !save.isPending) save.mutate();
      }}
    >
      <div className="flex items-center gap-2 mb-5">
        <Pill muted={!isPublished}>{isPublished ? "Live" : "Draft"}</Pill>
        {info?.updatedAt && <span className="text-text-dim text-xs">Saved on the server</span>}
      </div>

      <SettingsRow label="Page title">
        <input
          className={CONTROL_CLASS}
          value={title}
          maxLength={INFO_TITLE_MAX}
          onChange={event => setTitle(event.target.value)}
          placeholder="League Information"
        />
      </SettingsRow>

      <div className="mb-6">
        <div className="flex items-center justify-between gap-3 mb-2">
          <label className={LABEL_CLASS}>Quick links</label>
          <button
            type="button"
            className={ACTION_QUIET}
            disabled={links.length >= INFO_LINK_MAX}
            onClick={addLink}
          >
            <Plus size={12} aria-hidden="true" />
            Add link
          </button>
        </div>
        {links.length === 0 ? (
          <p className="text-text-dim text-sm rounded-lg border border-dashed border-border p-4 text-center">
            No quick links yet.
          </p>
        ) : (
          <div className="space-y-3">
            {links.map((link, index) => (
              <div key={link.key} className="rounded-lg border border-border bg-bg3 p-3">
                <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] gap-2 items-end">
                  <div>
                    <label className={LABEL_CLASS} htmlFor={`info-link-label-${link.key}`}>
                      Label
                    </label>
                    <input
                      id={`info-link-label-${link.key}`}
                      className={CONTROL_CLASS}
                      value={link.label}
                      maxLength={INFO_LINK_LABEL_MAX}
                      onChange={event => updateLink(link.key, { label: event.target.value })}
                      placeholder="Rulebook"
                    />
                  </div>
                  <div>
                    <label className={LABEL_CLASS} htmlFor={`info-link-url-${link.key}`}>
                      URL
                    </label>
                    <input
                      id={`info-link-url-${link.key}`}
                      className={CONTROL_CLASS}
                      value={link.url}
                      maxLength={INFO_LINK_URL_MAX}
                      onChange={event => updateLink(link.key, { url: event.target.value })}
                      placeholder="https://… or /schedule"
                    />
                  </div>
                  <div className="flex items-center gap-1 pb-1">
                    <button
                      type="button"
                      className={ACTION_QUIET}
                      disabled={index === 0}
                      onClick={() => moveLink(index, -1)}
                      aria-label={`Move ${link.label || "link"} up`}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      className={ACTION_QUIET}
                      disabled={index === links.length - 1}
                      onClick={() => moveLink(index, 1)}
                      aria-label={`Move ${link.label || "link"} down`}
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      type="button"
                      className={`${ACTION_QUIET_BASE} text-ccs-red hover:text-text-bright`}
                      onClick={() => setLinks(previous => previous.filter(item => item.key !== link.key))}
                      aria-label={`Remove ${link.label || "link"}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="text-text-dim text-xs mt-1.5">
          Links keep this order, up to {INFO_LINK_MAX}. Use an HTTP(S) URL or a site path beginning
          with one slash.
        </p>
      </div>

      <SettingsRow
        label="Page content"
        hint="Markdown is supported. Raw HTML is shown as text and is never executed."
      >
        <textarea
          className={`${CONTROL_CLASS} min-h-[320px] resize-y font-mono text-[13px]`}
          value={body}
          onChange={event => setBody(event.target.value)}
          placeholder="## Rules\n\nImportant information for this league…"
        />
      </SettingsRow>

      <SettingsRow
        label="Publishing"
        hint="A draft is visible only in League Admin. Publishing a new page stamps its publish time on the server."
      >
        <label className="flex items-center gap-2 cursor-pointer text-sm text-text">
          <input
            type="checkbox"
            checked={isPublished}
            onChange={event => setIsPublished(event.target.checked)}
          />
          Visible to everyone
        </label>
      </SettingsRow>

      {incompleteLink && <p className="text-ccs-red text-sm">Every quick link needs a label and URL.</p>}
      {!incompleteLink && unsafeLink && (
        <p className="text-ccs-red text-sm">Quick links must use HTTP(S) or a site-relative path.</p>
      )}
      {isPublished && !hasContent && (
        <p className="text-ccs-red text-sm">Add a quick link or page content before publishing.</p>
      )}
      <ErrorLine message={save.error ? errorMessage(save.error) : null} />

      <div className="flex items-center gap-2 mt-6 pt-5 border-t border-border">
        <button type="submit" className={ACTION_PRIMARY} disabled={!canSave || !dirty || save.isPending}>
          {save.isPending ? "Saving..." : dirty ? "Save info page" : "Saved"}
        </button>
        {dirty && info !== null && (
          <button
            type="button"
            className={ACTION}
            disabled={save.isPending}
            onClick={() => {
              setTitle(info.title);
              setBody(info.body ?? "");
              setLinks(info.links.map((link, key) => ({ ...link, key })));
              nextKey.current = info.links.length;
              setIsPublished(info.isPublished);
            }}
          >
            Reset
          </button>
        )}
      </div>
    </form>
  );
}

export function InfoSection() {
  const { conf = "" } = useParams();
  const [toast, setToast] = useState<string | null>(null);
  const { data, isPending, error } = useQuery(queries.manageLeagueInfo(conf));

  if (error) return <p className="text-ccs-red text-sm" role="alert">{errorMessage(error)}</p>;
  if (isPending) return <p className="text-text-subtle text-sm py-8 text-center">Loading...</p>;

  return (
    <>
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
      <InfoEditor
        key={`${conf}:${data?.updatedAt ?? "new"}`}
        conf={conf}
        info={data ?? null}
        onSaved={() => setToast("Saved the league Info page.")}
      />
    </>
  );
}
