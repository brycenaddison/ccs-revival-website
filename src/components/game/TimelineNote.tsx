/**
 * What to say where a timeline would be.
 *
 * `undefined` is the read still in flight; `null` is a game Riot no longer had the timeline for when it
 * was recorded, which is the normal reason and not a fault. One component so Builds and Timeline say
 * it the same way.
 */

export function TimelineNote({ state }: { state: null | undefined }) {
  if (state === undefined) {
    return <p className="py-6 text-center font-heading text-sm text-text-muted">Loading timeline…</p>;
  }
  return (
    <p className="rounded-md border border-border bg-bg3 px-4 py-3 text-sm text-text-secondary">
      Timeline data is unavailable for this match.
    </p>
  );
}
