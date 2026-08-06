/**
 * A native article's body.
 *
 * `articles.body` is free text a writer typed, rendered on a public page, so the safety decisions
 * live here in one file rather than at the call site.
 *
 * **Do not add `rehype-raw`.** react-markdown does not render raw HTML by default, and that default
 * *is* the XSS story for this field — a `<script>` or an `<img onerror=…>` in a body comes out as
 * visible text. `rehype-raw` is precisely what a future reader will reach for when they see an
 * escaped tag and assume it is a bug; it is not, and turning it on would make every article body an
 * injection point. If real HTML is ever needed, sanitize with `rehype-sanitize` in the same change.
 *
 * The default `urlTransform` is also kept, which strips `javascript:` and `data:` hrefs. Upstream
 * already refuses those on `imageUrl`/`externalUrl`, but nothing validates URLs *inside* a body.
 *
 * Everything else here is typography: react-markdown emits bare tags, and the page has a type scale.
 */

import ReactMarkdown from "react-markdown";

interface Props {
  body: string;
}

export function Markdown({ body }: Props) {
  return (
    <div className="text-text text-[15px] leading-relaxed">
      <ReactMarkdown
        components={{
          h1: ({ children }) => (
            <h2 className="font-display text-[26px] text-text-bright tracking-widest mt-8 mb-3 first:mt-0">
              {children}
            </h2>
          ),
          h2: ({ children }) => (
            <h2 className="font-display text-[22px] text-text-bright tracking-widest mt-8 mb-3 first:mt-0">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="font-heading text-[16px] text-text-bright tracking-wider uppercase mt-6 mb-2">
              {children}
            </h3>
          ),
          p: ({ children }) => <p className="mb-4">{children}</p>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline underline-offset-2 hover:text-text-bright"
            >
              {children}
            </a>
          ),
          ul: ({ children }) => <ul className="list-disc pl-6 mb-4 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-6 mb-4 space-y-1">{children}</ol>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-[3px] border-accent pl-4 my-4 text-text-secondary italic">
              {children}
            </blockquote>
          ),
          code: ({ children }) => (
            <code className="font-mono text-[13px] bg-bg3 border border-border rounded px-1.5 py-0.5">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="font-mono text-[13px] bg-bg3 border border-border rounded-md p-4 overflow-x-auto mb-4">
              {children}
            </pre>
          ),
          hr: () => <hr className="border-0 border-t border-border my-8" />,
          img: ({ src, alt }) => (
            <img
              src={typeof src === "string" ? src : undefined}
              alt={alt ?? ""}
              loading="lazy"
              decoding="async"
              className="w-full rounded-md my-4"
            />
          ),
          strong: ({ children }) => (
            <strong className="text-text-bright font-semibold">{children}</strong>
          ),
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
