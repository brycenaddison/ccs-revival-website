import { useState, useEffect, useCallback } from "react";
import { db } from "../../lib/supabase";

interface Props {
  toast: (msg: string, type?: "success" | "error") => void;
}

const ROLES = ["Top", "Jungle", "Mid", "ADC", "Support"];
const RANKS = ["Iron", "Bronze", "Silver", "Gold", "Platinum", "Emerald", "Diamond", "Master", "Grandmaster", "Challenger"];

type ListingMode = "team_lfp" | "player_lft";

interface TeamOption {
  id: string;
  name: string;
  abbreviation: string;
  starterCount: number;
}

export function DraftBoardTab({ toast }: Props) {
  // Settings
  const [defaultExpiry, setDefaultExpiry] = useState(14);

  // Mode toggle
  const [mode, setMode] = useState<ListingMode>("team_lfp");

  // Team LFP form
  const [teamId, setTeamId] = useState("");
  const [rolesNeeded, setRolesNeeded] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [discord, setDiscord] = useState("");

  // Player LFT form
  const [playerName, setPlayerName] = useState("");
  const [riotId, setRiotId] = useState("");
  const [opggUrl, setOpggUrl] = useState("");
  const [preferredRoles, setPreferredRoles] = useState<string[]>([]);
  const [rank, setRank] = useState("");
  const [playerDescription, setPlayerDescription] = useState("");
  const [playerDiscord, setPlayerDiscord] = useState("");

  // Data
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadTeams = useCallback(async () => {
    try {
      const allTeams = await db("teams", { query: "?select=id,name,abbreviation&order=name" }) || [];
      const rosterCounts = await db("rosters", { query: "?select=team_id&left_at=is.null&is_starter=eq.true" }) || [];

      const countMap: Record<string, number> = {};
      for (const r of rosterCounts) {
        countMap[r.team_id] = (countMap[r.team_id] || 0) + 1;
      }

      const eligible: TeamOption[] = allTeams
        .map((t: any) => ({ id: t.id, name: t.name, abbreviation: t.abbreviation, starterCount: countMap[t.id] || 0 }))
        .filter((t: TeamOption) => t.starterCount < 5);

      setTeams(eligible);
    } catch (e: any) {
      toast(e.message, "error");
    }
  }, [toast]);

  const loadListings = useCallback(async () => {
    try {
      const data = await db("draft_listings", { query: "?select=*,teams(name,abbreviation)&order=created_at.desc" }) || [];
      setListings(data);
    } catch (e: any) {
      toast(e.message, "error");
    }
  }, [toast]);

  const load = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadTeams(), loadListings()]);
    setLoading(false);
  }, [loadTeams, loadListings]);

  useEffect(() => { load(); }, [load]);

  const toggleRole = (role: string, list: string[], setter: (v: string[]) => void) => {
    setter(list.includes(role) ? list.filter(r => r !== role) : [...list, role]);
  };

  const resetForm = () => {
    setTeamId("");
    setRolesNeeded([]);
    setDescription("");
    setDiscord("");
    setPlayerName("");
    setRiotId("");
    setOpggUrl("");
    setPreferredRoles([]);
    setRank("");
    setPlayerDescription("");
    setPlayerDiscord("");
  };

  const createListing = async () => {
    if (mode === "team_lfp") {
      if (!teamId) { toast("Team is required", "error"); return; }
      if (rolesNeeded.length === 0) { toast("Select at least one role", "error"); return; }
      if (!discord.trim()) { toast("Discord contact is required", "error"); return; }

      // Check team doesn't already have an active listing
      const existing = listings.find(
        l => l.team_id === teamId && l.is_active && (!l.expires_at || new Date(l.expires_at) > new Date())
      );
      if (existing) { toast("This team already has an active listing", "error"); return; }

      // Check team doesn't have 5+ starters
      const team = teams.find(t => t.id === teamId);
      if (team && team.starterCount >= 5) { toast("This team already has 5 starters", "error"); return; }

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + defaultExpiry);

      setSaving(true);
      try {
        await db("draft_listings", {
          method: "POST",
          body: {
            type: "team_lfp",
            team_id: teamId,
            roles: rolesNeeded,
            description: description.trim() || null,
            discord_contact: discord.trim(),
            expires_at: expiresAt.toISOString(),
            is_active: true,
          },
        });
        toast("Listing created", "success");
        resetForm();
        load();
      } catch (e: any) { toast(e.message, "error"); }
      setSaving(false);
    } else {
      if (!playerName.trim()) { toast("Player name is required", "error"); return; }
      if (preferredRoles.length === 0) { toast("Select at least one role", "error"); return; }
      if (!playerDiscord.trim()) { toast("Discord contact is required", "error"); return; }

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + defaultExpiry);

      setSaving(true);
      try {
        await db("draft_listings", {
          method: "POST",
          body: {
            type: "player_lft",
            player_name: playerName.trim(),
            riot_id: riotId.trim() || null,
            opgg_url: opggUrl.trim() || null,
            roles: preferredRoles,
            rank: rank || null,
            description: playerDescription.trim() || null,
            discord_contact: playerDiscord.trim(),
            expires_at: expiresAt.toISOString(),
            is_active: true,
          },
        });
        toast("Listing created", "success");
        resetForm();
        load();
      } catch (e: any) { toast(e.message, "error"); }
      setSaving(false);
    }
  };

  const toggleActive = async (listing: any) => {
    try {
      await db(`draft_listings?id=eq.${listing.id}`, {
        method: "PATCH",
        body: { is_active: !listing.is_active },
      });
      toast(listing.is_active ? "Listing deactivated" : "Listing activated", "success");
      loadListings();
    } catch (e: any) { toast(e.message, "error"); }
  };

  const deleteListing = async (id: string) => {
    if (!confirm("Delete this listing?")) return;
    try {
      await db(`draft_listings?id=eq.${id}`, { method: "DELETE" });
      toast("Listing deleted", "success");
      loadListings();
    } catch (e: any) { toast(e.message, "error"); }
  };

  const getStatus = (listing: any): { label: string; color: string } => {
    if (!listing.is_active) return { label: "Inactive", color: "text-text-secondary" };
    if (listing.expires_at && new Date(listing.expires_at) < new Date()) return { label: "Expired", color: "text-orange-400" };
    return { label: "Active", color: "text-green-400" };
  };

  const RolePills = ({ roles, selected, onToggle }: { roles: string[]; selected: string[]; onToggle: (role: string) => void }) => (
    <div className="flex flex-wrap gap-2">
      {roles.map(role => (
        <button
          key={role}
          type="button"
          onClick={() => onToggle(role)}
          className={`px-3 py-1.5 rounded-full text-[11px] font-heading font-medium tracking-wider uppercase cursor-pointer border transition-colors ${
            selected.includes(role)
              ? "bg-accent text-white border-accent"
              : "bg-transparent text-text-secondary border-border2 hover:border-text-secondary"
          }`}
        >
          {role}
        </button>
      ))}
    </div>
  );

  if (loading) return <div className="text-text-secondary text-center py-8">Loading draft board...</div>;

  return (
    <div>
      {/* Settings */}
      <div className="bg-bg2 border border-border rounded-lg overflow-hidden mb-4">
        <div className="px-4 py-3.5 border-b border-border">
          <span className="font-display text-[17px] text-text-bright tracking-widest">SETTINGS</span>
        </div>
        <div className="p-4">
          <div className="max-w-xs">
            <label className="block text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">
              Default expiry (days)
            </label>
            <input
              type="number"
              min={1}
              max={365}
              value={defaultExpiry}
              onChange={e => setDefaultExpiry(Math.max(1, parseInt(e.target.value) || 14))}
              className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none"
            />
          </div>
        </div>
      </div>

      {/* Create Listing Form */}
      <div className="bg-bg2 border border-border rounded-lg overflow-hidden mb-4">
        <div className="px-4 py-3.5 border-b border-border flex justify-between items-center">
          <span className="font-display text-[17px] text-text-bright tracking-widest">CREATE LISTING</span>
        </div>
        <div className="p-4 space-y-4">
          {/* Mode Toggle */}
          <div className="flex gap-0 rounded-md overflow-hidden border border-border2 w-fit">
            <button
              type="button"
              onClick={() => { setMode("team_lfp"); resetForm(); }}
              className={`px-5 py-2.5 text-[13px] font-heading font-medium tracking-wider uppercase cursor-pointer border-none transition-colors ${
                mode === "team_lfp" ? "bg-accent text-white" : "bg-transparent text-text-secondary hover:text-text"
              }`}
            >
              Team LFP
            </button>
            <button
              type="button"
              onClick={() => { setMode("player_lft"); resetForm(); }}
              className={`px-5 py-2.5 text-[13px] font-heading font-medium tracking-wider uppercase cursor-pointer border-none transition-colors ${
                mode === "player_lft" ? "bg-accent text-white" : "bg-transparent text-text-secondary hover:text-text"
              }`}
            >
              Player LFT
            </button>
          </div>

          {mode === "team_lfp" ? (
            <>
              {/* Team Select */}
              <div>
                <label className="block text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">
                  Team *
                </label>
                <select
                  value={teamId}
                  onChange={e => setTeamId(e.target.value)}
                  className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none"
                >
                  <option value="">Select a team...</option>
                  {teams.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.abbreviation}) — {t.starterCount}/5 starters
                    </option>
                  ))}
                </select>
              </div>

              {/* Roles Needed */}
              <div>
                <label className="block text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">
                  Roles Needed *
                </label>
                <RolePills
                  roles={ROLES}
                  selected={rolesNeeded}
                  onToggle={role => toggleRole(role, rolesNeeded, setRolesNeeded)}
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Additional details about the team or what you're looking for..."
                  className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none resize-y"
                />
              </div>

              {/* Discord */}
              <div>
                <label className="block text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">
                  Discord Contact *
                </label>
                <input
                  type="text"
                  value={discord}
                  onChange={e => setDiscord(e.target.value)}
                  placeholder="username#1234 or username"
                  className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none"
                />
              </div>
            </>
          ) : (
            <>
              {/* Player Name */}
              <div>
                <label className="block text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">
                  Player Name *
                </label>
                <input
                  type="text"
                  value={playerName}
                  onChange={e => setPlayerName(e.target.value)}
                  placeholder="Display name"
                  className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none"
                />
              </div>

              {/* Riot ID */}
              <div>
                <label className="block text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">
                  Riot ID
                </label>
                <input
                  type="text"
                  value={riotId}
                  onChange={e => setRiotId(e.target.value)}
                  placeholder="Name#Tag"
                  className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none"
                />
              </div>

              {/* OP.GG URL */}
              <div>
                <label className="block text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">
                  OP.GG URL
                </label>
                <input
                  type="text"
                  value={opggUrl}
                  onChange={e => setOpggUrl(e.target.value)}
                  placeholder="https://op.gg/summoners/..."
                  className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none"
                />
              </div>

              {/* Preferred Roles */}
              <div>
                <label className="block text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">
                  Preferred Roles *
                </label>
                <RolePills
                  roles={ROLES}
                  selected={preferredRoles}
                  onToggle={role => toggleRole(role, preferredRoles, setPreferredRoles)}
                />
              </div>

              {/* Rank */}
              <div>
                <label className="block text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">
                  Rank
                </label>
                <select
                  value={rank}
                  onChange={e => setRank(e.target.value)}
                  className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none"
                >
                  <option value="">Select rank...</option>
                  {RANKS.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div>
                <label className="block text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">
                  Description
                </label>
                <textarea
                  value={playerDescription}
                  onChange={e => setPlayerDescription(e.target.value)}
                  rows={3}
                  placeholder="Tell teams about yourself..."
                  className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none resize-y"
                />
              </div>

              {/* Discord */}
              <div>
                <label className="block text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">
                  Discord Contact *
                </label>
                <input
                  type="text"
                  value={playerDiscord}
                  onChange={e => setPlayerDiscord(e.target.value)}
                  placeholder="username#1234 or username"
                  className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none"
                />
              </div>
            </>
          )}

          {/* Submit */}
          <button
            type="button"
            onClick={createListing}
            disabled={saving}
            className="bg-accent text-white border-none rounded-md px-5 py-2.5 text-[13px] font-heading font-medium tracking-wider uppercase cursor-pointer disabled:opacity-50"
          >
            {saving ? "Creating..." : "Create Listing"}
          </button>
        </div>
      </div>

      {/* Listings Table */}
      <div className="bg-bg2 border border-border rounded-lg overflow-hidden mb-4">
        <div className="px-4 py-3.5 border-b border-border">
          <span className="font-display text-[17px] text-text-bright tracking-widest">ALL LISTINGS</span>
          <span className="ml-3 text-[12px] text-text-secondary font-body">({listings.length})</span>
        </div>
        <div className="p-4">
          {listings.length === 0 ? (
            <div className="text-text-secondary text-center py-6 text-[13px]">No listings yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] font-body">
                <thead>
                  <tr className="text-left text-[11px] text-text-secondary font-heading tracking-wider uppercase border-b border-border">
                    <th className="pb-2 pr-3">Type</th>
                    <th className="pb-2 pr-3">Name</th>
                    <th className="pb-2 pr-3">Roles</th>
                    <th className="pb-2 pr-3">Discord</th>
                    <th className="pb-2 pr-3">Status</th>
                    <th className="pb-2 pr-3">Posted</th>
                    <th className="pb-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {listings.map(listing => {
                    const status = getStatus(listing);
                    const isTeam = listing.type === "team_lfp";
                    return (
                      <tr key={listing.id} className="border-b border-border/50 hover:bg-bg-input/30">
                        <td className="py-2.5 pr-3">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-heading font-medium tracking-wider uppercase ${
                            isTeam
                              ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                              : "bg-red-500/20 text-red-400 border border-red-500/30"
                          }`}>
                            {isTeam ? "Team LFP" : "Player LFT"}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-text-bright">
                          {isTeam
                            ? (listing.teams ? `${listing.teams.name} (${listing.teams.abbreviation})` : "Unknown Team")
                            : (listing.player_name || "Unknown")}
                        </td>
                        <td className="py-2.5 pr-3">
                          <div className="flex flex-wrap gap-1">
                            {(listing.roles || []).map((role: string) => (
                              <span key={role} className="px-1.5 py-0.5 rounded text-[10px] font-heading bg-bg-input border border-border2 text-text-secondary">
                                {role}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-2.5 pr-3 text-text-secondary">{listing.discord_contact}</td>
                        <td className="py-2.5 pr-3">
                          <span className={`text-[11px] font-heading font-medium tracking-wider uppercase ${status.color}`}>
                            {status.label}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-text-secondary text-[12px]">
                          {listing.created_at ? new Date(listing.created_at).toLocaleDateString() : "—"}
                        </td>
                        <td className="py-2.5">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => toggleActive(listing)}
                              className={`rounded-md px-3 py-1.5 text-[11px] font-heading cursor-pointer uppercase tracking-wider border ${
                                listing.is_active
                                  ? "bg-transparent text-orange-400 border-border2 hover:border-orange-400"
                                  : "bg-transparent text-green-400 border-border2 hover:border-green-400"
                              }`}
                            >
                              {listing.is_active ? "Deactivate" : "Activate"}
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteListing(listing.id)}
                              className="bg-transparent text-ccs-red border border-border2 rounded-md px-3 py-1.5 text-[11px] font-heading cursor-pointer uppercase"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
