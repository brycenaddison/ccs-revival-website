/**
 * Empty state for a tab whose data has no endpoint yet.
 *
 * Deliberately names the route it needs rather than saying "coming soon". The Records and Scouting
 * tabs previously worked by fetching every team's matchlist and unioning the season in the browser —
 * ~24 requests to render a dozen five-row boards. That was retired rather than kept, because the
 * numbers belong in one place and the database is the place that can rank a few thousand rows without
 * shipping them all to a phone.
 *
 * Naming the endpoint also makes the gap actionable: the spec is written, so this is a to-do with an
 * address, not a dead end.
 */

interface Props {
  title: string;
  /** The route this tab is waiting on, e.g. `GET /stats/records/:conf`. */
  endpoint: string;
  /** One line on what it would show, and why it isn't computed here. */
  reason: string;
  /** Where the contract is written down. */
  spec?: string;
}

export function PendingEndpoint({ title, endpoint, reason, spec }: Props) {
  return (
    <div className="bg-bg2 border border-border rounded-lg px-6 py-12 text-center">
      <h3 className="font-display text-[18px] text-text-bright tracking-widest mb-3">{title}</h3>

      <code className="inline-block bg-bg3 border border-border rounded px-3 py-1.5 font-mono text-[12px] text-accent mb-4">
        {endpoint}
      </code>

      <p className="text-[12px] text-text-secondary max-w-[440px] mx-auto leading-relaxed">{reason}</p>

      {spec && <p className="text-[10px] text-text-dim mt-4">Contract specified in {spec}</p>}
    </div>
  );
}
