/**
 * Editorial Markdown shared by native articles and league Info pages.
 *
 * These bodies are free text typed in an authenticated editor and rendered publicly, so the safety
 * decisions live here rather than at either call site.
 *
 * **Do not add `rehype-raw`.** react-markdown does not render raw HTML by default, and that default
 * is the XSS boundary for these fields. The default `urlTransform` is also kept, which strips
 * unsafe protocols from links and images inside a body.
 */

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Markdown({ body }: { body: string }) {
  return (
    <div className="text-text text-[15px] leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
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
              className="text-brand underline underline-offset-2 hover:text-text-bright"
            >
              {children}
            </a>
          ),
          ul: ({ children }) => <ul className="list-disc pl-6 mb-4 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-6 mb-4 space-y-1">{children}</ol>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-[3px] border-brand pl-4 my-4 text-text-secondary italic">
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
          del: ({ children }) => <del className="text-text-dim">{children}</del>,
          table: ({ children }) => (
            <div className="overflow-x-auto mb-5 rounded-lg border border-border">
              <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-bg3">{children}</thead>,
          tbody: ({ children }) => <tbody className="divide-y divide-border">{children}</tbody>,
          tr: ({ children }) => <tr className="align-top">{children}</tr>,
          th: ({ children }) => (
            <th className="border-r border-border px-3 py-2 font-heading text-xs font-normal uppercase tracking-wider text-text-bright last:border-r-0">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-r border-border px-3 py-2 text-text-secondary last:border-r-0">
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
