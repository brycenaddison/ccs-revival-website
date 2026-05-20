import { useState, useEffect, useCallback } from "react";
import { db } from "../../lib/supabase";

interface Props {
  seasons: any[];
  toast: (msg: string, type?: "success" | "error") => void;
  onRefresh: () => void;
}

export function DivisionsTab({ seasons, toast, onRefresh }: Props) {
  const [divisions, setDivisions] = useState<any[]>([]);
  const [form, setForm] = useState({ name: "", season_id: "", sort_order: 0 });

  const load = useCallback(async () => {
    try { setDivisions(await db("divisions", { query: "?select=*,seasons(name)&order=sort_order" }) || []); }
    catch (e: any) { toast(e.message, "error"); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.name || !form.season_id) { toast("Name and season required", "error"); return; }
    try { await db("divisions", { method: "POST", body: form }); toast("Created", "success"); setForm({ name: "", season_id: "", sort_order: 0 }); load(); onRefresh(); }
    catch (e: any) { toast(e.message, "error"); }
  };
  const del = async (id: string) => {
    if (!confirm("Delete?")) return;
    try { await db(`divisions?id=eq.${id}`, { method: "DELETE" }); toast("Deleted", "success"); load(); onRefresh(); }
    catch (e: any) { toast(e.message, "error"); }
  };

  return (
    <div>
      <div className="bg-bg2 border border-border rounded-lg overflow-hidden mb-4">
        <div className="px-4 py-3.5 border-b border-border">
          <span className="font-display text-[17px] text-text-bright tracking-widest">ADD DIVISION</span>
        </div>
        <div className="p-4">
          <div className="flex gap-3 mb-3">
            <div className="flex-1 flex flex-col">
              <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">Name</label>
              <input className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none focus:border-accent" placeholder="Alpha" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="flex-1 flex flex-col">
              <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">Season</label>
              <select className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none cursor-pointer focus:border-accent" value={form.season_id} onChange={e => setForm({ ...form, season_id: e.target.value })}>
                <option value="">Select...</option>
                {seasons.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col max-w-[100px]">
              <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">Order</label>
              <input className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none focus:border-accent" type="number" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })} />
            </div>
          </div>
          <button className="bg-accent text-white border-none rounded-md px-5 py-2.5 text-[13px] font-heading font-medium tracking-wider uppercase cursor-pointer hover:opacity-90" onClick={save}>Add Division</button>
        </div>
      </div>
      <div className="bg-bg2 border border-border rounded-lg overflow-hidden mb-4">
        <div className="px-4 py-3.5 border-b border-border">
          <span className="font-display text-[17px] text-text-bright tracking-widest">DIVISIONS ({divisions.length})</span>
        </div>
        {divisions.length === 0 ? (
          <div className="py-10 text-center text-text-dim text-[13px]">No divisions yet.</div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {["Name", "Season", "Order", ""].map(h => (
                  <th key={h} className="px-3.5 py-2.5 text-left text-[10px] text-text-muted font-heading font-normal tracking-wider border-b border-border uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {divisions.map((d: any) => (
                <tr key={d.id} className="hover:bg-bg3/30 transition-colors">
                  <td className="px-3.5 py-2.5 border-b border-border font-heading font-medium text-[13px]">{d.name}</td>
                  <td className="px-3.5 py-2.5 border-b border-border text-[13px]">{d.seasons?.name}</td>
                  <td className="px-3.5 py-2.5 border-b border-border font-mono text-[11px] text-text-secondary">{d.sort_order}</td>
                  <td className="px-3.5 py-2.5 border-b border-border text-right">
                    <button className="bg-transparent text-ccs-red border border-border2 rounded-md px-3 py-1.5 text-[11px] font-heading cursor-pointer uppercase hover:bg-ccs-red/10" onClick={() => del(d.id)}>Delete</button>
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
