import type { Element, ElementContent, Root, RootContent } from "hast";
import { toString } from "hast-util-to-string";
import { TOC_MARKER } from "./markdownToc";

/** Levels listed from the shallowest heading the body uses; deeper headings stay out of the list. */
const TOC_DEPTH = 3;

interface Heading { level: number; id: string; text: string }
interface TocEntry extends Heading { children: TocEntry[] }

function element(tagName: string, properties: Element["properties"], children: ElementContent[]): Element {
  return { type: "element", tagName, properties, children };
}

function isMarker(node: RootContent): boolean {
  if (node.type !== "element" || node.tagName !== "p" || node.children.length !== 1) return false;
  const [only] = node.children;
  return only.type === "text" && only.value.trim() === TOC_MARKER;
}

/** Read headings after `rehype-slug`, so every link uses the ID the heading actually received. */
function collectHeadings(parent: Root | Element, into: Heading[]) {
  for (const node of parent.children) {
    if (node.type !== "element") continue;
    const level = /^h([1-6])$/.exec(node.tagName)?.[1];
    const id = node.properties.id;
    if (!level) collectHeadings(node, into);
    else if (typeof id === "string") {
      const text = toString(node).trim();
      if (text) into.push({ level: Number(level), id, text });
    }
  }
}

/** Skipped levels nest under the nearest shallower heading rather than inventing empty items. */
function nest(headings: Heading[]): TocEntry[] {
  const roots: TocEntry[] = [];
  const open: TocEntry[] = [];
  for (const heading of headings) {
    const entry: TocEntry = { ...heading, children: [] };
    while (open.length && open[open.length - 1].level >= entry.level) open.pop();
    (open.length ? open[open.length - 1].children : roots).push(entry);
    open.push(entry);
  }
  return roots;
}

function list(entries: TocEntry[]): Element {
  return element("ul", {}, entries.map(entry => element("li", {}, [
    element("a", { href: `#${entry.id}` }, [{ type: "text", value: entry.text }]),
    ...(entry.children.length ? [list(entry.children)] : []),
  ])));
}

/** Expand the first top-level marker into the heading list and drop any others. */
export function rehypeToc() {
  return (tree: Root) => {
    const first = tree.children.findIndex(isMarker);
    if (first < 0) return;
    const headings: Heading[] = [];
    collectHeadings(tree, headings);
    const top = Math.min(...headings.map(heading => heading.level));
    const listed = headings.filter(heading => heading.level < top + TOC_DEPTH);
    const nav = element("nav", { ariaLabel: "Table of contents" }, [
      element("p", {}, [element("strong", {}, [{ type: "text", value: "Contents" }])]),
      list(nest(listed)),
    ]);
    tree.children = tree.children.flatMap((node, index) => !isMarker(node) ? [node] : index === first && listed.length ? [nav] : []);
  };
}
