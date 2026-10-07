/**
 * The table of contents marker: a top-level paragraph of exactly `[TOC]` expands into a list of the
 * body's headings when `components/Markdown.tsx` renders it. Stored bodies keep the marker, so the
 * list follows heading edits instead of going stale. Dependency-free because the SEO scripts import
 * it under Node.
 */
export const TOC_MARKER = "[TOC]";

/** A source line that is only the marker, for plain-text excerpts. */
export const TOC_LINE = /^ {0,3}\[TOC\][ \t]*$/gm;
