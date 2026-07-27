import { useState, useEffect, useCallback } from "react";
import { db } from "../../lib/supabase";

interface Props {
  toast: (msg: string, type?: "success" | "error") => void;
}

export function ApplicationsTab({ toast }: Props) {
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [denyingId, setDenyingId] = useState<string | null>(null);
  const [denyNotes, setDenyNotes] = useState("");
  const [processing, setProcessing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setApplications(await db("team_applications", { query: "?select=*&order=created_at.desc" }) || []);
    } catch (e: any) { toast(e.message, "error"); }
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const toggleExpand = (id: string) => {
    setExpanded(prev => prev === id ? null : id);
    setDenyingId(null);
    setDenyNotes("");
  };

  const approve = async (app: any) => {
    if (!confirm(`Approve "${app.team_name}" and create the team + players + roster?`)) return;
    setProcessing(app.id);
    try {
      // 1. Create team
      const [team] = await db("teams", {
        method: "POST",
        body: {
          name: app.team_name,
          abbreviation: app.abbreviation,
          color_primary: app.color_primary || "#d7a52a",
          color_accent: app.color_accent || "#d20708",
          logo_url: app.logo_url || null,
          is_active: true,
        },
      });

      // 2. Create players and roster entries
      const players: any[] = app.players || [];
      for (const p of players) {
        const [player] = await db("players", {
          method: "POST",
          body: {
            display_name: p.display_name,
            riot_game_name: p.riot_game_name || null,
            riot_tag_line: p.riot_tag_line || null,
          },
        });

        await db("rosters", {
          method: "POST",
          body: {
            player_id: player.id,
            team_id: team.id,
            role: p.role || "Fill",
            is_captain: p.is_captain || false,
            is_starter: true,
          },
        });
      }

      // 3. Update application status
      await db(`team_applications?id=eq.${app.id}`, {
        method: "PATCH",
        body: { status: "approved" } as any,
      });

      toast("Team approved and created!", "success");
      load();
    } catch (e: any) {
      toast(e.message, "error");
    }
    setProcessing(null);
  };

  const deny = async (app: any) => {
    setProcessing(app.id);
    try {
      await db(`team_applications?id=eq.${app.id}`, {
        method: "PATCH",
        body: { status: "denied", admin_notes: denyNotes.trim() || null } as any,
      });
      toast("Application denied", "success");
      setDenyingId(null);
      setDenyNotes("");
      load();
    } catch (e: any) {
      toast(e.message, "error");
    }
    setProcessing(null);
  };

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: "bg-ccs-orange/20 text-ccs-orange",
      approved: "bg-ccs-green/20 text-ccs-green",
      denied: "bg-ccs-red/20 text-ccs-red",
    };
    return (
      <span className={`inline-block px-2.5 py-1 rounded text-[10px] font-heading tracking-wider uppercase ${styles[status] || "bg-bg-input text-text-muted"}`}>
        {status}
      </span>
    );
  };

  return (
    <div>
      <div className="bg-bg2 border border-border rounded-lg overflow-hidden mb-4">
        <div className="px-4 py-3.5 border-b border-border">
          <span className="font-display text-[17px] text-text-bright tracking-widest">TEAM APPLICATIONS ({applications.length})</span>
        </div>
        {applications.length === 0 ? (
          <div className="py-10 text-center text-text-dim text-[13px]">{loading ? "Loading..." : "No applications yet."}</div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {["Team", "Abbr", "Captain Discord", "Players", "Status", "Date", ""].map((h, i) => (
                  <th key={`${h}-${i}`} className="px-3.5 py-2.5 text-left text-[10px] text-text-muted font-heading font-normal tracking-wider border-b border-border uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {applications.map((app: any) => {
                const players: any[] = app.players || [];
                const isExpanded = expanded === app.id;
                const isDenying = denyingId === app.id;
                const isProcessing = processing === app.id;

                return (
                  <tr key={app.id} className="group">
                    <td colSpan={7} className="p-0 border-b border-border">
                      {/* Summary Row */}
                      <div className="flex items-center hover:bg-bg3/30 transition-colors cursor-pointer" onClick={() => toggleExpand(app.id)}>
                        <div className="flex-[2] px-3.5 py-2.5 font-heading font-medium text-[13px] flex items-center gap-2">
                          {app.logo_url ? (
                            <img src={app.logo_url} alt="" className="w-6 h-6 rounded object-contain bg-bg-input" />
                          ) : (
                            <div className="w-6 h-6 rounded flex items-center justify-center text-[8px] text-white font-semibold font-heading" style={{ background: `linear-gradient(135deg, ${app.color_primary || "#333"}, ${app.color_accent || "#555"})` }}>
                              {(app.abbreviation || "?").charAt(0)}
                            </div>
                          )}
                          {app.team_name}
                        </div>
                        <div className="w-16 px-3.5 py-2.5 font-mono text-[11px] text-text-secondary">{app.abbreviation}</div>
                        <div className="flex-1 px-3.5 py-2.5 text-[12px] text-text-secondary">{app.captain_discord}</div>
                        <div className="w-16 px-3.5 py-2.5 text-[12px] text-text-secondary text-center">{players.length}</div>
                        <div className="w-20 px-3.5 py-2.5">{statusBadge(app.status)}</div>
                        <div className="w-24 px-3.5 py-2.5 text-[11px] text-text-dim">{app.created_at ? new Date(app.created_at).toLocaleDateString() : "--"}</div>
                        <div className="w-8 px-2 py-2.5 text-text-muted text-[12px]">{isExpanded ? "\u25B2" : "\u25BC"}</div>
                      </div>

                      {/* Expanded Detail */}
                      {isExpanded && (
                        <div className="bg-bg/50 border-t border-border px-4 py-3">
                          {/* Colors preview */}
                          <div className="flex items-center gap-3 mb-3">
                            <div className="flex gap-1">
                              <div className="w-5 h-5 rounded-sm" style={{ background: app.color_primary || "#333" }} />
                              <div className="w-5 h-5 rounded-sm" style={{ background: app.color_accent || "#555" }} />
                            </div>
                            <span className="text-[11px] font-mono text-text-dim">{app.color_primary} / {app.color_accent}</span>
                          </div>

                          {/* Player List */}
                          <div className="bg-bg2 border border-border rounded-md overflow-hidden mb-3">
                            <table className="w-full border-collapse">
                              <thead>
                                <tr>
                                  {["Name", "Riot ID", "OP.GG", "Role", "Captain", "Alt Accounts"].map(h => (
                                    <th key={h} className="px-3 py-2 text-left text-[10px] text-text-muted font-heading font-normal tracking-wider border-b border-border uppercase">{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {players.map((p: any, i: number) => (
                                  <tr key={i} className="hover:bg-bg3/30 transition-colors">
                                    <td className="px-3 py-2 border-b border-border text-[12px] font-heading font-medium">{p.display_name}</td>
                                    <td className="px-3 py-2 border-b border-border text-[12px] text-text-secondary">
                                      {p.riot_game_name ? `${p.riot_game_name}${p.riot_tag_line ? "#" + p.riot_tag_line : ""}` : <span className="text-text-subtle">&mdash;</span>}
                                    </td>
                                    <td className="px-3 py-2 border-b border-border text-[11px]">
                                      {p.opgg_link ? (
                                        <a href={p.opgg_link} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline truncate block max-w-[140px]">op.gg</a>
                                      ) : <span className="text-text-subtle">&mdash;</span>}
                                    </td>
                                    <td className="px-3 py-2 border-b border-border text-[11px] text-text-secondary">{p.role || "Fill"}</td>
                                    <td className="px-3 py-2 border-b border-border text-[11px]">
                                      {p.is_captain && <span className="bg-ccs-orange/20 text-ccs-orange px-2 py-0.5 rounded text-[10px] font-heading tracking-wider uppercase">Captain</span>}
                                    </td>
                                    <td className="px-3 py-2 border-b border-border text-[11px] text-text-dim max-w-[140px] truncate">{p.alt_accounts || <span className="text-text-subtle">&mdash;</span>}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* Admin Notes (for denied) */}
                          {app.status === "denied" && app.admin_notes && (
                            <div className="bg-ccs-red/10 border border-ccs-red/20 rounded-md px-3 py-2 mb-3">
                              <span className="text-[10px] font-heading tracking-wider text-ccs-red uppercase block mb-1">Denial Notes</span>
                              <p className="text-[12px] text-text-secondary font-body">{app.admin_notes}</p>
                            </div>
                          )}

                          {/* Action Buttons */}
                          {app.status === "pending" && (
                            <div className="flex gap-2 items-start">
                              <button
                                className={`bg-ccs-green text-white border-none rounded-md px-5 py-2.5 text-[13px] font-heading font-medium tracking-wider uppercase cursor-pointer ${isProcessing ? "opacity-60" : "hover:opacity-90"}`}
                                onClick={(e) => { e.stopPropagation(); approve(app); }}
                                disabled={isProcessing}
                              >
                                {isProcessing ? "Processing..." : "Approve & Create Team"}
                              </button>
                              {!isDenying ? (
                                <button
                                  className="bg-transparent text-ccs-red border border-border2 rounded-md px-5 py-2.5 text-[13px] font-heading tracking-wider uppercase cursor-pointer hover:bg-ccs-red/10"
                                  onClick={(e) => { e.stopPropagation(); setDenyingId(app.id); }}
                                >
                                  Deny
                                </button>
                              ) : (
                                <div className="flex gap-2 items-end flex-1" onClick={e => e.stopPropagation()}>
                                  <div className="flex-1 flex flex-col">
                                    <label className="text-[10px] text-text-dim font-heading tracking-wider uppercase mb-0.5">Notes (optional)</label>
                                    <textarea
                                      className="w-full bg-bg-input border border-border2 rounded-md text-text py-2 px-3 text-[12px] font-body outline-none resize-none min-h-[60px] focus:border-accent"
                                      placeholder="Reason for denial..."
                                      value={denyNotes}
                                      onChange={e => setDenyNotes(e.target.value)}
                                    />
                                  </div>
                                  <button
                                    className={`bg-ccs-red text-white border-none rounded-md px-5 py-2.5 text-[13px] font-heading font-medium tracking-wider uppercase cursor-pointer ${isProcessing ? "opacity-60" : "hover:opacity-90"}`}
                                    onClick={() => deny(app)}
                                    disabled={isProcessing}
                                  >
                                    Confirm Deny
                                  </button>
                                  <button
                                    className="bg-bg-input text-text border border-border2 rounded-md px-3 py-2.5 text-[13px] font-heading tracking-wider uppercase cursor-pointer hover:text-white"
                                    onClick={() => { setDenyingId(null); setDenyNotes(""); }}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
