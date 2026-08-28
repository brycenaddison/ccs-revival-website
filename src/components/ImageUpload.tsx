/**
 * The one way an image gets onto the site.
 *
 * Every surface that stores an image URL — a team logo, an article's header, a picture inside an
 * article body — needs the same four things: a file picker, the size and type rules, the upload
 * itself, and somewhere to paste a URL instead. Three copies of that is three places for the 5 MB
 * limit to drift out of step with the server's.
 *
 * **The stored value is always a URL, never a file** — but the URL is not shown. Uploading is a way
 * of *producing* one rather than a different kind of value, so every consumer downstream sees the
 * same `string`; where the bytes ended up is the storage layer's business and nobody filling in a
 * team logo has a use for the address. The field appears only when uploading turns out to be
 * unavailable (`503`, no `IMAGE_UPLOAD_DIR`), which is the whole reason the value stays a URL: the
 * fallback costs a deployment the convenience and nothing else.
 *
 * Two components, because the shapes genuinely differ:
 *
 *  - `ImageUpload` owns a single URL — a logo, a header image. It shows the current value, replaces
 *    it, and clears it.
 *  - `ImageUploadButton` produces a URL and hands it back without owning anything, for a caller that
 *    is inserting into something else. The Markdown body uses it.
 */

import { useRef, useState, type ReactNode } from "react";
import { ImagePlus, Loader2, Trash2, Upload } from "lucide-react";
import { CONTROL_CLASS } from "./stats/FilterBar";
import { ACTION, ACTION_QUIET, ACTION_SM } from "./admin/adminUi";
// Imported from the barrel rather than `./uploads` so this stays the only file in `components/` that
// knows the transport exists at all.
import {
  uploadImage,
  UploadRejected,
  UPLOAD_ACCEPT,
  UPLOAD_MAX_BYTES,
} from "../lib/api";

/** The size limit as a sentence, so three call sites don't each do the arithmetic. */
export const UPLOAD_LIMIT_TEXT = `PNG, JPEG, WebP or GIF, up to ${UPLOAD_MAX_BYTES / 1024 / 1024} MB.`;

/**
 * Turn any thrown value into something worth showing.
 *
 * `UploadRejected` already carries copy written for a person — see `lib/api/uploads.ts` — so it is
 * passed straight through. Anything else is a network failure or a bug, and neither has a specific
 * thing for the user to do about it.
 */
function messageFor(error: unknown): string {
  if (error instanceof UploadRejected) return error.message;
  return "The upload failed. Check your connection and try again.";
}

/**
 * The picker and its state machine, shared by both public components.
 *
 * A plain `useState` rather than `useMutation`: this fires from a file input's change event, returns
 * one string, and has no cache to invalidate — the URL it produces is stored by whatever form owns
 * it, and until that form saves, nothing about the upload is part of any query's data.
 */
function usePicker(onUploaded: (url: string) => void) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Set once an upload comes back `503` — storage isn't configured on this deployment.
   *
   * The one failure that is about the *deployment* rather than the file, and the only one that has to
   * change the UI rather than just report itself: `ImageUpload` uses it to reveal the URL field it
   * otherwise hides. Sticky for the life of the component, because a second attempt will fail the
   * same way and asking somebody to discover that twice is worse than leaving the fallback open.
   *
   * There is no capability flag to read up front — the API has no "can I upload" endpoint — so this
   * is discovered by trying. That is why the failure copy names the fallback in the same breath.
   */
  const [unavailable, setUnavailable] = useState(false);

  async function choose(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      onUploaded(await uploadImage(file));
    } catch (e) {
      setError(messageFor(e));
      if (e instanceof UploadRejected && e.status === 503) setUnavailable(true);
    } finally {
      setBusy(false);
      // Clear the input's value or picking the *same* file again fires no change event, which reads
      // as the button having stopped working after a failed upload.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const field = (
    <input
      ref={inputRef}
      type="file"
      accept={UPLOAD_ACCEPT}
      // Off-screen rather than `hidden`: a `display: none` input is not reachable by a label click in
      // every browser, and this one is driven programmatically from a styled button.
      className="sr-only"
      tabIndex={-1}
      onChange={e => void choose(e.target.files?.[0])}
    />
  );

  return { field, busy, error, setError, unavailable, open: () => inputRef.current?.click() };
}

interface Props {
  /** The current URL, or `""` for none. Owned by the caller — this is a controlled component. */
  value: string;
  onChange: (url: string) => void;
  /** Upstream's column width, so a pasted URL can cap itself. */
  maxLength?: number;
  placeholder?: string;
  /** How the preview is shaped. A logo is square; a header image is a wide crop. */
  preview?: "square" | "wide";
  label?: string;
}

export function ImageUpload({
  value,
  onChange,
  maxLength,
  placeholder = "https://…",
  preview = "square",
  label = "Image",
}: Props) {
  const picker = usePicker(onChange);
  const trimmed = value.trim();

  const box = preview === "wide" ? "h-14 w-24 object-cover" : "h-14 w-14 object-contain";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        {/* The preview *is* the validation. An unreachable link or a non-image address is the common
            mistake, and whether it renders is the only reliable test — which is why there is no
            format check anywhere in here. */}
        {trimmed !== "" && (
          <img
            src={trimmed}
            alt=""
            className={`${box} shrink-0 rounded border border-border bg-bg2`}
          />
        )}

        {picker.field}
        <button type="button" disabled={picker.busy} onClick={picker.open} className={ACTION_SM}>
          {picker.busy ? (
            <Loader2 size={13} aria-hidden="true" className="animate-spin" />
          ) : (
            <Upload size={13} aria-hidden="true" />
          )}
          {picker.busy ? "Uploading…" : trimmed === "" ? "Upload an image" : "Replace"}
        </button>

        {trimmed !== "" && (
          <button
            type="button"
            onClick={() => {
              picker.setError(null);
              onChange("");
            }}
            className={ACTION_QUIET}
          >
            <Trash2 size={11} aria-hidden="true" />
            Remove
          </button>
        )}

        <span className="text-xs text-text-dim">{UPLOAD_LIMIT_TEXT}</span>
      </div>

      {picker.error && (
        <p role="alert" className="mt-2 text-sm text-ccs-red">
          {picker.error}
        </p>
      )}

      {/*
        The URL is hidden while uploading works, and appears only once it doesn't.

        Where the file ends up is the storage layer's business, not the writer's: somebody adding a
        team logo has no use for the address, and showing it invites editing a value that has exactly
        one correct form. So the field is not a peer of the upload button — it is what the component
        falls back to when `POST /uploads/images` answers `503`, which means this deployment has no
        `IMAGE_UPLOAD_DIR` and uploading is not a thing here at all.

        Kept rather than dropped, because "always a URL" is what makes that fallback possible: the
        stored value is identical either way, so a deployment without storage loses the convenience
        and nothing else. See the header.
      */}
      {picker.unavailable && (
        <div className="mt-3">
          <input
            value={value}
            onChange={e => onChange(e.target.value)}
            maxLength={maxLength}
            placeholder={placeholder}
            inputMode="url"
            aria-label={`${label} URL`}
            className={CONTROL_CLASS}
          />
          <p className="mt-1.5 text-xs text-text-dim">
            Host the image somewhere (Discord, Imgur) and paste the image address. If no picture
            appears above, that link isn't an image.
          </p>
        </div>
      )}
    </div>
  );
}

interface ButtonProps {
  /** Called with the uploaded URL. The caller decides what to do with it. */
  onUploaded: (url: string) => void;
  children?: ReactNode;
  className?: string;
}

/**
 * Upload one image and hand its URL to the caller, owning nothing.
 *
 * For inserting into a document rather than filling a field — see `MarkdownEditor`, which turns the
 * URL into an image tag at the cursor.
 */
export function ImageUploadButton({ onUploaded, children, className = ACTION }: ButtonProps) {
  const picker = usePicker(onUploaded);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        {picker.field}
        <button type="button" disabled={picker.busy} onClick={picker.open} className={className}>
          {picker.busy ? (
            <Loader2 size={15} aria-hidden="true" className="animate-spin" />
          ) : (
            <ImagePlus size={15} aria-hidden="true" />
          )}
          {picker.busy ? "Uploading…" : children ?? "Insert an image"}
        </button>
        <span className="text-xs text-text-dim">{UPLOAD_LIMIT_TEXT}</span>
      </div>
      {picker.error && (
        <p role="alert" className="mt-2 text-sm text-ccs-red">
          {picker.error}
        </p>
      )}
    </>
  );
}
