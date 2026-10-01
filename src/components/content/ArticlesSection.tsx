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
import { FilePlus2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { queries } from "../../lib/queries";
import { errorMessage, type ArticleRecord } from "../../lib/api";
import { timeAgo } from "../../lib/utils";
import { BackButton } from "../admin/adminUi";
import { LABEL_CLASS } from "../stats/FilterBar";
import { ArticleEditor } from "./ArticleEditor";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

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
        <div ref={headerRef} className="flex flex-wrap items-center gap-3 mb-4">
          <BackButton onClick={() => setSelected(null)}>Back to articles</BackButton>
          <h3 ref={headingRef} tabIndex={-1} className="font-display text-lg text-text-bright">
            {selected.article === null ? "New article" : "Edit article"}
          </h3>
        </div>

        <ArticleEditor
          // Creating a saved record resets the form; later saves keep its editor session.
          key={selected.article === null ? "new" : `edit:${selected.article.slug}`}
          article={selected.article}
          onSaved={(message, article) => {
            toast.success(message);
            // Use the saved record even if its new status removes it from the filtered list.
            // A save that finishes after Back must not reopen an abandoned editor.
            setSelected(current => (current === selected ? { article } : current));
          }}
          onDeleted={message => {
            toast.success(message);
            setSelected(current => (current === selected ? null : current));
          }}
          onCancel={() => setSelected(null)}
        />
      </div>
    );
  }

  return (
    <div>
      <div ref={headerRef} className="flex items-center justify-between mb-3">
        <h3 ref={headingRef} tabIndex={-1} className={LABEL_CLASS}>
          Articles
        </h3>
        <Button
          type="button"
          variant="quiet"
          size="inline"
          onClick={() => setSelected({ article: null })}
        >
          <FilePlus2 size={12} aria-hidden="true" />
          New article
        </Button>
      </div>

      <ToggleGroup
        type="single"
        variant="outline"
        size="xs"
        spacing={2}
        value={status}
        onValueChange={next => next && setStatus(next as Status)}
        aria-label="Filter articles"
        className="mb-4"
      >
        {STATUSES.map(s => (
          <ToggleGroupItem key={s.value} value={s.value} className="rounded-full text-[10px] text-text-dim data-[state=on]:text-text-bright">
            {s.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(error)}</AlertDescription>
        </Alert>
      ) : isPending ? (
        <div className="flex justify-center py-6">
          <Spinner aria-label="Loading articles" />
        </div>
      ) : articles.length === 0 ? (
        <Empty className="p-6 md:p-6">
          <EmptyHeader>
            <EmptyTitle>{status === "draft" ? "No drafts." : "Nothing here yet."}</EmptyTitle>
          </EmptyHeader>
        </Empty>
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
              <Badge variant={!a.isPublished ? "muted" : "default"}>{a.isPublished ? "Live" : "Draft"}</Badge>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
