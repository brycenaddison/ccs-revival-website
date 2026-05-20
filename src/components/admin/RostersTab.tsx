import { useState, useEffect, useCallback, useRef } from "react";
import { db } from "../../lib/supabase";

interface Props {
  toast: (msg: string, type?: "success" | "error") => void;
}

const ROLES = ["Top", "Jungle", "Mid", "ADC", "Support", "Fill", "Sub"];

function fuzzyMatch(input: string, candidates: any[], key: string): any | null {
  const lower = input.trim().toLowerCase();
  if (!lower) return null;
  const exact = candidates.find(c => (c[key] || "").toLowerCase() === lower);
  if (exact) return exact;
  const partial = candidates.find(c => (c[key] || "").toLowerCase().includes(lower) || lower.includes((c[key] || "").toLowerCase()));
  return partial || null;
}

function parseCsvRosters(text: string, teams: any[], players: any[]): { rows: any[]; errors: string[] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { rows: [], errors: ["Need header row and at least one data row"] };

  const rawHeaders = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/[\s\-]/g, "_"));

  const ALIASES: Record<string, string[]> = {
    player: ["player", "player_name", "display_name", "name", "summoner"],
    team: ["team", "team_name"],
    role: ["role", "position"],
    is_starter: ["starter", "is_starter"],
    is_captain: ["captain", "is_captain"],
  };

  const colMap: Record<string, number> = {};
  rawHeaders.forEach((h, i) => {
    for (const [field, aliases] of Object.entries(ALIASES)) {
      if (aliases.includes(h) && !(field in colMap)) colMap[field] = i;
    }
  });

  if (!("player" in colMap)) return { rows: [], errors: ["Missing player column (player, player_name, name)"] };
  if (!("team" in colMap)) return { rows: [], errors: ["Missing team column (team, team_name)"] };

  const rows: any[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map(v => v.trim().replace(/^["']|["']$/g, ""));
    const playerName = values[colMap.player] || "";
    const teamName = values[colMap.team] || "";
    const role = values[colMap.role] ?? "";
    const isStarter = colMap.is_starter !== undefined ? ["true", "1", "yes"].includes((values[colMap.is_starter] || "").toLowerCase()) : true;
    const isCaptain = colMap.is_captain !== undefined ? ["true", "1", "yes"].includes((values[colMap.is_captain] || "").toLowerCase()) : false;

    const player = fuzzyMatch(playerName, players, "display_name") || fuzzyMatch(playerName, players, "riot_game_name");
    const team = fuzzyMatch(teamName, teams, "name") || fuzzyMatch(teamName, teams, "abbreviation");

    if (!player) { errors.push(`Row ${i + 1}: Player "${playerName}" not found`); continue; }
    if (!team) { errors.push(`Row ${i + 1}: Team "${teamName}" not found`); continue; }

    rows.push({ player_id: player.id, team_id: team.id, role: role || "Fill", is_starter: isStarter, is_captain: isCaptain, _playerName: player.display_name, _teamName: team.name });
  }

  return { rows, errors };
}

export function RostersTab({ toast }: Props) {
  const [rosters, setRosters] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [players, setPlayers] = useState<any[]>([]);
  const [splits, setSplits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ player_id: "", team_id: "", split_id: "", role: "Fill", is_starter: true, is_captain: false });

  // CSV state
  const [csvText, setCsvText] = useState("");
  const [csvSplitId, setCsvSplitId] = useState("");
  const [csvPreview, setCsvPreview] = useState<{ rows: any[]; errors: string[] } | null>(null);
  const [importing, setImporting] = useState(false);
  const csvFileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, t, p, sp] = await Promise.all([
        db("rosters", { query: "?select=*,players(display_name,riot_game_name),teams(name,abbreviation),splits(name)&order=created_at.desc" }),
        db("teams", { query: "?select=id,name,abbreviation&order=name" }),
        db("players", { query: "?select=id,display_name,riot_game_name&is_active=eq.true&order=display_name" }),
        db("splits", { query: "?select=*,seasons(name)&order=split_number" }),
      ]);
      setRosters(r || []); setTeams(t || []); setPlayers(p || []); setSplits(sp || []);
    } catch (e: any) { toast(e.message, "error"); }
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.player_id || !form.team_id) { toast("Player and team are required", "error"); return; }
    const body: any = { ...form };
    if (!body.split_id) body.split_id = null;
    try {
      await db("rosters", { method: "POST", body });
      toast("Roster entry created", "success");
      setForm({ player_id: "", team_id: "", split_id: "", role: "Fill", is_starter: true, is_captain: false });
      load();
    } catch (e: any) { toast(e.message, "error"); }
  };

  const del = async (id: string) => {
    if (!confirm("Remove this roster entry?")) return;
    try { await db(`rosters?id=eq.${id}`, { method: "DELETE" }); toast("Removed", "success"); load(); }
    catch (e: any) { toast(e.message, "error"); }
  };

  // CSV handlers
  const handleCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvText(text);
      setCsvPreview(parseCsvRosters(text, teams, players));
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const previewCsv = () => {
    if (!csvText.trim()) { toast("Paste CSV data first", "error"); return; }
    const parsed = parseCsvRosters(csvText, teams, players);
    if (parsed.rows.length === 0 && parsed.errors.length === 0) { toast("No valid rows found", "error"); return; }
    setCsvPreview(parsed);
  };

  const importCsv = async () => {
    if (!csvPreview || csvPreview.rows.length === 0) return;
    setImporting(true);
    let success = 0;
    let failed = 0;
    for (const row of csvPreview.rows) {
      const body: any = {
        player_id: row.player_id,
        team_id: row.team_id,
        split_id: csvSplitId || null,
        role: row.role,
        is_starter: row.is_starter,
        is_captain: row.is_captain,
      };
      try { await db("rosters", { method: "POST", body }); success++; }
      catch { failed++; }
    }
    toast(`Imported ${success} roster entries${failed ? `, ${failed} failed` : ""}`, success > 0 ? "success" : "error");
    setCsvText("");
    setCsvPreview(null);
    setImporting(false);
    load();
  };

  return (
    <div>
      {/* Add Roster Entry */}
      <div className="bg-bg2 border border-border rounded-lg overflow-hidden mb-4">
        <div className="px-4 py-3.5 border-b border-border">
          <span className="font-display text-[17px] text-text-bright tracking-widest">ADD ROSTER ENTRY</span>
        </div>
        <div className="p-4">
          <div className="flex gap-3 mb-3">
            <div className="flex-1 flex flex-col">
              <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">Player</label>
              <select className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none cursor-pointer focus:border-accent" value={form.player_id} onChange={e => setForm({ ...form, player_id: e.target.value })}>
                <option value="">Select player...</option>
                {players.map((p: any) => <option key={p.id} value={p.id}>{p.display_name}{p.riot_game_name ? ` (${p.riot_game_name})` : ""}</option>)}
              </select>
            </div>
            <div className="flex-1 flex flex-col">
              <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">Team</label>
              <select className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none cursor-pointer focus:border-accent" value={form.team_id} onChange={e => setForm({ ...form, team_id: e.target.value })}>
                <option value="">Select team...</option>
                {teams.map((t: any) => <option key={t.id} value={t.id}>{t.name} ({t.abbreviation})</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-3 mb-3">
            <div className="flex-1 flex flex-col">
              <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">Split</label>
              <select className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none cursor-pointer focus:border-accent" value={form.split_id} onChange={e => setForm({ ...form, split_id: e.target.value })}>
                <option value="">No split</option>
                {splits.map((s: any) => <option key={s.id} value={s.id}>{s.seasons?.name} — {s.name}</option>)}
              </select>
            </div>
            <div className="flex-1 flex flex-col">
              <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">Role</label>
              <select className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none cursor-pointer focus:border-accent" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-4 items-center mb-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_starter} onChange={e => setForm({ ...form, is_starter: e.target.checked })} className="accent-accent w-4 h-4" />
              <span className="text-[12px] text-text-secondary font-heading tracking-wider uppercase">Starter</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_captain} onChange={e => setForm({ ...form, is_captain: e.target.checked })} className="accent-accent w-4 h-4" />
              <span className="text-[12px] text-text-secondary font-heading tracking-wider uppercase">Captain</span>
            </label>
          </div>
          <button className="bg-accent text-white border-none rounded-md px-5 py-2.5 text-[13px] font-heading font-medium tracking-wider uppercase cursor-pointer hover:opacity-90" onClick={save}>Add to Roster</button>
        </div>
      </div>

      {/* CSV Import */}
      <div className="bg-bg2 border border-border rounded-lg overflow-hidden mb-4">
        <div className="px-4 py-3.5 border-b border-border">
          <span className="font-display text-[17px] text-text-bright tracking-widest">CSV ROSTER IMPORT</span>
        </div>
        <div className="p-4">
          <p className="text-[12px] text-text-dim mb-3 font-body leading-relaxed">
            Required columns: <span className="font-mono text-text-secondary">player</span> (player_name, name),
            <span className="font-mono text-text-secondary"> team</span> (team_name).
            Optional: <span className="font-mono text-text-secondary">role</span> (position),
            <span className="font-mono text-text-secondary"> starter</span> (is_starter),
            <span className="font-mono text-text-secondary"> captain</span> (is_captain).
            Players and teams are fuzzy-matched by name.
          </p>
          <div className="flex gap-3 mb-3">
            <div className="flex-1 flex flex-col">
              <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">Split for Import</label>
              <select className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none cursor-pointer focus:border-accent" value={csvSplitId} onChange={e => setCsvSplitId(e.target.value)}>
                <option value="">No split</option>
                {splits.map((s: any) => <option key={s.id} value={s.id}>{s.seasons?.name} — {s.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2 mb-3 items-center">
            <input ref={csvFileRef} type="file" accept=".csv,.txt" onChange={handleCsvFile} className="hidden" />
            <button className="bg-bg-input text-text border border-border2 rounded-md px-5 py-2.5 text-[13px] font-heading tracking-wider uppercase cursor-pointer hover:text-white" onClick={() => csvFileRef.current?.click()}>Upload CSV</button>
            <span className="text-[11px] text-text-dim">or paste below</span>
          </div>
          <textarea
            className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[12px] font-mono outline-none resize-y min-h-[80px] focus:border-accent"
            placeholder={"player,team,role,starter\nPlayerOne,Shadow Wolves,Mid,true"}
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
                {importing ? "Importing..." : `Import ${csvPreview.rows.length} Entries`}
              </button>
            )}
          </div>

          {/* Errors */}
          {csvPreview && csvPreview.errors.length > 0 && (
            <div className="mt-3 p-3 bg-ccs-red/10 border border-ccs-red/30 rounded-md">
              <div className="text-[11px] text-ccs-red font-heading tracking-wider uppercase mb-1">Matching Errors</div>
              {csvPreview.errors.map((err, i) => (
                <div key={i} className="text-[11px] text-ccs-red/80 font-body">{err}</div>
              ))}
            </div>
          )}

          {/* Preview Table */}
          {csvPreview && csvPreview.rows.length > 0 && (
            <div className="mt-3 border border-border rounded-md overflow-hidden">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {["Player", "Team", "Role", "Starter", "Captain"].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-[10px] text-text-muted font-heading font-normal tracking-wider border-b border-border uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {csvPreview.rows.slice(0, 10).map((row, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 border-b border-border text-[12px] font-body text-text-secondary">{row._playerName}</td>
                      <td className="px-3 py-2 border-b border-border text-[12px] font-body text-text-secondary">{row._teamName}</td>
                      <td className="px-3 py-2 border-b border-border text-[12px] font-body text-text-secondary">{row.role}</td>
                      <td className="px-3 py-2 border-b border-border text-[12px] font-body text-text-secondary">{row.is_starter ? "Yes" : "No"}</td>
                      <td className="px-3 py-2 border-b border-border text-[12px] font-body text-text-secondary">{row.is_captain ? "Yes" : "No"}</td>
                    </tr>
                  ))}
                  {csvPreview.rows.length > 10 && (
                    <tr><td colSpan={5} className="px-3 py-2 text-center text-[11px] text-text-dim">...and {csvPreview.rows.length - 10} more rows</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Roster List */}
      <div className="bg-bg2 border border-border rounded-lg overflow-hidden mb-4">
        <div className="px-4 py-3.5 border-b border-border">
          <span className="font-display text-[17px] text-text-bright tracking-widest">ROSTER ({rosters.length})</span>
        </div>
        {rosters.length === 0 ? (
          <div className="py-10 text-center text-text-dim text-[13px]">{loading ? "Loading..." : "No roster entries yet."}</div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {["Player", "Team", "Split", "Role", "Status", ""].map(h => (
                  <th key={h} className="px-3.5 py-2.5 text-left text-[10px] text-text-muted font-heading font-normal tracking-wider border-b border-border uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rosters.map((r: any) => (
                <tr key={r.id} className="hover:bg-bg3/30 transition-colors">
                  <td className="px-3.5 py-2.5 border-b border-border font-heading font-medium text-[13px]">
                    {r.players?.display_name || <span className="text-text-subtle">Unknown</span>}
                    {r.players?.riot_game_name && <span className="text-text-dim text-[11px] ml-1.5">({r.players.riot_game_name})</span>}
                  </td>
                  <td className="px-3.5 py-2.5 border-b border-border text-[13px]">
                    {r.teams?.name || <span className="text-text-subtle">—</span>}
                    {r.teams?.abbreviation && <span className="font-mono text-[10px] text-text-dim ml-1.5">{r.teams.abbreviation}</span>}
                  </td>
                  <td className="px-3.5 py-2.5 border-b border-border text-[12px] text-text-secondary">{r.splits?.name || <span className="text-text-subtle">—</span>}</td>
                  <td className="px-3.5 py-2.5 border-b border-border text-[12px] text-text-secondary">{r.role}</td>
                  <td className="px-3.5 py-2.5 border-b border-border">
                    <div className="flex gap-1">
                      {r.is_starter && <span className="bg-ccs-green/20 text-ccs-green px-2 py-0.5 rounded text-[10px] font-heading tracking-wider uppercase">Starter</span>}
                      {r.is_captain && <span className="bg-ccs-gold/20 text-ccs-gold px-2 py-0.5 rounded text-[10px] font-heading tracking-wider uppercase">Captain</span>}
                      {!r.is_starter && <span className="bg-bg3/50 text-text-dim px-2 py-0.5 rounded text-[10px] font-heading tracking-wider uppercase">Sub</span>}
                    </div>
                  </td>
                  <td className="px-3.5 py-2.5 border-b border-border text-right">
                    <button className="bg-transparent text-ccs-red border border-border2 rounded-md px-3 py-1.5 text-[11px] font-heading cursor-pointer uppercase hover:bg-ccs-red/10" onClick={() => del(r.id)}>Remove</button>
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
