/**
 * Riot's description markup, rendered without ever being injected as HTML.
 *
 * Item, rune, spell and ability descriptions from Community Dragon arrive in Riot's own pseudo-HTML:
 * `<mainText><stats>...</stats><br>Passive: <passive>Spellblade</passive>...</mainText>`. The
 * original viewer regex-replaced a few tags with inline styles and handed the string to
 * `dangerouslySetInnerHTML`, which is third-party HTML on a page that does not otherwise allow any
 * (`Markdown.tsx` keeps raw HTML off for the same reason).
 *
 * So this tokenizes instead. Every tag it knows becomes a `<span>` on a token class; `<br>` is a line
 * break; `<li>` starts a bulleted line; anything else is dropped and its text kept. The output is
 * React elements, so there is no path from the CDN's bytes to the DOM as markup.
 *
 * The class per tag is the nearest CCS semantic, not Riot's client palette: magic and keywords in
 * `ccs-purple`, physical in `ccs-orange`, healing in `ccs-green`, shields and mana in `ccs-blue`,
 * actives and gold in `ccs-gold`, emphasis in `text-bright`. Both themes carry every one of them.
 */

import { Fragment, type ReactNode } from "react";

const TAG_CLASS: Record<string, string> = {
  attention: "font-semibold text-text-bright",
  passive: "font-semibold text-text-bright",
  spellname: "font-semibold text-text-bright",
  keywordmajor: "font-semibold text-text-bright",
  truedamage: "font-semibold text-text-bright",
  active: "font-semibold text-ccs-gold",
  gold: "text-ccs-gold",
  rules: "italic text-text-muted",
  stats: "text-text-secondary",
  keyword: "text-ccs-purple",
  keywordstealth: "text-ccs-purple",
  status: "text-ccs-purple",
  magicdamage: "text-ccs-purple",
  scaleap: "text-ccs-purple",
  physicaldamage: "text-ccs-orange",
  scalead: "text-ccs-orange",
  onhit: "text-ccs-orange",
  healing: "text-ccs-green",
  scalehealth: "text-ccs-green",
  lifesteal: "text-ccs-green",
  shield: "text-ccs-blue",
  scalemana: "text-ccs-blue",
  speed: "text-ccs-blue",
  scalearmor: "text-ccs-blue",
  scalemr: "text-ccs-blue",
};

/** Tags that open a new line before their content, so a stats block does not run into the prose. */
const BLOCK_TAGS = new Set(["stats", "li"]);

const ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};

function decode(text: string): string {
  return text.replace(/&(nbsp|amp|lt|gt|quot|#39);/g, m => ENTITIES[m] ?? m);
}

interface Frame {
  tag: string;
  children: ReactNode[];
}

/**
 * One pass over the string. Unknown tags still push a frame, so their closing tag pops the right
 * one; they simply render as a plain fragment.
 */
export function renderRiotText(text: string): ReactNode {
  const root: Frame = { tag: "", children: [] };
  const stack: Frame[] = [root];
  const tagPattern = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g;
  let key = 0;
  let last = 0;

  const top = (): Frame => stack[stack.length - 1];
  const pushText = (raw: string): void => {
    if (raw === "") return;
    top().children.push(decode(raw));
  };

  for (let m = tagPattern.exec(text); m !== null; m = tagPattern.exec(text)) {
    pushText(text.slice(last, m.index));
    last = m.index + m[0].length;

    const closing = m[1] === "/";
    const tag = m[2].toLowerCase();

    if (tag === "br") {
      top().children.push(<br key={key++} />);
      continue;
    }

    if (closing) {
      if (stack.length === 1) continue;
      const frame = stack.pop() as Frame;
      const className = TAG_CLASS[frame.tag];
      const content = BLOCK_TAGS.has(frame.tag) ? (
        <span key={key++} className={`block ${frame.tag === "li" ? "pl-3" : "mt-1"} ${className ?? ""}`}>
          {frame.tag === "li" ? "• " : null}
          {frame.children}
        </span>
      ) : className ? (
        <span key={key++} className={className}>
          {frame.children}
        </span>
      ) : (
        <Fragment key={key++}>{frame.children}</Fragment>
      );
      top().children.push(content);
      continue;
    }

    stack.push({ tag, children: [] });
  }

  pushText(text.slice(last));

  // Unclosed tags are common in Riot's strings; flatten whatever is still open.
  while (stack.length > 1) {
    const frame = stack.pop() as Frame;
    top().children.push(<Fragment key={key++}>{frame.children}</Fragment>);
  }

  return <>{root.children}</>;
}

export function RiotText({ text, className }: { text: string; className?: string }) {
  if (!text) return null;
  return <div className={className ?? "text-xs leading-snug text-text"}>{renderRiotText(text)}</div>;
}
