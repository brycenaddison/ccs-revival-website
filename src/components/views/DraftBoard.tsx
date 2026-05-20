import { useState, useEffect, useMemo, useCallback } from "react";
import { db } from "../../lib/supabase";
import { timeAgo } from "../../lib/utils";
import { TeamBadge } from "../TeamBadge";

interface Props {
  isMobile: boolean;
}

interface TeamData {
  id: string;
  name: string;
  abbreviation: string;
  logo_url?: string;
  color_primary?: string;
}

interface DraftListing {
  id: string;
  listing_type: "team_lft" | "player_lft";
  is_active: boolean;
  created_at: string;
  expires_at?: string;
  team_id?: string;
  teams?: TeamData;
  player_name?: string;
  riot_id?: string;
  rank?: string;
  roles_needed?: string[];
  preferred_roles?: string[];
  description?: string;
  discord_contact?: string;
  opgg_url?: string;
  team_name?: string;
}

const ROLE_COLORS: Record<string, string> = {
  top: "#d20708", jungle: "#d7a52a", mid: "#d1d2d4", adc: "#7a2021", support: "#a07820",
};
const ROLES = ["Top", "Jungle", "Mid", "ADC", "Support"];
const RANKS = ["Iron", "Bronze", "Silver", "Gold", "Platinum", "Emerald", "Diamond", "Master", "Grandmaster", "Challenger"];

type ListingFilter = "all" | "team_lft" | "player_lft";

function RoleBadge({ role }: { role: string }) {
  const key = role.toLowerCase();
  const color = ROLE_COLORS[key] || "#666";
  return (
    <span className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-heading font-semibold tracking-wide"
      style={{ backgroundColor: color + "22", color, border: `1px solid ${color}44` }}>
      {role.charAt(0).toUpperCase() + role.slice(1)}
    </span>
  );
}

export function DraftBoard({ isMobile }: Props) {
  const [listings, setListings] = useState<DraftListing[]>([]);
  const [rosterCounts, setRosterCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<ListingFilter>("all");
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [rankFilter, setRankFilter] = useState("");

  // Create form state
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<"team_lft" | "player_lft">("player_lft");
  const [formTeamName, setFormTeamName] = useState("");
  const [formRoles, setFormRoles] = useState<string[]>([]);
  const [formPlayerName, setFormPlayerName] = useState("");
  const [formRiotId, setFormRiotId] = useState("");
  const [formOpgg, setFormOpgg] = useState("");
  const [formRank, setFormRank] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formDiscord, setFormDiscord] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const [listingsData, rostersData] = await Promise.all([
        db("draft_listings", { query: "?select=*,teams(id,name,abbreviation,logo_url,color_primary)&is_active=eq.true&order=created_at.desc" }),
        db("rosters", { query: "?select=team_id&left_at=is.null&is_starter=eq.true" }),
      ]);
      setListings(listingsData || []);
      const counts: Record<string, number> = {};
      if (rostersData) {
        for (const r of rostersData as { team_id: string }[]) {
          counts[r.team_id] = (counts[r.team_id] || 0) + 1;
        }
      }
      setRosterCounts(counts);
    } catch (err) { console.error("Failed to fetch draft board:", err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);


  // Check if a player name already has an active listing
  const hasActivePlayerListing = useCallback((name: string) => {
    return listings.some(l => l.listing_type === "player_lft" && l.is_active && l.player_name?.toLowerCase() === name.toLowerCase());
  }, [listings]);

  const handleSubmit = async () => {
    setFormError("");
    setFormSuccess("");

    if (formType === "team_lft") {
      if (!formTeamName.trim()) { setFormError("Team name required"); return; }
      if (formRoles.length === 0) { setFormError("Select at least one role needed"); return; }
      if (!formDiscord.trim()) { setFormError("Discord contact required"); return; }
    } else {
      if (!formPlayerName.trim()) { setFormError("Player name required"); return; }
      if (formRoles.length === 0) { setFormError("Select at least one preferred role"); return; }
      if (!formDiscord.trim()) { setFormError("Discord contact required"); return; }
      if (hasActivePlayerListing(formPlayerName.trim())) { setFormError("You already have an active listing"); return; }
    }

    setSubmitting(true);
    try {
      const expires = new Date();
      expires.setDate(expires.getDate() + 14);

      const body: Record<string, unknown> = {
        listing_type: formType,
        discord_contact: formDiscord.trim(),
        description: formDescription.trim() || null,
        is_active: true,
        expires_at: expires.toISOString(),
      };

      if (formType === "team_lft") {
        body.team_name = formTeamName.trim();
        body.roles_needed = formRoles;
      } else {
        body.player_name = formPlayerName.trim();
        body.riot_id = formRiotId.trim() || null;
        body.opgg_url = formOpgg.trim() || null;
        body.preferred_roles = formRoles;
        body.rank = formRank || null;
      }

      await db("draft_listings", { method: "POST", body });
      setFormSuccess("Listing posted!");
      setFormTeamName(""); setFormRoles([]); setFormPlayerName(""); setFormRiotId("");
      setFormOpgg(""); setFormRank(""); setFormDescription(""); setFormDiscord("");
      setTimeout(() => { setShowForm(false); setFormSuccess(""); }, 1500);
      fetchData();
    } catch (e: any) {
      setFormError(e.message || "Failed to post listing");
    }
    setSubmitting(false);
  };

  const toggleRole = (role: string) => setSelectedRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]);
  const toggleFormRole = (role: string) => setFormRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]);

  const filtered = useMemo(() => {
    const now = Date.now();
    return listings.filter(l => {
      if (l.expires_at && new Date(l.expires_at).getTime() < now) return false;
      if (filterType !== "all" && l.listing_type !== filterType) return false;
      if (selectedRoles.length > 0) {
        const roles = (l.listing_type === "team_lft" ? l.roles_needed || [] : l.preferred_roles || []).map(r => r.toLowerCase());
        if (!selectedRoles.some(r => roles.includes(r.toLowerCase()))) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        const hay = [l.teams?.name, l.team_name, l.player_name, l.riot_id, l.description].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (rankFilter && l.listing_type === "player_lft") {
        if (!l.rank || !l.rank.toLowerCase().startsWith(rankFilter.toLowerCase())) return false;
      }
      return true;
    });
  }, [listings, filterType, selectedRoles, search, rankFilter]);

  if (loading) return <div className="py-10 text-center text-text-muted text-[13px]">Loading draft board...</div>;

  return (
    <div className="max-w-[900px] mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-[22px] text-text-bright tracking-widest">DRAFT BOARD</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className={`px-4 py-2 rounded-md text-[13px] font-heading font-semibold tracking-wider uppercase transition-colors ${
            showForm ? "bg-bg3 text-text-secondary border border-border" : "bg-accent text-white"
          }`}
        >
          {showForm ? "Cancel" : "+ Post Listing"}
        </button>
      </div>

      {/* Create Listing Form */}
      {showForm && (
        <div className="bg-bg2 border border-border rounded-lg overflow-hidden mb-5">
          <div className="px-4 py-3.5 border-b border-border">
            <span className="font-display text-[15px] text-text-bright tracking-widest">CREATE LISTING</span>
          </div>
          <div className="p-4">
            {/* Type toggle */}
            <div className="flex gap-2 mb-4">
              {[{ label: "I'm a Player LFT", value: "player_lft" as const }, { label: "My Team is LFP", value: "team_lft" as const }].map(opt => (
                <button key={opt.value} onClick={() => { setFormType(opt.value); setFormRoles([]); }}
                  className={`px-4 py-2 rounded-md text-[13px] font-heading font-semibold transition-colors ${
                    formType === opt.value ? "bg-accent text-white" : "bg-bg3 text-text-secondary border border-border"
                  }`}>
                  {opt.label}
                </button>
              ))}
            </div>

            {formType === "team_lft" ? (
              <>
                <div className="mb-3">
                  <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1 block">Team Name</label>
                  <input className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none"
                    placeholder="Your team name" value={formTeamName} onChange={e => setFormTeamName(e.target.value)} />
                </div>
                <div className="mb-3">
                  <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1 block">Roles Needed</label>
                  <div className="flex gap-2 flex-wrap">
                    {ROLES.map(r => (
                      <button key={r} onClick={() => toggleFormRole(r)}
                        className="rounded-md px-3 py-1.5 text-[12px] font-heading font-semibold transition-colors border"
                        style={{
                          backgroundColor: formRoles.includes(r) ? (ROLE_COLORS[r.toLowerCase()] || "#666") + "33" : "transparent",
                          color: formRoles.includes(r) ? ROLE_COLORS[r.toLowerCase()] || "#666" : "var(--text-secondary)",
                          borderColor: formRoles.includes(r) ? (ROLE_COLORS[r.toLowerCase()] || "#666") + "66" : "var(--border)",
                        }}>
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex gap-3 mb-3">
                  <div className="flex-1 flex flex-col">
                    <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">Player Name</label>
                    <input className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none"
                      placeholder="Your name" value={formPlayerName} onChange={e => setFormPlayerName(e.target.value)} />
                  </div>
                  <div className="flex-1 flex flex-col">
                    <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">Riot ID</label>
                    <input className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none"
                      placeholder="Name#Tag" value={formRiotId} onChange={e => setFormRiotId(e.target.value)} />
                  </div>
                </div>
                <div className="flex gap-3 mb-3">
                  <div className="flex-1 flex flex-col">
                    <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">OP.GG Link</label>
                    <input className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none"
                      placeholder="https://op.gg/..." value={formOpgg} onChange={e => setFormOpgg(e.target.value)} />
                  </div>
                  <div className="flex-1 flex flex-col">
                    <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">Rank</label>
                    <select className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none cursor-pointer"
                      value={formRank} onChange={e => setFormRank(e.target.value)}>
                      <option value="">Select rank...</option>
                      {RANKS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                </div>
                <div className="mb-3">
                  <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1 block">Preferred Roles</label>
                  <div className="flex gap-2 flex-wrap">
                    {ROLES.map(r => (
                      <button key={r} onClick={() => toggleFormRole(r)}
                        className="rounded-md px-3 py-1.5 text-[12px] font-heading font-semibold transition-colors border"
                        style={{
                          backgroundColor: formRoles.includes(r) ? (ROLE_COLORS[r.toLowerCase()] || "#666") + "33" : "transparent",
                          color: formRoles.includes(r) ? ROLE_COLORS[r.toLowerCase()] || "#666" : "var(--text-secondary)",
                          borderColor: formRoles.includes(r) ? (ROLE_COLORS[r.toLowerCase()] || "#666") + "66" : "var(--border)",
                        }}>
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Shared fields */}
            <div className="mb-3">
              <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1 block">Discord</label>
              <input className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none"
                placeholder="username or username#1234" value={formDiscord} onChange={e => setFormDiscord(e.target.value)} />
            </div>
            <div className="mb-4">
              <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1 block">Description (optional)</label>
              <textarea className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none resize-y min-h-[60px]"
                placeholder={formType === "team_lft" ? "What kind of player are you looking for?" : "Tell teams about yourself..."}
                value={formDescription} onChange={e => setFormDescription(e.target.value)} />
            </div>

            {formError && <div className="text-ccs-red text-[12px] mb-3">{formError}</div>}
            {formSuccess && <div className="text-ccs-green text-[12px] mb-3">{formSuccess}</div>}

            <button onClick={handleSubmit} disabled={submitting}
              className="bg-accent text-white border-none rounded-md px-5 py-2.5 text-[13px] font-heading font-medium tracking-wider uppercase cursor-pointer"
              style={{ opacity: submitting ? 0.6 : 1 }}>
              {submitting ? "Posting..." : "Post Listing"}
            </button>
          </div>
        </div>
      )}

      {/* Type toggle */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {([{ label: "All", value: "all" }, { label: "Teams LFP", value: "team_lft" }, { label: "Players LFT", value: "player_lft" }] as { label: string; value: ListingFilter }[]).map(btn => (
          <button key={btn.value} onClick={() => setFilterType(btn.value)}
            className={`px-4 py-2 rounded-md text-[13px] font-heading font-semibold transition-colors ${
              filterType === btn.value ? "bg-accent text-white" : "bg-bg3 text-text-secondary hover:text-text border border-border"
            }`}>
            {btn.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        {ROLES.map(role => {
          const key = role.toLowerCase();
          const active = selectedRoles.includes(role);
          const color = ROLE_COLORS[key] || "#666";
          return (
            <button key={role} onClick={() => toggleRole(role)}
              className="rounded-md px-3 py-1.5 text-[12px] font-heading font-semibold transition-colors border"
              style={{
                backgroundColor: active ? color + "33" : "transparent",
                color: active ? color : "var(--text-secondary)",
                borderColor: active ? color + "66" : "var(--border)",
              }}>
              {role}
            </button>
          );
        })}
        <input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
          className="bg-bg-input border border-border3 rounded-md text-text py-2 px-3 text-[13px] font-body flex-1 min-w-[120px] outline-none" />
        <select value={rankFilter} onChange={e => setRankFilter(e.target.value)}
          className="bg-bg-input border border-border3 rounded-md text-text py-2 px-3 text-[13px] font-heading cursor-pointer">
          <option value="">All Ranks</option>
          {RANKS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center text-text-muted text-[14px]">No listings right now — check back later!</div>
      ) : (
        <div className={`grid gap-3 ${isMobile ? "grid-cols-1" : "grid-cols-2"}`}>
          {filtered.map(listing => listing.listing_type === "team_lft" ? (
            <div key={listing.id} className="bg-bg2 border border-border rounded-lg overflow-hidden p-4 flex flex-col gap-2.5">
              <div className="flex items-center gap-3">
                {listing.teams?.logo_url && <TeamBadge team={listing.teams} size={36} />}
                <div className="flex-1 min-w-0">
                  <div className="font-heading text-sm text-text-bright font-semibold truncate">
                    {listing.teams?.name || listing.team_name || "Unknown"} {listing.teams?.abbreviation && <span className="text-text-muted font-normal">({listing.teams.abbreviation})</span>}
                  </div>
                </div>
              </div>
              {listing.roles_needed && listing.roles_needed.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-text-muted font-heading">Roles needed:</span>
                  {listing.roles_needed.map(r => <RoleBadge key={r} role={r} />)}
                </div>
              )}
              {listing.description && <p className="text-[13px] text-text-secondary italic leading-relaxed">&ldquo;{listing.description}&rdquo;</p>}
              <div className="flex items-center justify-between text-[11px] text-text-muted mt-auto">
                {listing.discord_contact && <span className="font-mono">Discord: {listing.discord_contact}</span>}
                <span>Posted {timeAgo(listing.created_at)}</span>
              </div>
            </div>
          ) : (
            <div key={listing.id} className="bg-bg2 border border-border rounded-lg overflow-hidden p-4 flex flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <div className="font-heading text-sm text-text-bright font-semibold">{listing.player_name || "Unknown"}</div>
                {listing.rank && <span className="text-[12px] text-text-secondary">&mdash; {listing.rank}</span>}
              </div>
              {listing.preferred_roles && listing.preferred_roles.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-text-muted font-heading">Preferred:</span>
                  {listing.preferred_roles.map(r => <RoleBadge key={r} role={r} />)}
                </div>
              )}
              {listing.description && <p className="text-[13px] text-text-secondary italic leading-relaxed">&ldquo;{listing.description}&rdquo;</p>}
              <div className="flex items-center justify-between text-[11px] text-text-muted mt-auto flex-wrap gap-1">
                <div className="flex items-center gap-2">
                  {listing.opgg_url && <a href={listing.opgg_url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline font-mono">OP.GG</a>}
                  {listing.opgg_url && listing.discord_contact && <span>|</span>}
                  {listing.discord_contact && <span className="font-mono">Discord: {listing.discord_contact}</span>}
                </div>
                <span>Posted {timeAgo(listing.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
