/**
 * "Who finished where" — the earlier tables an admin looks at while placing entry slots or wiring
 * seed sources.
 *
 * Read-only. Nothing here fills a slot; a seed source does that, only from a final table and never
 * from a tied row. A tie the ranking will not break is exactly the case where the automatic answer is
 * wrong and a human has to decide, so a tied row is marked and its scenario is provisional.
 *
 * Rows lead with `position`, the row number a seed source's place names, and show the shared `place`
 * ("T-3") beside a tied row.
 *
 * Shared by two screens that cannot share a data source. Site Admin has
 * `GET /:conf/phases/:id/candidates`, which is credentialed and site-admin only; League Admin has
 * only the season document, because that route would 403 for it. Both arrive here, so the panel a
 * league admin reads is the same panel a site admin reads — see `toReference` in the bracket editor
 * and `earlierTables` in League Admin's bracket for the adaptation.
 */

import { Badge } from "@/components/ui/badge";

export interface ReferenceRow {
  /** Stable within a table. A team code, or an id where the source has one. */
  key: string;
  /** The 1-based row, which a seed source's place addresses. */
  position: number;
  /** The rank as displayed: `"1"`, or `"T-2"` when shared. */
  place: string;
  code: string;
  /** Shares its rank, so its scenario is provisional. */
  tied: boolean;
  seriesWins: number;
  seriesLosses: number;
  scenario: { title: string; subtitle: string } | null;
}

export interface ReferenceTable {
  key: string;
  /** `"Group Stage · Group A"` — phase and group, because a season can have several of each. */
  heading: string;
  /** Whether seed sources can read it yet: "Final", "Seeds after round 2", "In progress". */
  status?: string;
  rows: readonly ReferenceRow[];
}

export function StandingsReference({
  loading,
  error,
  tables,
  compact,
}: {
  loading?: boolean;
  error?: string | null;
  tables: readonly ReferenceTable[];
  /**
   * Stack the tables in one narrow column instead of spreading them across the page.
   *
   * For the sidebar on the League Admin bracket, where the whole point is that the panel stays on
   * screen beside the thing it is informing — so it has a column's width, not a page's, and no rule
   * above it to separate it from content that is no longer underneath it.
   */
  compact?: boolean;
}) {
  // Not `adminUi`'s `ErrorLine`: this component sits under `season/` and is shared with a public-side
  // module tree, so it does not import from `admin/`. Same color, no dependency.
  if (error) {
    return (
      <p role="alert" className="text-sm text-ccs-red">
        Couldn&rsquo;t load the standings panel: {error}
      </p>
    );
  }
  if (loading) return <p className="text-sm text-text-dim">Loading standings…</p>;

  if (tables.length === 0) {
    return (
      <p className="text-sm text-text-dim">
        No earlier table to seed from. A group stage always has one; an earlier bracket phase has one
        only once Standings table is turned on for it in Site Admin&rsquo;s season list.
      </p>
    );
  }

  return (
    <section className={compact ? "" : "border-t border-border pt-4"}>
      <h3 className="mb-1 font-heading text-xs text-text-secondary">
        Who finished where
      </h3>
      <p className={`text-text-secondary ${compact ? "mb-3 text-xs" : "mb-3 text-sm"}`}>
        For reference while placing entry slots. A slot reading a place fills in once its table is final.
      </p>

      <div className={compact ? "flex flex-col gap-3" : "grid gap-3 sm:grid-cols-2 lg:grid-cols-3"}>
        {tables.map(table => (
          <div key={table.key} className="rounded-md border border-border bg-bg3 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="font-heading text-[10px] text-text-dim">{table.heading}</p>
              {table.status && <Badge variant="muted">{table.status}</Badge>}
            </div>
            <ol className="flex flex-col gap-1">
              {table.rows.map(row => (
                <li key={row.key} className="flex items-baseline gap-2 text-sm">
                  <span className="w-6 shrink-0 font-mono text-xs text-text-secondary">{row.position}</span>
                  <span className="text-text-bright">{row.code}</span>
                  <span className="text-xs text-text-dim">
                    {row.seriesWins}-{row.seriesLosses}
                  </span>
                  {/* A seed source on a tied row stays empty until a person breaks the tie. */}
                  {row.tied && <span className="font-mono text-[10px] text-ccs-orange">Tied {row.place}</span>}
                  {row.scenario && (
                    <span
                      className={`ml-auto text-right text-xs ${
                        row.tied ? "italic text-text-dim" : "text-text-secondary"
                      }`}
                      title={
                        row.tied
                          ? "Provisional — this team shares its rank, so the outcome is not settled"
                          : row.scenario.subtitle
                      }
                    >
                      {row.scenario.title}
                      {row.tied ? "?" : ""}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}
