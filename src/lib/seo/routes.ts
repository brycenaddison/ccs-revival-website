import { defaultMetadata, type PageMetadata } from "./metadata.ts";
import { canonicalPath, publicUrl, SITE_NAME } from "./site.ts";

const publicPages: Record<string, [string, string]> = {
  "/news": ["News", "Recaps, roster moves and announcements from every CCS season."],
  "/info": ["League Info", "Read CCS league information, rules and participation details."],
  "/teams": ["Teams", "Explore CCS teams and their rosters."],
  "/standings": ["Standings", "Follow the CCS league standings and competition."],
  "/schedule": ["Schedule", "Find upcoming CCS League of Legends matches."],
  "/scores": ["Scores", "Explore recent CCS matches and results."],
  "/stats": ["Statistics", "Explore player, team and champion statistics from CCS competition."],
  "/predictions": ["Predictions", "Browse published CCS series winner predictions and point pools."],
  "/predictions/leaderboard": ["Prediction leaderboard", "See server-ranked CCS prediction participants."],
};

export function routeMetadata(pathname: string, search: string, origin: string): PageMetadata {
  const clean = pathname.replace(/\/+$/, "").toLowerCase() || "/";
  const path = canonicalPath(publicPages[clean] ? clean : pathname, search);
  if (clean === "/") return {
    ...defaultMetadata(), path,
    structuredData: { "@context": "https://schema.org", "@type": "WebSite", name: SITE_NAME, alternateName: "CCS", url: publicUrl(origin, "/") },
  };
  const page = publicPages[clean];
  if (page) return { title: `${page[0]} | CCS`, description: page[1], path };
  const family = /^\/news\/page\/[^/]+$/.test(clean) ? "News" : /^\/news\/[^/]+$/.test(clean) ? "Article"
    : /^\/players\/[^/]+$/.test(clean) ? "Player profile" : /^\/teams\/\d+$/.test(clean) ? "Team"
    : /^\/match\/[^/]+$/.test(clean) ? "Match" : /^\/game\/[^/]+(?:\/[^/]+)?$/.test(clean) ? "Game"
    : /^\/predictions\/[^/]+$/.test(clean) ? "Prediction" : null;
  if (family) return { title: `${family} | CCS`, description: defaultMetadata().description, path };
  // A public allowlist keeps every account/admin route and unknown route out of the index.
  return { title: SITE_NAME, description: defaultMetadata().description, noindex: true };
}
