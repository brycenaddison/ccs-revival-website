/**
 * `/info` — the selected league's evergreen links and reference material.
 *
 * Unlike News, `current` may resolve to several concurrent leagues. Each has its own document, so
 * this page renders every selected conf rather than silently choosing the first. A named `?conf=`
 * still produces the usual single-league page.
 */

import { useQueries } from "@tanstack/react-query";
import { ArrowRight, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { Markdown } from "../components/Markdown";
import { PageShell } from "../components/layout/PageShell";
import { errorMessage, type InfoLink, type LeagueInfo } from "../lib/api";
import { useLeague } from "../lib/leagueContext";
import { queries } from "../lib/queries";

function QuickLink({ link }: { link: InfoLink }) {
  const classes =
    "group flex items-center justify-between gap-3 rounded-lg border border-border bg-bg2 px-4 py-3 text-text-bright hover:border-accent";
  const content = (
    <>
      <span className="font-heading text-sm tracking-wider uppercase">{link.label}</span>
      {link.url.startsWith("/") && !link.url.startsWith("//") ? (
        <ArrowRight size={15} className="shrink-0 text-text-dim group-hover:text-accent" />
      ) : (
        <ExternalLink size={14} className="shrink-0 text-text-dim group-hover:text-accent" />
      )}
    </>
  );

  return link.url.startsWith("/") && !link.url.startsWith("//") ? (
    <Link to={link.url} className={classes}>
      {content}
    </Link>
  ) : (
    <a href={link.url} target="_blank" rel="noopener noreferrer" className={classes}>
      {content}
    </a>
  );
}

function InfoDocument({ info, leagueName }: { info: LeagueInfo; leagueName: string }) {
  /**
   * The rulebook first, then the editor's own quick links in their own order.
   *
   * It is a separate field rather than an entry in `links` — the team application form reads it
   * directly, so it cannot be identified by matching a label somebody can rename. That also meant it
   * had nowhere to appear on this page, which is the one place a reader goes looking for it.
   *
   * Prepending is **not** sorting: `links` keeps the order the editor gave it, and this adds one in
   * front. The rulebook is the document every other link is subordinate to, and it is the only one
   * the editor is required to provide, so first is where it belongs rather than wherever it would
   * land if it were an ordinary entry.
   */
  const links: InfoLink[] = [
    ...(info.rulebookUrl ? [{ label: "Rulebook", url: info.rulebookUrl }] : []),
    ...info.links,
  ];

  return (
    <article>
      <p className="font-heading text-xs tracking-wider uppercase text-accent mb-1">{leagueName}</p>
      <h2 className="font-display text-[28px] text-text-bright tracking-widest mb-5">
        {info.title}
      </h2>

      {links.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
          {links.map((link, index) => (
            <QuickLink key={`${link.label}:${link.url}:${index}`} link={link} />
          ))}
        </div>
      )}

      {info.body && <Markdown body={info.body} />}
    </article>
  );
}

export default function Info() {
  const { selectedConfs, tournaments, loading: leagueLoading } = useLeague();
  const results = useQueries({
    queries: selectedConfs.map(conf => queries.leagueInfo(conf)),
  });
  const leagueNames = new Map(tournaments.map(t => [t.conf, t.name]));

  return (
    <PageShell maxWidth={900}>
      <div className="mb-7">
        <h1 className="font-display text-[22px] text-text-bright tracking-widest">INFO</h1>
        <p className="text-text-secondary text-sm">
          Important league information and frequently used links.
        </p>
      </div>

      {leagueLoading ? (
        <div className="py-16 text-center text-text-subtle">Loading...</div>
      ) : selectedConfs.length === 0 ? (
        <div className="py-16 text-center text-text-dim text-sm">No league is selected.</div>
      ) : (
        <div className="space-y-10">
          {selectedConfs.map((conf, index) => {
            const result = results[index];
            const leagueName = leagueNames.get(conf) ?? conf;

            return (
              <section key={conf} className={index > 0 ? "border-t border-border pt-10" : ""}>
                {result?.error ? (
                  <p className="text-ccs-red text-sm" role="alert">
                    {errorMessage(result.error)}
                  </p>
                ) : result?.isPending ? (
                  <div className="py-12 text-center text-text-subtle">Loading...</div>
                ) : result?.data ? (
                  <InfoDocument info={result.data} leagueName={leagueName} />
                ) : (
                  <div className="py-12 text-center">
                    <p className="font-heading text-sm tracking-wider uppercase text-text-secondary">
                      {leagueName}
                    </p>
                    <p className="text-text-dim text-sm mt-2">Nothing published yet.</p>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
