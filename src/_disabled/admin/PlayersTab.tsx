import { useState, useEffect, useCallback, useRef } from "react";
import { db } from "../../lib/supabase";

interface Props {
  toast: (msg: string, type?: "success" | "error") => void;
}

const COLUMN_ALIASES: Record<string, string[]> = {
  display_name: ["name", "player", "summoner", "display_name", "displayname", "player_name"],
  riot_game_name: ["game_name", "riot_name", "riot_id", "riot_game_name", "gamename", "ign"],
  riot_tag_line: ["tag_line", "tagline", "tag", "riot_tag_line", "riot_tagline", "riot_tag"],
  riot_puuid: ["puuid", "riot_puuid"],
};

function matchColumn(header: string): string | null {
  const h = header.trim().toLowerCase().replace(/[\s\-]/g, "_");
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.includes(h)) return field;
  }
  return null;
}

function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };

  const rawHeaders = lines[0].split(",").map(h => h.trim().replace(/^["']|["']$/g, ""));
  const mappedHeaders = rawHeaders.map(h => matchColumn(h));
  const headers = mappedHeaders.filter(Boolean) as string[];

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map(v => v.trim().replace(/^["']|["']$/g, ""));
    const row: Record<string, string> = {};
    mappedHeaders.forEach((field, idx) => {
      if (field && values[idx]) row[field] = values[idx];
    });
    if (row.display_name || row.riot_game_name) rows.push(row);
  }
  return { headers, rows };
}

export function PlayersTab({ toast }: Props) {
  const [players, setPlayers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ display_name: "", riot_game_name: "", riot_tag_line: "", riot_puuid: "" });
  const [editing, setEditing] = useState<string | null>(null);

  // CSV import state
  const [csvText, setCsvText] = useState("");
  const [csvPreview, setCsvPreview] = useState<{ headers: string[]; rows: Record<string, string>[] } | null>(null);
  const [importing, setImporting] = useState(false);
  const csvFileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setPlayers(await db("players", { query: "?select=*&order=display_name" }) || []); }
    catch (e: any) { toast(e.message, "error"); }
    setLoading(false);
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.display_name) { toast("Display name is required", "error"); return; }
    const body: any = { ...form };
    if (!body.riot_puuid) body.riot_puuid = null;
    if (!body.riot_tag_line) body.riot_tag_line = null;
    if (!body.riot_game_name) body.riot_game_name = null;
    try {
      if (editing) { await db(`players?id=eq.${editing}`, { method: "PATCH", body }); toast("Player updated", "success"); }
      else { await db("players", { method: "POST", body }); toast("Player created", "success"); }
      setForm({ display_name: "", riot_game_name: "", riot_tag_line: "", riot_puuid: "" });
      setEditing(null); load();
    } catch (e: any) { toast(e.message, "error"); }
  };

  const del = async (id: string) => {
    if (!confirm("Delete this player?")) return;
    try { await db(`players?id=eq.${id}`, { method: "DELETE" }); toast("Deleted", "success"); load(); }
    catch (e: any) { toast(e.message, "error"); }
  };

  const edit = (p: any) => {
    setEditing(p.id);
    setForm({ display_name: p.display_name || "", riot_game_name: p.riot_game_name || "", riot_tag_line: p.riot_tag_line || "", riot_puuid: p.riot_puuid || "" });
  };

  const resetForm = () => {
    setEditing(null);
    setForm({ display_name: "", riot_game_name: "", riot_tag_line: "", riot_puuid: "" });
  };

  // CSV handlers
  const handleCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvText(text);
      setCsvPreview(parseCsv(text));
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const previewCsv = () => {
    if (!csvText.trim()) { toast("Paste CSV data first", "error"); return; }
    const parsed = parseCsv(csvText);
    if (parsed.rows.length === 0) { toast("No valid rows found. Check column headers.", "error"); return; }
    setCsvPreview(parsed);
  };

  const importCsv = async () => {
    if (!csvPreview || csvPreview.rows.length === 0) return;
    setImporting(true);
    let success = 0;
    let failed = 0;
    for (const row of csvPreview.rows) {
      const body: any = {
        display_name: row.display_name || row.riot_game_name || "Unknown",
        riot_game_name: row.riot_game_name || null,
        riot_tag_line: row.riot_tag_line || null,
        riot_puuid: row.riot_puuid || null,
      };
      try { await db("players", { method: "POST", body }); success++; }
      catch { failed++; }
    }
    toast(`Imported ${success} players${failed ? `, ${failed} failed` : ""}`, success > 0 ? "success" : "error");
    setCsvText("");
    setCsvPreview(null);
    setImporting(false);
    load();
  };

  return (
    <div>
      {/* Add/Edit Form */}
      <div className="bg-bg2 border border-border rounded-lg overflow-hidden mb-4">
        <div className="px-4 py-3.5 border-b border-border flex justify-between items-center">
          <span className="font-display text-[17px] text-text-bright tracking-widest">{editing ? "EDIT PLAYER" : "ADD PLAYER"}</span>
          {editing && <button className="bg-bg-input text-text border border-border2 rounded-md px-5 py-2.5 text-[13px] font-heading tracking-wider uppercase cursor-pointer hover:text-white" onClick={resetForm}>Cancel</button>}
        </div>
        <div className="p-4">
          <div className="flex gap-3 mb-3">
            <div className="flex-1 flex flex-col">
              <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">Display Name</label>
              <input className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none focus:border-accent" placeholder="PlayerName" value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })} />
            </div>
            <div className="flex-1 flex flex-col">
              <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">Riot Game Name</label>
              <input className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none focus:border-accent" placeholder="GameName" value={form.riot_game_name} onChange={e => setForm({ ...form, riot_game_name: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-3 mb-3">
            <div className="flex-1 flex flex-col">
              <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">Riot Tag Line</label>
              <input className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none focus:border-accent" placeholder="NA1" value={form.riot_tag_line} onChange={e => setForm({ ...form, riot_tag_line: e.target.value })} />
            </div>
            <div className="flex-1 flex flex-col">
              <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">Riot PUUID</label>
              <input className="w-full bg-bg-input border border-border2 rounded-md text-text-secondary py-2.5 px-3.5 text-[11px] font-mono outline-none focus:border-accent" placeholder="Optional" value={form.riot_puuid} onChange={e => setForm({ ...form, riot_puuid: e.target.value })} />
            </div>
          </div>
          <button className="bg-accent text-white border-none rounded-md px-5 py-2.5 text-[13px] font-heading font-medium tracking-wider uppercase cursor-pointer hover:opacity-90" onClick={save}>
            {editing ? "Update Player" : "Add Player"}
          </button>
        </div>
      </div>

      {/* CSV Import */}
      <div className="bg-bg2 border border-border rounded-lg overflow-hidden mb-4">
        <div className="px-4 py-3.5 border-b border-border">
          <span className="font-display text-[17px] text-text-bright tracking-widest">CSV BULK IMPORT</span>
        </div>
        <div className="p-4">
          <p className="text-[12px] text-text-dim mb-3 font-body leading-relaxed">
            Accepted columns: <span className="font-mono text-text-secondary">display_name</span> (name, player, summoner),
            <span className="font-mono text-text-secondary"> riot_game_name</span> (game_name, riot_name, ign),
            <span className="font-mono text-text-secondary"> riot_tag_line</span> (tag_line, tagline, tag),
            <span className="font-mono text-text-secondary"> riot_puuid</span> (puuid)
          </p>
          <div className="flex gap-2 mb-3 items-center">
            <input ref={csvFileRef} type="file" accept=".csv,.txt" onChange={handleCsvFile} className="hidden" />
            <button className="bg-bg-input text-text border border-border2 rounded-md px-5 py-2.5 text-[13px] font-heading tracking-wider uppercase cursor-pointer hover:text-white" onClick={() => csvFileRef.current?.click()}>Upload CSV</button>
            <span className="text-[11px] text-text-dim">or paste below</span>
          </div>
          <textarea
            className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[12px] font-mono outline-none resize-y min-h-[80px] focus:border-accent"
            placeholder={"display_name,riot_game_name,riot_tag_line\nPlayerOne,Player1,NA1"}
            value={csvText}
            onChange={e => { setCsvText(e.target.value); setCsvPreview(null); }}
          />
          <div className="flex gap-2 mt-2">
            <button className="bg-bg-input text-text border border-border2 rounded-md px-5 py-2.5 text-[13px] font-heading tracking-wider uppercase cursor-pointer hover:text-white" onClick={previewCsv}>Preview</button>
            {csvPreview && csvPreview.rows.length > 0 && (
              <button
                className={`bg-ccs-green text-white border-none rounded-md px-5 py-2.5 text-[13px] font-heading font-medium tracking-wider uppercase cursor-pointer ${importing ? "opacity-60" : "hover:opacity-90"}`}
                onClick={importCsv}
                disabled={importing}
              >
                {importing ? "Importing..." : `Import ${csvPreview.rows.length} Players`}
              </button>
            )}
          </div>

          {/* Preview Table */}
          {csvPreview && csvPreview.rows.length > 0 && (
            <div className="mt-3 border border-border rounded-md overflow-hidden">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {csvPreview.headers.map(h => (
                      <th key={h} className="px-3 py-2 text-left text-[10px] text-text-muted font-heading font-normal tracking-wider border-b border-border uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {csvPreview.rows.slice(0, 10).map((row, i) => (
                    <tr key={i}>
                      {csvPreview.headers.map(h => (
                        <td key={h} className="px-3 py-2 border-b border-border text-[12px] font-body text-text-secondary">{row[h] || <span className="text-text-subtle">—</span>}</td>
                      ))}
                    </tr>
                  ))}
                  {csvPreview.rows.length > 10 && (
                    <tr><td colSpan={csvPreview.headers.length} className="px-3 py-2 text-center text-[11px] text-text-dim">...and {csvPreview.rows.length - 10} more rows</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Players List */}
      <div className="bg-bg2 border border-border rounded-lg overflow-hidden mb-4">
        <div className="px-4 py-3.5 border-b border-border">
          <span className="font-display text-[17px] text-text-bright tracking-widest">ALL PLAYERS ({players.length})</span>
        </div>
        {players.length === 0 ? (
          <div className="py-10 text-center text-text-dim text-[13px]">{loading ? "Loading..." : "No players yet."}</div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {["Display Name", "Riot Name", "Tag", "PUUID", ""].map(h => (
                  <th key={h} className="px-3.5 py-2.5 text-left text-[10px] text-text-muted font-heading font-normal tracking-wider border-b border-border uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {players.map((p: any) => (
                <tr key={p.id} className="hover:bg-bg3/30 transition-colors">
                  <td className="px-3.5 py-2.5 border-b border-border font-heading font-medium text-[13px]">{p.display_name}</td>
                  <td className="px-3.5 py-2.5 border-b border-border text-[13px] text-text-secondary">{p.riot_game_name || <span className="text-text-subtle">—</span>}</td>
                  <td className="px-3.5 py-2.5 border-b border-border font-mono text-[11px] text-text-secondary">{p.riot_tag_line || <span className="text-text-subtle">—</span>}</td>
                  <td className="px-3.5 py-2.5 border-b border-border font-mono text-[10px] text-text-dim max-w-[120px] truncate">{p.riot_puuid || <span className="text-text-subtle">—</span>}</td>
                  <td className="px-3.5 py-2.5 border-b border-border text-right">
                    <button className="bg-bg-input text-text border border-border2 rounded-md px-3 py-1.5 text-[11px] font-heading tracking-wider uppercase cursor-pointer mr-1.5 hover:text-white" onClick={() => edit(p)}>Edit</button>
                    <button className="bg-transparent text-ccs-red border border-border2 rounded-md px-3 py-1.5 text-[11px] font-heading cursor-pointer uppercase hover:bg-ccs-red/10" onClick={() => del(p.id)}>Delete</button>
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
