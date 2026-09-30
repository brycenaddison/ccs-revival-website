/**
 * The page-level back link: `← Back` in the caption face, brand on hover.
 *
 * Two forms, because a page means one of two things by "back":
 *
 *  - **History** (`fallback`): a page reached from many places (a team, a match, a game, a
 *    prediction) steps back to wherever the reader came from, and lands on `fallback` on a cold
 *    arrival, where there is no back. See `useBackNavigation`. On that cold arrival it reads
 *    `fallbackLabel` when one is given ("← Home"), because "Back" would promise the wrong thing.
 *  - **Destination** (`to` + `label`): a page with one natural parent that should be reached even
 *    from search, like an article's "← All news". A real `Link`, not a history step.
 *
 * In-panel back buttons inside settings sections are a different control; see `BackButton` in
 * `admin/adminUi.tsx`.
 */

import { Link, type To } from "react-router-dom";
import { useBackNavigation } from "../hooks/useGoBack";

const CLASS =
  "mb-4 inline-block cursor-pointer border-none bg-transparent p-0 font-heading text-xs text-text-secondary no-underline hover:text-brand hover:underline";

type Props =
  | { fallback: To; fallbackLabel?: string; to?: never; label?: never }
  | { to: To; label: string; fallback?: never; fallbackLabel?: never };

export function BackLink(props: Props) {
  if (props.to !== undefined) return <Link to={props.to} className={CLASS}>&larr; {props.label}</Link>;
  return <HistoryBackLink fallback={props.fallback ?? "/"} fallbackLabel={props.fallbackLabel} />;
}

function HistoryBackLink({ fallback, fallbackLabel }: { fallback: To; fallbackLabel?: string }) {
  const { goBack, isFallback } = useBackNavigation(fallback);
  return (
    <button type="button" onClick={goBack} className={CLASS}>
      &larr; {isFallback && fallbackLabel ? fallbackLabel : "Back"}
    </button>
  );
}
