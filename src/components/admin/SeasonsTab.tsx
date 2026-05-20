import { useState, useEffect, useCallback } from "react";
import { db } from "../../lib/supabase";

interface Props {
  toast: (msg: string, type?: "success" | "error") => void;
  onRefresh: () => void;
}

export function SeasonsTab({ toast, onRefresh }: Props) {
  const [seasons, setSeasons] = useState<any[]>([]);
  const [splits, setSplits] = useState<any[]>([]);
  const [seasonForm, setSeasonForm] = useState({ name: "", start_date: "", end_date: "", is_active: true });
  const [splitForm, setSplitForm] = useState({ name: "", season_id: "", start_date: "", end_date: "", sort_order: 0 });

  const loadSeasons = useCallback(async () => {
    try { setSeasons(await db("seasons", { query: "?select=*&order=start_date.desc" }) || []); }
    catch (e: any) { toast(e.message, "error"); }
  }, [toast]);

  const loadSplits = useCallback(async () => {
    try { setSplits(await db("splits", { query: "?select=*,seasons(name)&order=start_date" }) || []); }
    catch (e: any) { toast(e.message, "error"); }
  }, [toast]);

  useEffect(() => { loadSeasons(); loadSplits(); }, [loadSeasons, loadSplits]);

  const saveSeason = async () => {
    if (!seasonForm.name) { toast("Season name is required", "error"); return; }
    const body: any = { ...seasonForm };
    if (!body.start_date) body.start_date = null;
    if (!body.end_date) body.end_date = null;
    try {
      await db("seasons", { method: "POST", body });
      toast("Season created", "success");
      setSeasonForm({ name: "", start_date: "", end_date: "", is_active: true });
      loadSeasons();
      onRefresh();
    } catch (e: any) { toast(e.message, "error"); }
  };

  const saveSplit = async () => {
    if (!splitForm.name || !splitForm.season_id) { toast("Split name and season are required", "error"); return; }
    const body: any = { ...splitForm };
    if (!body.start_date) body.start_date = null;
    if (!body.end_date) body.end_date = null;
    try {
      await db("splits", { method: "POST", body });
      toast("Split created", "success");
      setSplitForm({ name: "", season_id: "", start_date: "", end_date: "", sort_order: 0 });
      loadSplits();
    } catch (e: any) { toast(e.message, "error"); }
  };

  const delSeason = async (id: string) => {
    if (!confirm("Delete this season? This may affect related data.")) return;
    try { await db(`seasons?id=eq.${id}`, { method: "DELETE" }); toast("Deleted", "success"); loadSeasons(); onRefresh(); }
    catch (e: any) { toast(e.message, "error"); }
  };

  const delSplit = async (id: string) => {
    if (!confirm("Delete this split?")) return;
    try { await db(`splits?id=eq.${id}`, { method: "DELETE" }); toast("Deleted", "success"); loadSplits(); }
    catch (e: any) { toast(e.message, "error"); }
  };

  const toggleActive = async (s: any) => {
    try {
      await db(`seasons?id=eq.${s.id}`, { method: "PATCH", body: { is_active: !s.is_active } });
      toast(`Season ${!s.is_active ? "activated" : "deactivated"}`, "success");
      loadSeasons();
      onRefresh();
    } catch (e: any) { toast(e.message, "error"); }
  };

  const formatDate = (d: string) => d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

  return (
    <div>
      {/* Forms Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Add Season */}
        <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3.5 border-b border-border">
            <span className="font-display text-[17px] text-text-bright tracking-widest">ADD SEASON</span>
          </div>
          <div className="p-4">
            <div className="flex flex-col mb-3">
              <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">Season Name</label>
              <input className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none focus:border-accent" placeholder="Season 1" value={seasonForm.name} onChange={e => setSeasonForm({ ...seasonForm, name: e.target.value })} />
            </div>
            <div className="flex gap-3 mb-3">
              <div className="flex-1 flex flex-col">
                <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">Start Date</label>
                <input type="date" className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none focus:border-accent" value={seasonForm.start_date} onChange={e => setSeasonForm({ ...seasonForm, start_date: e.target.value })} />
              </div>
              <div className="flex-1 flex flex-col">
                <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">End Date</label>
                <input type="date" className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none focus:border-accent" value={seasonForm.end_date} onChange={e => setSeasonForm({ ...seasonForm, end_date: e.target.value })} />
              </div>
            </div>
            <div className="flex items-center gap-3 mb-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={seasonForm.is_active} onChange={e => setSeasonForm({ ...seasonForm, is_active: e.target.checked })} className="accent-accent w-4 h-4" />
                <span className="text-[12px] text-text-secondary font-heading tracking-wider uppercase">Active</span>
              </label>
            </div>
            <button className="bg-accent text-white border-none rounded-md px-5 py-2.5 text-[13px] font-heading font-medium tracking-wider uppercase cursor-pointer hover:opacity-90" onClick={saveSeason}>Add Season</button>
          </div>
        </div>

        {/* Add Split */}
        <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3.5 border-b border-border">
            <span className="font-display text-[17px] text-text-bright tracking-widest">ADD SPLIT</span>
          </div>
          <div className="p-4">
            <div className="flex gap-3 mb-3">
              <div className="flex-1 flex flex-col">
                <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">Split Name</label>
                <input className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none focus:border-accent" placeholder="Split 1" value={splitForm.name} onChange={e => setSplitForm({ ...splitForm, name: e.target.value })} />
              </div>
              <div className="flex-1 flex flex-col">
                <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">Season</label>
                <select className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none cursor-pointer focus:border-accent" value={splitForm.season_id} onChange={e => setSplitForm({ ...splitForm, season_id: e.target.value })}>
                  <option value="">Select...</option>
                  {seasons.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mb-3">
              <div className="flex-1 flex flex-col">
                <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">Start Date</label>
                <input type="date" className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none focus:border-accent" value={splitForm.start_date} onChange={e => setSplitForm({ ...splitForm, start_date: e.target.value })} />
              </div>
              <div className="flex-1 flex flex-col">
                <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">End Date</label>
                <input type="date" className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none focus:border-accent" value={splitForm.end_date} onChange={e => setSplitForm({ ...splitForm, end_date: e.target.value })} />
              </div>
              <div className="flex flex-col max-w-[100px]">
                <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">Order</label>
                <input type="number" className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none focus:border-accent" value={splitForm.sort_order} onChange={e => setSplitForm({ ...splitForm, sort_order: parseInt(e.target.value) || 0 })} />
              </div>
            </div>
            <button className="bg-accent text-white border-none rounded-md px-5 py-2.5 text-[13px] font-heading font-medium tracking-wider uppercase cursor-pointer hover:opacity-90" onClick={saveSplit}>Add Split</button>
          </div>
        </div>
      </div>

      {/* Seasons List */}
      <div className="bg-bg2 border border-border rounded-lg overflow-hidden mb-4">
        <div className="px-4 py-3.5 border-b border-border">
          <span className="font-display text-[17px] text-text-bright tracking-widest">SEASONS ({seasons.length})</span>
        </div>
        {seasons.length === 0 ? (
          <div className="py-10 text-center text-text-dim text-[13px]">No seasons yet.</div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {["Name", "Start", "End", "Status", ""].map(h => (
                  <th key={h} className="px-3.5 py-2.5 text-left text-[10px] text-text-muted font-heading font-normal tracking-wider border-b border-border uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {seasons.map((s: any) => (
                <tr key={s.id} className="hover:bg-bg3/30 transition-colors">
                  <td className="px-3.5 py-2.5 border-b border-border font-heading font-medium text-[13px]">{s.name}</td>
                  <td className="px-3.5 py-2.5 border-b border-border text-[12px] text-text-secondary">{formatDate(s.start_date)}</td>
                  <td className="px-3.5 py-2.5 border-b border-border text-[12px] text-text-secondary">{formatDate(s.end_date)}</td>
                  <td className="px-3.5 py-2.5 border-b border-border">
                    <button
                      className={`px-2.5 py-0.5 rounded text-[10px] font-heading tracking-wider uppercase cursor-pointer border-none ${
                        s.is_active
                          ? "bg-ccs-green/20 text-ccs-green"
                          : "bg-bg3/50 text-text-dim"
                      }`}
                      onClick={() => toggleActive(s)}
                    >
                      {s.is_active ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="px-3.5 py-2.5 border-b border-border text-right">
                    <button className="bg-transparent text-ccs-red border border-border2 rounded-md px-3 py-1.5 text-[11px] font-heading cursor-pointer uppercase hover:bg-ccs-red/10" onClick={() => delSeason(s.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Splits List */}
      <div className="bg-bg2 border border-border rounded-lg overflow-hidden mb-4">
        <div className="px-4 py-3.5 border-b border-border">
          <span className="font-display text-[17px] text-text-bright tracking-widest">SPLITS ({splits.length})</span>
        </div>
        {splits.length === 0 ? (
          <div className="py-10 text-center text-text-dim text-[13px]">No splits yet.</div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {["Name", "Season", "Start", "End", "Order", ""].map(h => (
                  <th key={h} className="px-3.5 py-2.5 text-left text-[10px] text-text-muted font-heading font-normal tracking-wider border-b border-border uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {splits.map((sp: any) => (
                <tr key={sp.id} className="hover:bg-bg3/30 transition-colors">
                  <td className="px-3.5 py-2.5 border-b border-border font-heading font-medium text-[13px]">{sp.name}</td>
                  <td className="px-3.5 py-2.5 border-b border-border text-[13px] text-text-secondary">{sp.seasons?.name || <span className="text-text-subtle">—</span>}</td>
                  <td className="px-3.5 py-2.5 border-b border-border text-[12px] text-text-secondary">{formatDate(sp.start_date)}</td>
                  <td className="px-3.5 py-2.5 border-b border-border text-[12px] text-text-secondary">{formatDate(sp.end_date)}</td>
                  <td className="px-3.5 py-2.5 border-b border-border font-mono text-[11px] text-text-secondary">{sp.sort_order}</td>
                  <td className="px-3.5 py-2.5 border-b border-border text-right">
                    <button className="bg-transparent text-ccs-red border border-border2 rounded-md px-3 py-1.5 text-[11px] font-heading cursor-pointer uppercase hover:bg-ccs-red/10" onClick={() => delSplit(sp.id)}>Delete</button>
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
