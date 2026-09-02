/**
 * Editorial Markdown shared by native articles, league Info pages and application notes.
 *
 * These bodies are free text typed in an authenticated editor and rendered publicly, so the safety
 * decisions live here rather than at any call site.
 *
 * **Do not add `rehype-raw`.** react-markdown does not render raw HTML by default, and that default
 * is the XSS boundary for these fields. The default `urlTransform` is also kept, which strips
 * unsafe protocols from links and images inside a body.
 *
 * **Styling is shadcn's typeset, not per-element classes.** `src/typeset.css` styles every element
 * inside a `.typeset` from the theme's tokens and three rhythm variables; the presets in `index.css`
 * set those per kind of body. So this renders plain elements and overrides only what CSS cannot say,
 * plus one thing it says differently: links open in a new tab, images load lazily, and **tables keep
 * the site's own treatment**, full width with a filled bold header row and ruled cells, because
 * typeset's bare table read as loose prose against the cards around it. Typeset's rules sit in the
 * components layer, so the utilities on these overrides win without `!important`.
 */

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Which rhythm a body reads at. See the presets in `index.css`. */
export type TypesetPreset = "article" | "notes";

export function Markdown({ body, preset = "notes" }: { body: string; preset?: TypesetPreset }) {
  return (
    <div className={`typeset typeset-${preset}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          img: ({ src, alt }) => (
            <img src={typeof src === "string" ? src : undefined} alt={alt ?? ""} loading="lazy" decoding="async" />
          ),
          table: ({ children }) => (
            // The wrapper takes typeset's flow margin (`mt-[var(--typeset-flow)]`) so the table keeps the
            // body's rhythm, and scrolls itself when a wide table would otherwise squeeze.
            <div className="mt-[var(--typeset-flow)] overflow-x-auto rounded-lg border border-border">
              <table className="my-0 w-full min-w-[520px] border-collapse text-left text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-bg3">{children}</thead>,
          tbody: ({ children }) => <tbody className="divide-y divide-border">{children}</tbody>,
          tr: ({ children }) => <tr className="align-top">{children}</tr>,
          th: ({ children }) => (
            <th className="border-b border-r border-border px-3 py-2 font-heading text-xs font-semibold text-text-bright last:border-r-0">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-r border-border border-t-0 px-3 py-2 text-text-secondary last:border-r-0">
              {children}
            </td>
          ),
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
