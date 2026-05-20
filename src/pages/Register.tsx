import { useState, useRef } from "react";
import { db, uploadFile } from "../lib/supabase";
import { Link } from "react-router-dom";

interface Player {
  display_name: string;
  riot_id: string;
  opgg_link: string;
  alt_accounts: string;
  role: string;
  is_captain: boolean;
}

const ROLES = ["Top", "Jungle", "Mid", "ADC", "Support", "Fill"];

function emptyPlayer(): Player {
  return { display_name: "", riot_id: "", opgg_link: "", alt_accounts: "", role: "Fill", is_captain: false };
}

export default function Register() {
  const [teamName, setTeamName] = useState("");
  const [abbreviation, setAbbreviation] = useState("");
  const [colorPrimary, setColorPrimary] = useState("#d7a52a");
  const [colorAccent, setColorAccent] = useState("#d20708");
  const [logoUrl, setLogoUrl] = useState("");
  const [discordTag, setDiscordTag] = useState("");
  const [players, setPlayers] = useState<Player[]>(() => Array.from({ length: 5 }, () => emptyPlayer()));
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const logoFileRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Please select an image file"); return; }
    const allowedExts = ["jpg", "jpeg", "png", "gif", "webp", "svg"];
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (!allowedExts.includes(ext)) { setError("Allowed: JPG, PNG, GIF, WEBP, SVG"); return; }
    if (file.size > 2 * 1024 * 1024) { setError("Image must be under 2MB"); return; }
    setUploading(true);
    try {
      const path = `${Date.now()}_${(abbreviation || "team").toLowerCase()}.${ext}`;
      const publicUrl = await uploadFile("team-logos", path, file);
      setLogoUrl(publicUrl);
      setError("");
    } catch (err: any) { setError(err.message); }
    setUploading(false);
    e.target.value = "";
  };

  const updatePlayer = (index: number, field: keyof Player, value: string | boolean) => {
    setPlayers(prev => {
      const next = [...prev];
      if (field === "is_captain" && value === true) {
        next.forEach(p => (p.is_captain = false));
      }
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const addPlayer = () => setPlayers(prev => [...prev, emptyPlayer()]);

  const removePlayer = (index: number) => {
    if (players.length <= 5) return;
    setPlayers(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    setError("");
    if (!teamName.trim()) { setError("Team name is required"); return; }
    if (!abbreviation.trim()) { setError("Abbreviation is required"); return; }
    if (!discordTag.trim()) { setError("Captain Discord tag is required"); return; }
    const filledPlayers = players.filter(p => p.display_name.trim());
    if (filledPlayers.length < 5) { setError("At least 5 players with display names are required"); return; }

    setSubmitting(true);
    try {
      const playersData = filledPlayers.map(p => {
        const parts = p.riot_id.split("#");
        return {
          display_name: p.display_name.trim(),
          riot_game_name: parts[0]?.trim() || "",
          riot_tag_line: parts[1]?.trim() || "",
          opgg_link: p.opgg_link.trim(),
          alt_accounts: p.alt_accounts.trim(),
          role: p.role,
          is_captain: p.is_captain,
        };
      });

      await db("team_applications", {
        method: "POST",
        body: {
          team_name: teamName.trim(),
          abbreviation: abbreviation.trim().toUpperCase(),
          color_primary: colorPrimary,
          color_accent: colorAccent,
          logo_url: logoUrl || null,
          captain_discord: discordTag.trim(),
          players: playersData,
          status: "pending",
        } as any,
      });

      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    }
    setSubmitting(false);
  };

  if (submitted) {
    return (
      <div className="bg-bg min-h-screen flex items-center justify-center p-4">
        <div className="bg-bg2 border border-border rounded-lg p-10 text-center max-w-md w-full">
          <div className="text-4xl mb-4">&#10003;</div>
          <h2 className="font-display text-[24px] text-text-bright tracking-widest mb-3">APPLICATION SUBMITTED!</h2>
          <p className="text-[14px] text-text-secondary font-body leading-relaxed mb-6">
            We'll review it shortly. You'll be contacted via Discord once a decision is made.
          </p>
          <Link to="/" className="inline-block bg-accent text-white rounded-md py-3 px-7 text-[13px] font-heading font-medium tracking-wider no-underline uppercase hover:opacity-90">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  const filledCount = players.filter(p => p.display_name.trim()).length;

  return (
    <div className="bg-bg min-h-screen text-text font-body">
      {/* Header */}
      <div className="bg-bg2 border-b border-border">
        <div className="max-w-3xl mx-auto px-4 py-5 flex items-center justify-between">
          <div>
            <Link to="/" className="text-accent text-[11px] font-heading tracking-wider uppercase no-underline hover:text-text-bright">
              &larr; Back to CCS
            </Link>
            <h1 className="font-display text-[26px] text-text-bright tracking-widest mt-1">TEAM REGISTRATION</h1>
          </div>
          <div className="w-12 h-12 rounded-lg flex items-center justify-center text-[11px] font-heading text-white font-semibold tracking-wider" style={{ background: `linear-gradient(135deg, ${colorPrimary}, ${colorAccent})` }}>
            {abbreviation || "CCS"}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Error Toast */}
        {error && (
          <div className="bg-ccs-red/20 text-ccs-red border border-ccs-red/30 rounded-md px-4 py-3 mb-4 text-[13px] font-body flex justify-between items-center">
            <span>{error}</span>
            <button className="bg-transparent border-none text-ccs-red cursor-pointer text-lg leading-none" onClick={() => setError("")}>&times;</button>
          </div>
        )}

        {/* Team Info */}
        <div className="bg-bg2 border border-border rounded-lg overflow-hidden mb-4">
          <div className="px-4 py-3.5 border-b border-border">
            <span className="font-display text-[17px] text-text-bright tracking-widest">TEAM INFO</span>
          </div>
          <div className="p-4">
            <div className="flex gap-3 mb-3">
              <div className="flex-[2] flex flex-col">
                <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">Team Name *</label>
                <input className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none focus:border-accent" placeholder="Shadow Wolves" value={teamName} onChange={e => setTeamName(e.target.value)} />
              </div>
              <div className="flex-1 flex flex-col">
                <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">Abbreviation *</label>
                <input className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none focus:border-accent" placeholder="SHW" maxLength={5} value={abbreviation} onChange={e => setAbbreviation(e.target.value.toUpperCase())} />
              </div>
            </div>
            <div className="flex gap-3 mb-3">
              <div className="flex-1 flex flex-col">
                <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">Primary Color</label>
                <div className="flex gap-2 items-center">
                  <input type="color" value={colorPrimary} onChange={e => setColorPrimary(e.target.value)} className="w-10 h-9 border-none bg-transparent cursor-pointer" />
                  <input className="w-full bg-bg-input border border-border2 rounded-md text-text-secondary py-2.5 px-3.5 text-[11px] font-mono outline-none focus:border-accent" value={colorPrimary} onChange={e => setColorPrimary(e.target.value)} />
                </div>
              </div>
              <div className="flex-1 flex flex-col">
                <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">Accent Color</label>
                <div className="flex gap-2 items-center">
                  <input type="color" value={colorAccent} onChange={e => setColorAccent(e.target.value)} className="w-10 h-9 border-none bg-transparent cursor-pointer" />
                  <input className="w-full bg-bg-input border border-border2 rounded-md text-text-secondary py-2.5 px-3.5 text-[11px] font-mono outline-none focus:border-accent" value={colorAccent} onChange={e => setColorAccent(e.target.value)} />
                </div>
              </div>
            </div>
            <div className="flex flex-col">
              <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">Team Logo</label>
              <div className="flex gap-2 items-center">
                <input ref={logoFileRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                <button
                  className={`bg-bg-input text-text border border-border2 rounded-md px-5 py-2.5 text-[13px] font-heading tracking-wider uppercase cursor-pointer ${uploading ? "opacity-60" : "hover:text-white"}`}
                  onClick={() => logoFileRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? "Uploading..." : "Upload Image"}
                </button>
                <span className="text-[11px] text-text-dim">or</span>
                <input className="flex-1 bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none focus:border-accent" placeholder="Paste image URL..." value={logoUrl} onChange={e => setLogoUrl(e.target.value)} />
                {logoUrl && <button className="bg-transparent text-ccs-red border border-border2 rounded-md px-2.5 py-1.5 text-[10px] font-heading cursor-pointer uppercase hover:bg-ccs-red/10" onClick={() => setLogoUrl("")}>Clear</button>}
              </div>
            </div>
          </div>
        </div>

        {/* Captain Contact */}
        <div className="bg-bg2 border border-border rounded-lg overflow-hidden mb-4">
          <div className="px-4 py-3.5 border-b border-border">
            <span className="font-display text-[17px] text-text-bright tracking-widest">CAPTAIN CONTACT</span>
          </div>
          <div className="p-4">
            <div className="flex flex-col">
              <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">Discord Tag *</label>
              <input className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none focus:border-accent max-w-sm" placeholder='username#1234 or username' value={discordTag} onChange={e => setDiscordTag(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Players */}
        <div className="bg-bg2 border border-border rounded-lg overflow-hidden mb-4">
          <div className="px-4 py-3.5 border-b border-border flex justify-between items-center">
            <span className="font-display text-[17px] text-text-bright tracking-widest">PLAYERS</span>
            <span className="text-[12px] font-heading tracking-wider text-text-secondary">
              <span className={filledCount >= 5 ? "text-ccs-green" : "text-ccs-orange"}>{filledCount}</span>/5 minimum
            </span>
          </div>
          <div className="p-4">
            {players.map((player, i) => (
              <div key={i} className="bg-bg border border-border rounded-lg p-3 mb-3 last:mb-0">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-heading tracking-wider text-text-muted uppercase">
                    Player {i + 1}
                    {player.is_captain && <span className="ml-2 text-ccs-orange">(Captain)</span>}
                  </span>
                  {players.length > 5 && (
                    <button className="bg-transparent text-ccs-red border border-border2 rounded-md px-2.5 py-1 text-[10px] font-heading cursor-pointer uppercase hover:bg-ccs-red/10" onClick={() => removePlayer(i)}>Remove</button>
                  )}
                </div>
                <div className="flex gap-3 mb-2">
                  <div className="flex-1 flex flex-col">
                    <label className="text-[10px] text-text-dim font-heading tracking-wider uppercase mb-0.5">Display Name *</label>
                    <input className="w-full bg-bg-input border border-border2 rounded-md text-text py-2 px-3 text-[13px] font-body outline-none focus:border-accent" placeholder="PlayerName" value={player.display_name} onChange={e => updatePlayer(i, "display_name", e.target.value)} />
                  </div>
                  <div className="flex-1 flex flex-col">
                    <label className="text-[10px] text-text-dim font-heading tracking-wider uppercase mb-0.5">Riot ID (Name#Tag)</label>
                    <input className="w-full bg-bg-input border border-border2 rounded-md text-text py-2 px-3 text-[13px] font-body outline-none focus:border-accent" placeholder="Player#NA1" value={player.riot_id} onChange={e => updatePlayer(i, "riot_id", e.target.value)} />
                  </div>
                </div>
                <div className="flex gap-3 mb-2">
                  <div className="flex-1 flex flex-col">
                    <label className="text-[10px] text-text-dim font-heading tracking-wider uppercase mb-0.5">OP.GG Link</label>
                    <input className="w-full bg-bg-input border border-border2 rounded-md text-text py-2 px-3 text-[13px] font-body outline-none focus:border-accent" placeholder="https://op.gg/..." value={player.opgg_link} onChange={e => updatePlayer(i, "opgg_link", e.target.value)} />
                  </div>
                  <div className="w-32 flex flex-col">
                    <label className="text-[10px] text-text-dim font-heading tracking-wider uppercase mb-0.5">Role</label>
                    <select className="w-full bg-bg-input border border-border2 rounded-md text-text py-2 px-3 text-[13px] font-body outline-none cursor-pointer focus:border-accent" value={player.role} onChange={e => updatePlayer(i, "role", e.target.value)}>
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div className="w-20 flex flex-col items-center justify-end">
                    <label className="text-[10px] text-text-dim font-heading tracking-wider uppercase mb-0.5">Captain</label>
                    <input type="checkbox" checked={player.is_captain} onChange={e => updatePlayer(i, "is_captain", e.target.checked)} className="w-4 h-4 accent-accent cursor-pointer mt-1" />
                  </div>
                </div>
                <div className="flex flex-col">
                  <label className="text-[10px] text-text-dim font-heading tracking-wider uppercase mb-0.5">Alt Accounts</label>
                  <textarea className="w-full bg-bg-input border border-border2 rounded-md text-text py-2 px-3 text-[12px] font-body outline-none resize-y min-h-[36px] max-h-[80px] focus:border-accent" placeholder="List any alt/smurf accounts..." value={player.alt_accounts} onChange={e => updatePlayer(i, "alt_accounts", e.target.value)} />
                </div>
              </div>
            ))}
            <button className="mt-3 bg-bg-input text-text border border-border2 rounded-md px-5 py-2.5 text-[13px] font-heading tracking-wider uppercase cursor-pointer hover:text-white" onClick={addPlayer}>
              + Add Player
            </button>
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end mb-10">
          <button
            className={`bg-accent text-white border-none rounded-md px-8 py-3 text-[14px] font-heading font-medium tracking-wider uppercase cursor-pointer ${submitting ? "opacity-60" : "hover:opacity-90"}`}
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? "Submitting..." : "Submit Application"}
          </button>
        </div>
      </div>
    </div>
  );
}
