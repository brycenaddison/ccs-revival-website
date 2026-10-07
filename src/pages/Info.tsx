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
import { DISCORD_INVITE } from "../lib/siteLinks";
import { usePageMetadata } from "../components/seo/MetadataProvider";
import { articleExcerpt } from "../lib/seo/articleMetadata";
import { useHashTarget } from "../hooks/useHashTarget";

function QuickLink({ link }: { link: InfoLink }) {
  const classes =
    "group flex items-center justify-between gap-3 rounded-lg border border-border bg-bg2 px-4 py-3 text-text-bright hover:border-brand";
  const content = (
    <>
      <span className="font-heading text-sm ">{link.label}</span>
      {link.url.startsWith("/") && !link.url.startsWith("//") ? (
        <ArrowRight size={15} className="shrink-0 text-text-dim group-hover:text-brand" />
      ) : (
        <ExternalLink size={14} className="shrink-0 text-text-dim group-hover:text-brand" />
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

function InfoDocument({ info, conf, leagueName }: { info: LeagueInfo; conf: string; leagueName: string }) {
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
      <p className="font-heading text-xs text-brand mb-1">{leagueName}</p>
      <h2 className="font-display text-[28px] text-text-bright mb-5">
        {info.title}
      </h2>

      {links.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
          {links.map((link, index) => (
            <QuickLink key={`${link.label}:${link.url}:${index}`} link={link} />
          ))}
        </div>
      )}

      {/* Several leagues can share this page, so heading IDs carry the conf. */}
      {info.body && <Markdown body={info.body} anchorPrefix={`section-${conf}-`} />}
    </article>
  );
}

export default function Info() {
  const { selectedConfs, tournaments, loading: leagueLoading } = useLeague();
  const results = useQueries({
    queries: selectedConfs.map(conf => queries.leagueInfo(conf)),
  });
  const leagueNames = new Map(tournaments.map(t => [t.conf, t.name]));
  const documents = results.flatMap(result => result.data ? [result.data] : []);
  usePageMetadata(documents.length === 1 ? {
    title: `${documents[0].title || "League Info"} | CCS`,
    description: articleExcerpt(documents[0].body ?? "") || "Read CCS league information, rules and participation details.",
  } : {});
  useHashTarget(!leagueLoading && results.every(result => !result.isPending));

  return (
    <PageShell maxWidth={900}>
      <div className="mb-7">
        <h1 className="font-display text-[22px] text-text-bright ">Info</h1>
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
                  <InfoDocument info={result.data} conf={conf} leagueName={leagueName} />
                ) : (
                  <div className="py-12 text-center">
                    <p className="font-heading text-sm text-text-secondary">
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
      <section className="mt-10 border-t border-border pt-6" aria-labelledby="participation-heading">
        <h2 id="participation-heading" className="font-display text-[22px] text-text-bright mb-3">
          Taking part in CCS
        </h2>
        <div className="space-y-3 text-sm leading-relaxed text-text-secondary">
          <p>
            CCS runs amateur League of Legends competition in North America. Teams register together;
            players without a team need to form or join one before applying.
          </p>
          <p>
            Eligibility, rank limits, schedules and fees vary by league and season. Review the league
            information and rulebook with your teammates before applying. When registration is open,
            sign in to submit a team application.
          </p>
        </div>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <QuickLink link={{ label: "Team applications", url: "/register" }} />
          {DISCORD_INVITE && <QuickLink link={{ label: "CCS Discord", url: DISCORD_INVITE }} />}
        </div>
      </section>
    </PageShell>
  );
}
