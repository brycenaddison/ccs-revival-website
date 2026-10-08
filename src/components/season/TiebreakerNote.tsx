/**
 * "How ties are broken": the conference's tiebreaker order under its standings tables.
 *
 * Once per page, not per group, because every group in a conference ranks by the same list. Names
 * come from the served catalog, never a local copy. The caller omits it when the read fails: the
 * tables never depend on it.
 */

import { tiebreakerInfos, type TiebreakerDocument } from "../../lib/api";

export function TiebreakerNote({ doc }: { doc: TiebreakerDocument }) {
  const rules = tiebreakerInfos(doc);
  if (rules.length === 0) return null;

  return (
    <details className="mt-4 rounded-md border border-border bg-bg2 px-4 py-3">
      <summary className="cursor-pointer font-heading text-sm text-text-bright">How ties are broken</summary>
      <ol className="mt-3 flex list-decimal flex-col gap-1.5 pl-5 text-sm text-text">
        {rules.map(rule => (
          <li key={rule.id}>
            {rule.label}
            {rule.description && <span className="block text-xs text-text-dim">{rule.description}</span>}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-text-muted">
        Teams are ranked by each rule in order. Teams still tied after these share a place (shown as T-2).
      </p>
    </details>
  );
}
