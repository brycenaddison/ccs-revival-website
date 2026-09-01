/**
 * A Markdown textarea that can put an image into itself.
 *
 * The body field was a bare `<textarea>`, which meant an image inside an article had to be authored
 * by hand: upload the file somewhere, copy the URL, remember the `![](…)` syntax, and type it in the
 * right place. The upload endpoint removes the first two steps, so this removes the other two.
 *
 * **Insertion is at the cursor, not at the end.** A writer who wants a picture after the third
 * paragraph puts the caret there, and appending to the bottom instead would mean cutting and pasting
 * the tag into place — the exact manual step this exists to avoid. The selection is read off the
 * textarea rather than tracked in state, because the DOM already holds it accurately and mirroring it
 * would go stale on every keystroke.
 *
 * The tag is written on its own blank-line-separated block. Markdown renders an image inline when it
 * sits inside a paragraph, so pasting one mid-sentence would put it between two words rather than
 * between two paragraphs — which is never what somebody inserting a photo meant.
 */

import { useRef } from "react";
import { CONTROL_CLASS } from "../stats/FilterBar";
import { ImageUploadButton } from "../ImageUpload";

interface Props {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  /** Labels the textarea, since the visible label belongs to the row that wraps this. */
  ariaLabel?: string;
}

/** Markdown for an image, as its own block. `alt` is left empty for the writer to fill in. */
function imageBlock(url: string): string {
  return `![](${url})`;
}

export function MarkdownEditor({
  value,
  onChange,
  rows = 14,
  placeholder,
  ariaLabel = "Body",
}: Props) {
  const areaRef = useRef<HTMLTextAreaElement>(null);

  function insert(url: string) {
    const area = areaRef.current;
    const tag = imageBlock(url);

    // No textarea to read a caret from — only possible if this is called before mount — so append.
    if (!area) {
      onChange(value === "" ? tag : `${value}\n\n${tag}`);
      return;
    }

    const start = area.selectionStart;
    const end = area.selectionEnd;
    const before = value.slice(0, start);
    const after = value.slice(end);

    // Pad to a blank line on each side, but only where there isn't one already — otherwise inserting
    // twice in the same spot walks the image further and further down the document.
    const lead = before === "" || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
    const tail = after === "" || after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
    const next = `${before}${lead}${tag}${tail}${after}`;

    onChange(next);

    // Put the caret inside the empty `alt` so the writer can type a description immediately — that is
    // the field most likely to be skipped, and it is what a screen reader reads. Deferred to the next
    // frame because the value is controlled: React has not re-rendered the new text yet, so setting a
    // selection now would be against the old content and land in the wrong place.
    const caret = before.length + lead.length + 2;
    requestAnimationFrame(() => {
      area.focus();
      area.setSelectionRange(caret, caret);
    });
  }

  return (
    <div>
      <textarea
        ref={areaRef}
        className={`${CONTROL_CLASS} font-mono text-xs`}
        rows={rows}
        value={value}
        aria-label={ariaLabel}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
      />
      <div className="mt-2">
        <ImageUploadButton onUploaded={insert}>Insert an image</ImageUploadButton>
      </div>
      <p className="mt-1.5 text-xs text-text-dim">
        The image goes in at the cursor. Provide a description of the image between the square brackets.
      </p>
    </div>
  );
}
