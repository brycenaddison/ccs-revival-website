/**
 * The writers' article list at `/content/articles`.
 *
 * Like Season Structure, the list and editor are separate views. Opening a form replaces the
 * list so it cannot disappear below a long archive. The list is the only read on the site that
 * returns **drafts**, which is why this section cannot reuse the public index.
 *
 * Ordered by `updatedAt` upstream rather than by publish date, because a draft has no publish date
 * and "what I was last working on" is the useful order for an editor. Rendered in the order served.
 */

import { useLayoutEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FilePlus2, ExternalLink } from "lucide-react";
import { queries } from "../../lib/queries";
import { errorMessage, type ArticleRecord } from "../../lib/api";
import { timeAgo } from "../../lib/utils";
import { Toast } from "../Toast";
import { ACTION_QUIET, ACTION_SM, Pill } from "../admin/adminUi";
import { LABEL_CLASS } from "../stats/FilterBar";
import { ArticleEditor } from "./ArticleEditor";

type Status = "all" | "published" | "draft";

const STATUSES: readonly { value: Status; label: string }[] = [
  { value: "all", label: "All" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Drafts" },
];

/** Keep the open record independent of list filters, including after publishing a draft. */
type Selection = { article: ArticleRecord | null } | null;

export function ArticlesSection() {
  const [status, setStatus] = useState<Status>("all");
  const [selected, setSelected] = useState<Selection>(null);
  const [toast, setToast] = useState<string | null>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const isEditing = selected !== null;
  const wasEditing = useRef(isEditing);

  const { data, isPending, error } = useQuery(queries.manageArticles({ status }));
  const articles = data ?? [];

  useLayoutEffect(() => {
    if (wasEditing.current === isEditing) return;
    wasEditing.current = isEditing;
    // Reveal an offscreen header after opening from deep in the list, but leave a visible
    // header in place. Aligning the whole form to the top scrolls down unnecessarily.
    headingRef.current?.focus({ preventScroll: true });
    headerRef.current?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
  }, [isEditing]);

  if (selected !== null) {
    return (
      <div>
        {toast && <Toast message={toast} onClose={() => setToast(null)} />}

        <div ref={headerRef} className="flex flex-wrap items-center gap-3 mb-4">
          <button type="button" onClick={() => setSelected(null)} className={ACTION_SM}>
            <ArrowLeft size={13} aria-hidden="true" />
            Back to articles
          </button>
          <h3 ref={headingRef} tabIndex={-1} className="font-display text-lg text-text-bright">
            {selected.article === null ? "New article" : "Edit article"}
          </h3>
        </div>

        <ArticleEditor
          // Creating a saved record resets the form; later saves keep its editor session.
          key={selected.article === null ? "new" : `edit:${selected.article.slug}`}
          article={selected.article}
          onSaved={(message, article) => {
            setToast(message);
            // Use the saved record even if its new status removes it from the filtered list.
            // A save that finishes after Back must not reopen an abandoned editor.
            setSelected(current => (current === selected ? { article } : current));
          }}
          onDeleted={message => {
            setToast(message);
            setSelected(current => (current === selected ? null : current));
          }}
          onCancel={() => setSelected(null)}
        />
      </div>
    );
  }

  return (
    <div>
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}

      <div ref={headerRef} className="flex items-center justify-between mb-3">
        <h3 ref={headingRef} tabIndex={-1} className={LABEL_CLASS}>
          Articles
        </h3>
        <button
          type="button"
          className={ACTION_QUIET}
          onClick={() => setSelected({ article: null })}
        >
          <FilePlus2 size={12} />
          New article
        </button>
      </div>

      <div className="flex gap-2 mb-4">
        {STATUSES.map(s => (
          <button
            key={s.value}
            type="button"
            onClick={() => setStatus(s.value)}
            aria-pressed={status === s.value}
            className={`rounded-full border px-3 py-1 font-heading text-[10px] cursor-pointer ${
              status === s.value
                ? "border-brand text-text-bright"
                : "border-border text-text-dim"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="text-ccs-red text-sm" role="alert">
          {errorMessage(error)}
        </p>
      ) : isPending ? (
        <p className="text-text-subtle text-sm py-6 text-center">Loading...</p>
      ) : articles.length === 0 ? (
        <p className="text-text-dim text-sm py-6 text-center">
          {status === "draft" ? "No drafts." : "Nothing here yet."}
        </p>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden mb-6">
          {articles.map((a, i) => (
            <button
              key={a.slug}
              type="button"
              onClick={() => setSelected({ article: a })}
              className={`w-full text-left flex items-center gap-3 px-4 py-3 bg-transparent border-0 cursor-pointer ${
                i > 0 ? "border-t border-border" : ""
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-text-bright truncate">{a.title}</span>
                  {a.kind === "link" && (
                    <ExternalLink size={11} className="text-text-subtle shrink-0" aria-label="Link article" />
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1 text-[10px] text-text-dim">
                  <span className="font-mono">{a.slug}</span>
                  {a.tag && <span>· {a.tag}</span>}
                  <span>· {a.conf ?? "site-wide"}</span>
                  <span>· edited {timeAgo(a.updatedAt)}</span>
                </div>
              </div>
              <Pill muted={!a.isPublished}>{a.isPublished ? "Live" : "Draft"}</Pill>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
