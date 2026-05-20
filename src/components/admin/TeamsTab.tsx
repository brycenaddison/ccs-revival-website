import { useState, useEffect, useCallback, useRef } from "react";
import { db, uploadFile } from "../../lib/supabase";

interface Props {
  seasons: any[];
  divisions: any[];
  toast: (msg: string, type?: "success" | "error") => void;
}

export function TeamsTab({ seasons, divisions, toast }: Props) {
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", abbreviation: "", color_primary: "#d7a52a", color_accent: "#d20708", logo_url: "", division_id: "", season_id: "" });
  const [editing, setEditing] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const logoFileRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast("Please select an image file", "error"); return; }
    const allowedExts = ["jpg", "jpeg", "png", "gif", "webp", "svg"];
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (!allowedExts.includes(ext)) { toast("Allowed: JPG, PNG, GIF, WEBP, SVG", "error"); return; }
    if (file.size > 2 * 1024 * 1024) { toast("Image must be under 2MB", "error"); return; }
    setUploading(true);
    try {
      const path = `${Date.now()}_${(form.abbreviation || "team").toLowerCase()}.${ext}`;
      const publicUrl = await uploadFile("team-logos", path, file);
      setForm(f => ({ ...f, logo_url: publicUrl }));
      toast("Logo uploaded", "success");
    } catch (err: any) { toast(err.message, "error"); }
    setUploading(false);
    e.target.value = "";
  };

  const load = useCallback(async () => {
    setLoading(true);
    try { setTeams(await db("teams", { query: "?select=*,divisions(name)&order=name" }) || []); }
    catch (e: any) { toast(e.message, "error"); }
    setLoading(false);
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.name || !form.abbreviation) { toast("Name and abbreviation required", "error"); return; }
    const body: any = { ...form };
    if (!body.division_id) body.division_id = null;
    if (!body.season_id) body.season_id = null;
    if (!body.logo_url) body.logo_url = null;
    try {
      if (editing) { await db(`teams?id=eq.${editing}`, { method: "PATCH", body }); toast("Team updated", "success"); }
      else { await db("teams", { method: "POST", body }); toast("Team created", "success"); }
      setForm({ name: "", abbreviation: "", color_primary: "#d7a52a", color_accent: "#d20708", logo_url: "", division_id: "", season_id: "" });
      setEditing(null); load();
    } catch (e: any) { toast(e.message, "error"); }
  };

  const del = async (id: string) => {
    if (!confirm("Delete this team?")) return;
    try { await db(`teams?id=eq.${id}`, { method: "DELETE" }); toast("Deleted", "success"); load(); }
    catch (e: any) { toast(e.message, "error"); }
  };

  const edit = (t: any) => {
    setEditing(t.id);
    setForm({ name: t.name, abbreviation: t.abbreviation, color_primary: t.color_primary || "#d7a52a", color_accent: t.color_accent || "#d20708", logo_url: t.logo_url || "", division_id: t.division_id || "", season_id: t.season_id || "" });
  };

  const resetForm = () => {
    setEditing(null);
    setForm({ name: "", abbreviation: "", color_primary: "#d7a52a", color_accent: "#d20708", logo_url: "", division_id: "", season_id: "" });
  };

  return (
    <div>
      {/* Add/Edit Form */}
      <div className="bg-bg2 border border-border rounded-lg overflow-hidden mb-4">
        <div className="px-4 py-3.5 border-b border-border flex justify-between items-center">
          <span className="font-display text-[17px] text-text-bright tracking-widest">{editing ? "EDIT TEAM" : "ADD NEW TEAM"}</span>
          {editing && <button className="bg-bg-input text-text border border-border2 rounded-md px-5 py-2.5 text-[13px] font-heading tracking-wider uppercase cursor-pointer hover:text-white" onClick={resetForm}>Cancel</button>}
        </div>
        <div className="p-4">
          <div className="flex gap-3 mb-3">
            <div className="flex-[2] flex flex-col">
              <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">Team Name</label>
              <input className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none focus:border-accent" placeholder="Shadow Wolves" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="flex-1 flex flex-col">
              <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">Abbreviation</label>
              <input className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none focus:border-accent" placeholder="SHW" maxLength={5} value={form.abbreviation} onChange={e => setForm({ ...form, abbreviation: e.target.value.toUpperCase() })} />
            </div>
          </div>
          <div className="flex gap-3 mb-3">
            <div className="flex-1 flex flex-col">
              <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">Primary Color</label>
              <div className="flex gap-2 items-center">
                <input type="color" value={form.color_primary} onChange={e => setForm({ ...form, color_primary: e.target.value })} className="w-10 h-9 border-none bg-transparent cursor-pointer" />
                <input className="w-full bg-bg-input border border-border2 rounded-md text-text-secondary py-2.5 px-3.5 text-[11px] font-mono outline-none focus:border-accent" value={form.color_primary} onChange={e => setForm({ ...form, color_primary: e.target.value })} />
              </div>
            </div>
            <div className="flex-1 flex flex-col">
              <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">Accent Color</label>
              <div className="flex gap-2 items-center">
                <input type="color" value={form.color_accent} onChange={e => setForm({ ...form, color_accent: e.target.value })} className="w-10 h-9 border-none bg-transparent cursor-pointer" />
                <input className="w-full bg-bg-input border border-border2 rounded-md text-text-secondary py-2.5 px-3.5 text-[11px] font-mono outline-none focus:border-accent" value={form.color_accent} onChange={e => setForm({ ...form, color_accent: e.target.value })} />
              </div>
            </div>
          </div>
          <div className="flex gap-3 mb-3">
            <div className="flex-1 flex flex-col">
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
                <input className="flex-1 bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none focus:border-accent" placeholder="Paste image URL..." value={form.logo_url} onChange={e => setForm({ ...form, logo_url: e.target.value })} />
                {form.logo_url && <button className="bg-transparent text-ccs-red border border-border2 rounded-md px-2.5 py-1.5 text-[10px] font-heading cursor-pointer uppercase hover:bg-ccs-red/10" onClick={() => setForm({ ...form, logo_url: "" })}>Clear</button>}
              </div>
            </div>
          </div>
          <div className="flex gap-3 mb-3">
            <div className="flex-1 flex flex-col">
              <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">Division</label>
              <select className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none cursor-pointer focus:border-accent" value={form.division_id} onChange={e => setForm({ ...form, division_id: e.target.value })}>
                <option value="">No division</option>
                {divisions.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="flex-1 flex flex-col">
              <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">Season</label>
              <select className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none cursor-pointer focus:border-accent" value={form.season_id} onChange={e => setForm({ ...form, season_id: e.target.value })}>
                <option value="">No season</option>
                {seasons.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-3 items-center mt-1">
            {form.logo_url ? (
              <img src={form.logo_url} alt="Logo" className="w-12 h-12 rounded-lg object-contain bg-bg-input border border-border2" onError={(e: any) => { e.target.style.display = "none"; }} />
            ) : (
              <div className="w-12 h-12 rounded-lg flex items-center justify-center text-[11px] font-heading text-white font-semibold tracking-wider" style={{ background: `linear-gradient(135deg, ${form.color_primary}, ${form.color_accent})` }}>
                {form.abbreviation || "?"}
              </div>
            )}
            <button className="bg-accent text-white border-none rounded-md px-5 py-2.5 text-[13px] font-heading font-medium tracking-wider uppercase cursor-pointer hover:opacity-90" onClick={save}>
              {editing ? "Update Team" : "Add Team"}
            </button>
          </div>
        </div>
      </div>

      {/* Teams List */}
      <div className="bg-bg2 border border-border rounded-lg overflow-hidden mb-4">
        <div className="px-4 py-3.5 border-b border-border">
          <span className="font-display text-[17px] text-text-bright tracking-widest">ALL TEAMS ({teams.length})</span>
        </div>
        {teams.length === 0 ? (
          <div className="py-10 text-center text-text-dim text-[13px]">{loading ? "Loading..." : "No teams yet."}</div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {["", "Name", "Abbr", "Division", "Colors", ""].map((h, i) => (
                  <th key={`${h}-${i}`} className="px-3.5 py-2.5 text-left text-[10px] text-text-muted font-heading font-normal tracking-wider border-b border-border uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {teams.map((t: any) => (
                <tr key={t.id} className="hover:bg-bg3/30 transition-colors">
                  <td className="px-3.5 py-2.5 border-b border-border align-middle">
                    {t.logo_url ? (
                      <img src={t.logo_url} alt={t.abbreviation} className="w-8 h-8 rounded-md object-contain bg-bg-input" onError={(e: any) => { e.target.style.display = "none"; if (e.target.nextSibling) e.target.nextSibling.style.display = "flex"; }} />
                    ) : null}
                    <div
                      className="w-8 h-8 rounded-md flex items-center justify-center text-[9px] text-white font-semibold font-heading"
                      style={{ background: `linear-gradient(135deg, ${t.color_primary || "#333"}, ${t.color_accent || "#555"})`, display: t.logo_url ? "none" : "flex" }}
                    >
                      {(t.abbreviation || "?").charAt(0)}
                    </div>
                  </td>
                  <td className="px-3.5 py-2.5 border-b border-border font-heading font-medium text-[13px]">{t.name}</td>
                  <td className="px-3.5 py-2.5 border-b border-border font-mono text-[11px] text-text-secondary">{t.abbreviation}</td>
                  <td className="px-3.5 py-2.5 border-b border-border text-[13px]">{t.divisions?.name || <span className="text-text-subtle">—</span>}</td>
                  <td className="px-3.5 py-2.5 border-b border-border">
                    <div className="flex gap-1">
                      <div className="w-4 h-4 rounded-sm" style={{ background: t.color_primary || "#333" }} />
                      <div className="w-4 h-4 rounded-sm" style={{ background: t.color_accent || "#555" }} />
                    </div>
                  </td>
                  <td className="px-3.5 py-2.5 border-b border-border text-right">
                    <button className="bg-bg-input text-text border border-border2 rounded-md px-3 py-1.5 text-[11px] font-heading tracking-wider uppercase cursor-pointer mr-1.5 hover:text-white" onClick={() => edit(t)}>Edit</button>
                    <button className="bg-transparent text-ccs-red border border-border2 rounded-md px-3 py-1.5 text-[11px] font-heading cursor-pointer uppercase hover:bg-ccs-red/10" onClick={() => del(t.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
