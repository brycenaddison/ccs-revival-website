/**
 * The writers' article list — `/content/articles`.
 *
 * Master/detail like `RolesSection`: a filterable list, and the editor for whichever row is
 * selected. The list is the only read on the site that returns **drafts**, which is the whole
 * reason this section exists rather than reusing the public index.
 *
 * Ordered by `updatedAt` upstream rather than by publish date, because a draft has no publish date
 * and "what I was last working on" is the useful order for an editor. Rendered in the order served.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FilePlus2, ExternalLink } from "lucide-react";
import { queries } from "../../lib/queries";
import { errorMessage, type ArticleRecord } from "../../lib/api";
import { timeAgo } from "../../lib/utils";
import { Toast } from "../Toast";
import { ACTION_QUIET, Pill } from "../admin/adminUi";
import { LABEL_CLASS } from "../stats/FilterBar";
import { ArticleEditor } from "./ArticleEditor";

type Status = "all" | "published" | "draft";

const STATUSES: readonly { value: Status; label: string }[] = [
  { value: "all", label: "All" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Drafts" },
];

/** `null` = nothing selected, `"new"` = the create form, a string = that slug's editor. */
type Selection = null | "new" | string;

export function ArticlesSection() {
  const [status, setStatus] = useState<Status>("all");
  const [selected, setSelected] = useState<Selection>(null);
  const [toast, setToast] = useState<string | null>(null);

  const { data, isPending, error } = useQuery(queries.manageArticles({ status }));
  const articles = data ?? [];

  // Resolved from the freshly-fetched list rather than held in state, so the form re-initializes
  // from what the server last said after a save rather than from a copy taken when it was opened.
  const editing: ArticleRecord | null =
    selected === null || selected === "new"
      ? null
      : (articles.find(a => a.slug === selected) ?? null);

  // A selected slug that vanished from the list — deleted, or filtered out by a status change.
  const stale = typeof selected === "string" && selected !== "new" && editing === null;

  return (
    <div>
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}

      <div className="flex items-center justify-between mb-3">
        <label className={LABEL_CLASS}>Articles</label>
        <button
          type="button"
          className={ACTION_QUIET}
          onClick={() => setSelected("new")}
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
            className={`rounded-full border px-3 py-1 font-heading text-[10px] tracking-wider uppercase cursor-pointer ${
              status === s.value
                ? "border-accent text-text-bright"
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
              onClick={() => setSelected(a.slug)}
              aria-current={selected === a.slug ? "true" : undefined}
              className={`w-full text-left flex items-center gap-3 px-4 py-3 bg-transparent border-0 cursor-pointer ${
                i > 0 ? "border-t border-border" : ""
              } ${selected === a.slug ? "bg-bg-input" : ""}`}
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

      {stale && (
        <p className="text-text-dim text-sm py-4 text-center">
          That article is no longer in this list.
        </p>
      )}

      {(selected === "new" || editing !== null) && (
        <div className="border-t border-border pt-5">
          <h3 className="font-display text-[18px] text-text-bright tracking-widest mb-4">
            {selected === "new" ? "NEW ARTICLE" : "EDIT ARTICLE"}
          </h3>
          <ArticleEditor
            // Remounts the form when the selection changes, so every field re-initializes from the
            // newly selected row. Without it the state above would persist across a switch and show
            // one article's title over another's body.
            key={selected === "new" ? "new" : editing?.slug}
            article={editing}
            onSaved={(message, slug) => {
              setToast(message);
              setSelected(slug);
            }}
            onDeleted={message => {
              setToast(message);
              setSelected(null);
            }}
            onCancel={() => setSelected(null)}
          />
        </div>
      )}
    </div>
  );
}
