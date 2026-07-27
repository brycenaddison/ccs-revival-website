import { useState, useEffect, useCallback } from "react";
import { db } from "../../lib/supabase";

interface Props {
  toast: (msg: string, type?: "success" | "error") => void;
}

export function ScheduleTab({ toast }: Props) {
  const [matches, setMatches] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [splits, setSplits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ team_blue_id: "", team_red_id: "", split_id: "", scheduled_at: "", match_format: "bo1", season_phase: "Regular" });
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, t, sp] = await Promise.all([
        db("matches", { query: "?select=*,team_blue:teams!matches_team_blue_id_fkey(id,name,abbreviation),team_red:teams!matches_team_red_id_fkey(id,name,abbreviation),splits(name)&order=scheduled_at.desc.nullslast,created_at.desc&limit=50" }),
        db("teams", { query: "?select=id,name,abbreviation&order=name" }),
        db("splits", { query: "?select=*&order=split_number" }),
      ]);
      setMatches(m || []); setTeams(t || []); setSplits(sp || []);
    } catch (e: any) { toast(e.message, "error"); }
    setLoading(false);
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.team_blue_id || !form.team_red_id || !form.split_id) { toast("Both teams and split required", "error"); return; }
    if (form.team_blue_id === form.team_red_id) { toast("Teams must be different", "error"); return; }
    const body: any = {
      team_blue_id: form.team_blue_id,
      team_red_id: form.team_red_id,
      split_id: form.split_id,
      match_format: form.match_format || "bo1",
      season_phase: form.season_phase || "Regular",
      status: "scheduled",
      scheduled_at: form.scheduled_at || null,
    };
    try {
      if (editing) { await db(`matches?id=eq.${editing}`, { method: "PATCH", body }); toast("Updated", "success"); }
      else { await db("matches", { method: "POST", body }); toast("Match scheduled", "success"); }
      resetForm(); load();
    } catch (e: any) { toast(e.message, "error"); }
  };

  const del = async (id: string) => { if (!confirm("Delete this match?")) return; try { await db(`matches?id=eq.${id}`, { method: "DELETE" }); toast("Deleted", "success"); load(); } catch (e: any) { toast(e.message, "error"); } };

  const edit = (m: any) => {
    setEditing(m.id);
    setForm({
      team_blue_id: m.team_blue_id || "",
      team_red_id: m.team_red_id || "",
      split_id: m.split_id || "",
      scheduled_at: m.scheduled_at ? m.scheduled_at.slice(0, 16) : "",
      match_format: m.match_format || "bo1",
      season_phase: m.season_phase || "Regular",
    });
  };

  const resetForm = () => { setEditing(null); setForm({ team_blue_id: "", team_red_id: "", split_id: "", scheduled_at: "", match_format: "bo1", season_phase: "Regular" }); };

  const live = matches.filter(m => m.status === "live");
  const scheduled = matches.filter(m => m.status === "scheduled");
  const completed = matches.filter(m => m.status === "completed");

  return (
    <div>
      {/* Form */}
      <div className="bg-bg2 border border-border rounded-lg overflow-hidden mb-4">
        <div className="px-4 py-3.5 border-b border-border flex justify-between items-center">
          <span className="font-display text-[17px] text-text-bright tracking-widest">{editing ? "EDIT MATCH" : "SCHEDULE NEW MATCH"}</span>
          {editing && <button className="bg-bg-input text-text border border-border2 rounded-md px-5 py-2.5 text-[13px] font-heading tracking-wider uppercase cursor-pointer" onClick={resetForm}>Cancel</button>}
        </div>
        <div className="p-4">
          <div className="flex gap-3 mb-3 items-end">
            <div className="flex-1 flex flex-col">
              <label className="text-[11px] text-ccs-blue font-heading tracking-wider uppercase mb-1">Blue Side</label>
              <select className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none cursor-pointer" value={form.team_blue_id} onChange={e => setForm({ ...form, team_blue_id: e.target.value })}>
                <option value="">Select team...</option>
                {teams.map((t: any) => <option key={t.id} value={t.id}>{t.name} ({t.abbreviation})</option>)}
              </select>
            </div>
            <div className="pb-2.5 px-2 text-[13px] text-text-dim font-heading">VS</div>
            <div className="flex-1 flex flex-col">
              <label className="text-[11px] text-ccs-red font-heading tracking-wider uppercase mb-1">Red Side</label>
              <select className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none cursor-pointer" value={form.team_red_id} onChange={e => setForm({ ...form, team_red_id: e.target.value })}>
                <option value="">Select team...</option>
                {teams.map((t: any) => <option key={t.id} value={t.id}>{t.name} ({t.abbreviation})</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-3 mb-3">
            <div className="flex-1 flex flex-col">
              <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">Split</label>
              <select className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none cursor-pointer" value={form.split_id} onChange={e => setForm({ ...form, split_id: e.target.value })}>
                <option value="">Select split...</option>
                {splits.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="flex-1 flex flex-col">
              <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">Date & Time</label>
              <input type="datetime-local" className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none" value={form.scheduled_at} onChange={e => setForm({ ...form, scheduled_at: e.target.value })} />
            </div>
            <div className="flex flex-col max-w-[120px]">
              <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">Format</label>
              <select className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none cursor-pointer" value={form.match_format} onChange={e => setForm({ ...form, match_format: e.target.value })}>
                <option value="bo1">Bo1</option><option value="bo3">Bo3</option><option value="bo5">Bo5</option>
              </select>
            </div>
            <div className="flex flex-col max-w-[140px]">
              <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">Phase</label>
              <select className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none cursor-pointer" value={form.season_phase} onChange={e => setForm({ ...form, season_phase: e.target.value })}>
                <option value="Regular">Regular</option><option value="Playoffs">Playoffs</option>
              </select>
            </div>
          </div>
          <button className="bg-accent text-white border-none rounded-md px-5 py-2.5 text-[13px] font-heading font-medium tracking-wider uppercase cursor-pointer" onClick={save}>{editing ? "Update Match" : "Schedule Match"}</button>
        </div>
      </div>

      {/* Upcoming */}
      <div className="bg-bg2 border border-border rounded-lg overflow-hidden mb-4">
        <div className="px-4 py-3.5 border-b border-border">
          <span className="font-display text-[17px] text-text-bright tracking-widest">UPCOMING MATCHES ({scheduled.length})</span>
        </div>
        {scheduled.length === 0 ? (
          <div className="py-10 text-center text-text-dim text-[13px]">{loading ? "Loading..." : "No upcoming matches."}</div>
        ) : (
          <table className="w-full border-collapse">
            <thead><tr>
              {["Blue", "", "Red", "Split", "Date", "Format", ""].map((h, i) => (
                <th key={`${h}-${i}`} className="px-3.5 py-2.5 text-left text-[10px] text-text-muted font-heading font-normal tracking-wider border-b border-border uppercase">{h}</th>
              ))}
            </tr></thead>
            <tbody>{scheduled.map((m: any) => (
              <tr key={m.id}>
                <td className="px-3.5 py-2.5 border-b border-border font-heading font-medium text-[13px] text-ccs-blue">{m.team_blue?.name || "TBD"}</td>
                <td className="px-3.5 py-2.5 border-b border-border text-text-dim text-center text-[11px]">vs</td>
                <td className="px-3.5 py-2.5 border-b border-border font-heading font-medium text-[13px] text-ccs-red">{m.team_red?.name || "TBD"}</td>
                <td className="px-3.5 py-2.5 border-b border-border text-[13px]">{m.splits?.name || "—"}</td>
                <td className="px-3.5 py-2.5 border-b border-border font-mono text-[11px] text-text-secondary">{m.scheduled_at ? new Date(m.scheduled_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "TBD"}</td>
                <td className="px-3.5 py-2.5 border-b border-border font-mono text-[11px] text-text-secondary">{(m.match_format || "bo1").toUpperCase()}</td>
                <td className="px-3.5 py-2.5 border-b border-border text-right">
                  <button className="bg-bg-input text-text border border-border2 rounded-md px-3 py-1.5 text-[11px] font-heading tracking-wider uppercase cursor-pointer mr-1.5" onClick={() => edit(m)}>Edit</button>
                  <button
                    className="bg-ccs-red text-white border-none rounded-md px-3 py-1.5 text-[11px] font-heading tracking-wider uppercase cursor-pointer mr-1.5"
                    onClick={async () => {
                      try {
                        await db(`matches?id=eq.${m.id}`, { method: "PATCH", body: { status: "live" } });
                        toast("Match set to LIVE", "success");
                        load();
                      } catch (e: any) { toast(e.message, "error"); }
                    }}
                  >
                    Set Live
                  </button>
                  <button className="bg-transparent text-ccs-red border border-border2 rounded-md px-3 py-1.5 text-[11px] font-heading cursor-pointer uppercase" onClick={() => del(m.id)}>Delete</button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>

      {/* Live */}
      {live.length > 0 && (
        <div className="bg-bg2 border border-ccs-red/40 rounded-lg overflow-hidden mb-4">
          <div className="px-4 py-3.5 border-b border-border flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-ccs-red shadow-[0_0_8px_var(--red)]" style={{ animation: "pulse 1.5s infinite" }} />
            <span className="font-display text-[17px] text-ccs-red tracking-widest">LIVE MATCHES ({live.length})</span>
          </div>
          <table className="w-full border-collapse">
            <thead><tr>
              {["Blue", "", "Red", "Split", "Date", "Format", ""].map((h, i) => (
                <th key={`${h}-${i}`} className="px-3.5 py-2.5 text-left text-[10px] text-text-muted font-heading font-normal tracking-wider border-b border-border uppercase">{h}</th>
              ))}
            </tr></thead>
            <tbody>{live.map((m: any) => (
              <tr key={m.id}>
                <td className="px-3.5 py-2.5 border-b border-border font-heading font-medium text-[13px] text-ccs-blue">{m.team_blue?.name || "TBD"}</td>
                <td className="px-3.5 py-2.5 border-b border-border text-text-dim text-center text-[11px]">vs</td>
                <td className="px-3.5 py-2.5 border-b border-border font-heading font-medium text-[13px] text-ccs-red">{m.team_red?.name || "TBD"}</td>
                <td className="px-3.5 py-2.5 border-b border-border text-[13px]">{m.splits?.name || "—"}</td>
                <td className="px-3.5 py-2.5 border-b border-border font-mono text-[11px] text-text-secondary">{m.scheduled_at ? new Date(m.scheduled_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "TBD"}</td>
                <td className="px-3.5 py-2.5 border-b border-border font-mono text-[11px] text-text-secondary">{(m.match_format || "bo1").toUpperCase()}</td>
                <td className="px-3.5 py-2.5 border-b border-border text-right">
                  <button className="bg-bg-input text-text border border-border2 rounded-md px-3 py-1.5 text-[11px] font-heading tracking-wider uppercase cursor-pointer mr-1.5" onClick={() => edit(m)}>Edit</button>
                  <button
                    className="bg-bg-input text-text-secondary border border-border2 rounded-md px-3 py-1.5 text-[11px] font-heading tracking-wider uppercase cursor-pointer mr-1.5"
                    onClick={async () => {
                      try {
                        await db(`matches?id=eq.${m.id}`, { method: "PATCH", body: { status: "scheduled" } });
                        toast("Match reverted to Scheduled", "success");
                        load();
                      } catch (e: any) { toast(e.message, "error"); }
                    }}
                  >
                    Set Scheduled
                  </button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {/* Completed */}
      <div className="bg-bg2 border border-border rounded-lg overflow-hidden mb-4">
        <div className="px-4 py-3.5 border-b border-border">
          <span className="font-display text-[17px] text-text-bright tracking-widest">COMPLETED MATCHES ({completed.length})</span>
        </div>
        {completed.length === 0 ? (
          <div className="py-10 text-center text-text-dim text-[13px]">No completed matches yet.</div>
        ) : (
          <table className="w-full border-collapse">
            <thead><tr>
              {["Blue", "Score", "Red", "Winner", "Split", "Date"].map(h => (
                <th key={h} className="px-3.5 py-2.5 text-left text-[10px] text-text-muted font-heading font-normal tracking-wider border-b border-border uppercase">{h}</th>
              ))}
            </tr></thead>
            <tbody>{completed.map((m: any) => {
              const bWin = m.winner_team_id === m.team_blue?.id;
              const rWin = m.winner_team_id === m.team_red?.id;
              return (
                <tr key={m.id}>
                  <td className={`px-3.5 py-2.5 border-b border-border font-heading font-medium text-[13px] ${bWin ? "text-ccs-green" : "text-text-muted"}`}>{m.team_blue?.name || "?"}</td>
                  <td className="px-3.5 py-2.5 border-b border-border font-mono text-[13px] text-center">{m.score_blue ?? 0} - {m.score_red ?? 0}</td>
                  <td className={`px-3.5 py-2.5 border-b border-border font-heading font-medium text-[13px] ${rWin ? "text-ccs-green" : "text-text-muted"}`}>{m.team_red?.name || "?"}</td>
                  <td className="px-3.5 py-2.5 border-b border-border"><span className="bg-ccs-green/20 text-ccs-green px-2 py-0.5 rounded text-[10px] font-heading tracking-wider uppercase">{bWin ? m.team_blue?.abbreviation : rWin ? m.team_red?.abbreviation : "—"}</span></td>
                  <td className="px-3.5 py-2.5 border-b border-border text-[13px]">{m.splits?.name || "—"}</td>
                  <td className="px-3.5 py-2.5 border-b border-border font-mono text-[11px] text-text-secondary">{m.completed_at ? new Date(m.completed_at).toLocaleDateString([], { month: "short", day: "numeric" }) : "—"}</td>
                </tr>
              );
            })}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
