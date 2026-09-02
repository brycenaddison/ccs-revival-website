/**
 * The article form — create and edit in one component.
 *
 * The two differ in three places and nowhere else: `POST` versus `PATCH`, whether the slug is a
 * preview or a fact, and whether delete is offered. Splitting them would duplicate a dozen fields
 * to avoid three conditionals.
 *
 * **A create sends the whole form; an edit sends only what changed.** An absent key leaves a column
 * alone upstream, so a `PATCH` carrying every field would overwrite a subtitle somebody else edited
 * while this form was open. `changes()` below builds that diff — the same shape `LeaguesSection`
 * uses for league metadata.
 */

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import {
  createArticle,
  deleteArticle,
  isReservedSlug,
  slugify,
  updateArticle,
  AUTHOR_MAX,
  EXTERNAL_URL_MAX,
  IMAGE_URL_MAX,
  SUBTITLE_MAX,
  TAG_MAX,
  TITLE_MAX,
  errorMessage,
  type ArticleCreate,
  type ArticleKind,
  type ArticleRecord,
  type ArticleType,
  type ArticleUpdate,
} from "../../lib/api";
import { queryRoots } from "../../lib/queries";
import { useLeague } from "../../lib/leagueContext";
import { fromLocalInput, toLocalInput } from "../../lib/utils";
import { SettingsRow, ReadOnlyValue } from "../settings/SettingsSection";
import { ACTION, ACTION_PRIMARY, ACTION_SM_DANGER, ErrorLine } from "../admin/adminUi";
import { ImageUpload } from "../ImageUpload";
import { MarkdownEditor } from "./MarkdownEditor";
import { CONTROL_CLASS } from "../stats/FilterBar";

interface Props {
  /** `null` is the create form. */
  article: ArticleRecord | null;
  onSaved: (message: string, slug: string) => void;
  onDeleted: (message: string) => void;
  onCancel: () => void;
}

const TYPE_LABELS: Record<ArticleType, string> = {
  hero: "Hero — the one large card",
  feature: "Feature — a medium card",
  news: "News — a compact row",
};

export function ArticleEditor({ article, onSaved, onDeleted, onCancel }: Props) {
  const qc = useQueryClient();
  const { tournaments } = useLeague();
  const isNew = article === null;

  const [title, setTitle] = useState(article?.title ?? "");
  const [subtitle, setSubtitle] = useState(article?.subtitle ?? "");
  const [author, setAuthor] = useState(article?.author ?? "");
  const [kind, setKind] = useState<ArticleKind>(article?.kind ?? "link");
  const [externalUrl, setExternalUrl] = useState(article?.url ?? "");
  const [body, setBody] = useState(article?.body ?? "");
  const [imageUrl, setImageUrl] = useState(article?.imageUrl ?? "");
  const [tag, setTag] = useState(article?.tag ?? "");
  const [conf, setConf] = useState(article?.conf ?? "");
  const [articleType, setArticleType] = useState<ArticleType>(article?.articleType ?? "news");
  const [isPublished, setIsPublished] = useState(article?.isPublished ?? false);
  const [publishedAt, setPublishedAt] = useState(toLocalInput(article?.publishedAt));
  const [confirmDelete, setConfirmDelete] = useState(false);

  const t = title.trim();
  const slugPreview = useMemo(() => slugify(t), [t]);

  /** Blocks the two failures the server would otherwise answer with a 400 or a 409. */
  const slugProblem = isNew
    ? slugPreview === ""
      ? "This title doesn't produce a usable URL — it needs at least one letter or digit."
      : isReservedSlug(slugPreview)
        ? `"${slugPreview}" is reserved by a route and can't be used as a URL.`
        : null
    : null;

  // Mirrors the CHECK constraint upstream: a link article needs a destination, a native one needs
  // content. Blocked here so the common mistake never costs a round trip; the server still decides.
  const contentMissing =
    kind === "link" ? externalUrl.trim() === "" : body.trim() === "";

  const canSave = t !== "" && slugProblem === null && !contentMissing;

  /** Only the fields that actually moved. An absent key leaves that column alone upstream. */
  const changes = useMemo((): ArticleUpdate => {
    if (article === null) return {};
    const out: ArticleUpdate = {};
    const nullable = (v: string) => (v.trim() === "" ? null : v.trim());

    if (t !== article.title) out.title = t;
    if (nullable(subtitle) !== article.subtitle) out.subtitle = nullable(subtitle);
    if (nullable(author) !== article.author) out.author = nullable(author);
    if (kind !== article.kind) out.kind = kind;
    if (nullable(externalUrl) !== article.url) out.externalUrl = nullable(externalUrl);
    if (nullable(body) !== article.body) out.body = nullable(body);
    if (nullable(imageUrl) !== article.imageUrl) out.imageUrl = nullable(imageUrl);
    if (nullable(tag) !== article.tag) out.tag = nullable(tag);
    if (nullable(conf) !== article.conf) out.conf = nullable(conf);
    if (articleType !== article.articleType) out.articleType = articleType;
    if (isPublished !== article.isPublished) out.isPublished = isPublished;
    if (fromLocalInput(publishedAt) !== article.publishedAt) {
      out.publishedAt = fromLocalInput(publishedAt);
    }
    return out;
  }, [
    article, t, subtitle, author, kind, externalUrl, body, imageUrl, tag, conf, articleType,
    isPublished, publishedAt,
  ]);

  const dirty = isNew || Object.keys(changes).length > 0;

  const save = useMutation({
    mutationFn: () => {
      if (article === null) {
        const input: ArticleCreate = {
          title: t,
          kind,
          articleType,
          isPublished,
          ...(subtitle.trim() ? { subtitle: subtitle.trim() } : {}),
          ...(author.trim() ? { author: author.trim() } : {}),
          ...(imageUrl.trim() ? { imageUrl: imageUrl.trim() } : {}),
          ...(tag.trim() ? { tag: tag.trim() } : {}),
          ...(conf.trim() ? { conf: conf.trim() } : {}),
          ...(kind === "link" ? { externalUrl: externalUrl.trim() } : { body }),
          ...(fromLocalInput(publishedAt) ? { publishedAt: fromLocalInput(publishedAt) } : {}),
        };
        return createArticle(input);
      }
      return updateArticle(article.slug, changes);
    },
    onSuccess: async (saved: ArticleRecord) => {
      // Both roots: the writers' list *and* the public surfaces. `/home` carries its own copy of the
      // article rail, so skipping it leaves the home page serving the old one for five minutes —
      // which is the surface the writer was editing for.
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryRoots.articles }),
        qc.invalidateQueries({ queryKey: queryRoots.home }),
      ]);
      onSaved(isNew ? `Created "${saved.title}".` : `Saved "${saved.title}".`, saved.slug);
    },
  });

  const remove = useMutation({
    mutationFn: () => deleteArticle(article?.slug ?? ""),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryRoots.articles }),
        qc.invalidateQueries({ queryKey: queryRoots.home }),
      ]);
      onDeleted(`Deleted "${article?.title}".`);
    },
  });

  const failure = save.error ?? remove.error;

  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        if (canSave && dirty && !save.isPending) save.mutate();
      }}
    >
      <SettingsRow label="Title">
        <input
          className={CONTROL_CLASS}
          value={title}
          maxLength={TITLE_MAX}
          onChange={e => setTitle(e.target.value)}
          placeholder="Week 1 Recap"
        />
      </SettingsRow>

      <SettingsRow
        label="URL"
        hint={
          isNew
            ? "Derived from the title. This is a preview — the server derives the real one the same way, and refuses a duplicate."
            : "The permanent link to this article. It can't be changed: a different URL is a different article."
        }
      >
        <ReadOnlyValue mono>
          {isNew ? `/news/${slugPreview || "…"}` : `/news/${article.slug}`}
        </ReadOnlyValue>
      </SettingsRow>

      <SettingsRow label="Subtitle">
        <input
          className={CONTROL_CLASS}
          value={subtitle}
          maxLength={SUBTITLE_MAX}
          onChange={e => setSubtitle(e.target.value)}
          placeholder="Ferrets take the opener"
        />
      </SettingsRow>

      <div className="grid grid-cols-2 gap-4">
        <SettingsRow label="Author">
          <input
            className={CONTROL_CLASS}
            value={author}
            maxLength={AUTHOR_MAX}
            onChange={e => setAuthor(e.target.value)}
          />
        </SettingsRow>
        <SettingsRow label="Tag">
          <input
            className={CONTROL_CLASS}
            value={tag}
            maxLength={TAG_MAX}
            onChange={e => setTag(e.target.value)}
            placeholder="recap"
          />
        </SettingsRow>
      </div>

      <SettingsRow
        label="Where it lives"
        hint={
          kind === "link"
            ? "A link article opens its source in a new tab. This is the usual shape — writers work in Google Docs."
            : "A native article is written here and read at its own URL on this site."
        }
      >
        <div className="flex gap-2">
          {(["link", "native"] as const).map(k => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
              className={`flex-1 rounded-md border px-3 py-2 font-heading text-xs cursor-pointer ${
                kind === k
                  ? "border-brand text-text-bright"
                  : "border-border text-text-secondary"
              }`}
            >
              {k === "link" ? "External link" : "Written here"}
            </button>
          ))}
        </div>
      </SettingsRow>

      {kind === "link" ? (
        <SettingsRow label="Link">
          <input
            className={CONTROL_CLASS}
            value={externalUrl}
            maxLength={EXTERNAL_URL_MAX}
            onChange={e => setExternalUrl(e.target.value)}
            placeholder="https://docs.google.com/document/d/..."
          />
        </SettingsRow>
      ) : (
        <SettingsRow
          label="Body"
          hint="Markdown. Headings, lists, links, tables, bold and italic all work."
        >
          <MarkdownEditor
            value={body}
            onChange={setBody}
            preset="article"
            placeholder={"## Opening weekend\n\nThe **Ferrets** took it 2-0..."}
          />
        </SettingsRow>
      )}

      <SettingsRow label="Header image" hint="Shown on the card and at the top of the article.">
        <ImageUpload
          value={imageUrl}
          onChange={setImageUrl}
          maxLength={IMAGE_URL_MAX}
          preview="wide"
          label="Header image"
          placeholder="https://.../news/week-1.jpg"
        />
      </SettingsRow>

      <div className="grid grid-cols-2 gap-4">
        <SettingsRow label="League" hint="Site-wide posts show on every league's page.">
          <select className={CONTROL_CLASS} value={conf} onChange={e => setConf(e.target.value)}>
            <option value="">Site-wide</option>
            {tournaments.map(t => (
              <option key={t.conf} value={t.conf}>
                {t.shortname ?? t.name}
              </option>
            ))}
          </select>
        </SettingsRow>

        <SettingsRow
          label="Home page size"
          hint="The newest hero wins if there is more than one, and only two features are shown."
        >
          <select
            className={CONTROL_CLASS}
            value={articleType}
            onChange={e => setArticleType(e.target.value as ArticleType)}
          >
            {(Object.keys(TYPE_LABELS) as ArticleType[]).map(k => (
              <option key={k} value={k}>
                {TYPE_LABELS[k]}
              </option>
            ))}
          </select>
        </SettingsRow>
      </div>

      <div className="grid grid-cols-2 gap-4 items-start">
        <SettingsRow label="Published">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-text">
            <input
              type="checkbox"
              checked={isPublished}
              onChange={e => setIsPublished(e.target.checked)}
            />
            Visible to everyone
          </label>
        </SettingsRow>

        <SettingsRow
          label="Publish date"
          hint="Leave empty and publishing stamps the current time. This is also the sort order."
        >
          <input
            type="datetime-local"
            className={CONTROL_CLASS}
            value={publishedAt}
            onChange={e => setPublishedAt(e.target.value)}
          />
        </SettingsRow>
      </div>

      {slugProblem && <p className="text-ccs-red text-sm mt-1">{slugProblem}</p>}
      {contentMissing && t !== "" && (
        <p className="text-text-dim text-xs mt-1">
          {kind === "link" ? "A link article needs a URL." : "A native article needs a body."}
        </p>
      )}

      <ErrorLine message={failure ? errorMessage(failure) : null} />

      <div className="flex items-center gap-2 mt-6 pt-5 border-t border-border">
        <button type="submit" className={ACTION_PRIMARY} disabled={!canSave || !dirty || save.isPending}>
          {save.isPending ? "Saving..." : isNew ? "Create" : "Save"}
        </button>
        <button type="button" className={ACTION} onClick={onCancel}>
          Cancel
        </button>

        {!isNew && (
          <div className="ml-auto flex items-center gap-2">
            {confirmDelete ? (
              <>
                <span className="text-text-secondary text-xs">Delete permanently?</span>
                <button
                  type="button"
                  className={ACTION_SM_DANGER}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate()}
                >
                  {remove.isPending ? "Deleting..." : "Delete"}
                </button>
                <button type="button" className={ACTION} onClick={() => setConfirmDelete(false)}>
                  Keep
                </button>
              </>
            ) : (
              <button
                type="button"
                className={ACTION_SM_DANGER}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 size={13} />
                Delete
              </button>
            )}
          </div>
        )}
      </div>
    </form>
  );
}
