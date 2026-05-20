import { useState, useEffect, useCallback } from "react";
import { Auth, db } from "../lib/supabase";
import { Toast } from "../components/Toast";
import { ThemeToggle } from "../components/ThemeToggle";
import { LoginScreen } from "../components/admin/LoginScreen";
import { AdminTabs } from "../components/admin/AdminTabs";
import { TeamsTab } from "../components/admin/TeamsTab";
import { PlayersTab } from "../components/admin/PlayersTab";
import { RostersTab } from "../components/admin/RostersTab";
import { ScheduleTab } from "../components/admin/ScheduleTab";
import { DivisionsTab } from "../components/admin/DivisionsTab";
import { SeasonsTab } from "../components/admin/SeasonsTab";
import { ArticlesTab } from "../components/admin/ArticlesTab";
import { TwitterTab } from "../components/admin/TwitterTab";
import { TwitchTab } from "../components/admin/TwitchTab";
import { ApplicationsTab } from "../components/admin/ApplicationsTab";
import { DraftBoardTab } from "../components/admin/DraftBoardTab";

export default function Admin() {
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState("Teams");
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastType, setToastType] = useState<"success" | "error">("success");
  const [seasons, setSeasons] = useState<any[]>([]);
  const [divisions, setDivisions] = useState<any[]>([]);

  const toast = useCallback((msg: string, type: "success" | "error" = "success") => {
    setToastMsg(msg);
    setToastType(type);
  }, []);

  useEffect(() => {
    if (Auth.getSession() && Auth.isAdmin()) setAuthed(true);
    setChecking(false);
  }, []);

  const loadGlobals = useCallback(async () => {
    try {
      const [se, di] = await Promise.all([
        db("seasons", { query: "?select=*&order=created_at.desc" }),
        db("divisions", { query: "?select=*&order=sort_order" }),
      ]);
      setSeasons(se || []);
      setDivisions(di || []);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    if (authed) loadGlobals();
  }, [authed, loadGlobals]);

  if (checking) {
    return (
      <div className="bg-bg min-h-screen flex items-center justify-center">
        <span className="text-text-subtle">Loading...</span>
      </div>
    );
  }

  return (
    <div>
      {!authed ? (
        <LoginScreen onLogin={() => { setAuthed(true); toast("Welcome, admin"); }} toast={toast} />
      ) : (
        <div className="bg-bg min-h-screen text-text font-body">
          {/* Top Bar */}
          <div className="bg-bg2 border-b border-border px-5 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">⚔️</span>
              <span className="font-display text-xl text-text-bright tracking-widest">
                CCS
              </span>
              <span className="inline-block px-2 py-0.5 rounded text-[10px] font-heading tracking-wide font-medium uppercase ml-2" style={{ background: "rgba(210,7,8,0.2)", color: "var(--accent)" }}>
                ADMIN
              </span>
            </div>
            <div className="flex items-center gap-3.5">
              <span className="text-xs text-text-muted">{Auth.getUser()?.email}</span>
              <ThemeToggle />
              <button
                onClick={() => { Auth.signOut(); setAuthed(false); toast("Signed out"); }}
                className="bg-bg-input text-text border border-border2 rounded-md px-3.5 py-1.5 text-[11px] font-heading tracking-wider uppercase cursor-pointer"
              >
                Sign Out
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="max-w-[1100px] mx-auto p-5">
            <AdminTabs active={tab} setActive={setTab} />
            {tab === "Teams" && <TeamsTab seasons={seasons} divisions={divisions} toast={toast} />}
            {tab === "Players" && <PlayersTab toast={toast} />}
            {tab === "Rosters" && <RostersTab toast={toast} />}
            {tab === "Schedule" && <ScheduleTab toast={toast} />}
            {tab === "Draft Board" && <DraftBoardTab toast={toast} />}
            {tab === "Applications" && <ApplicationsTab toast={toast} />}
            {tab === "Articles" && <ArticlesTab toast={toast} />}
            {tab === "Twitter" && <TwitterTab toast={toast} />}
            {tab === "Twitch" && <TwitchTab toast={toast} />}
            {tab === "Divisions" && <DivisionsTab seasons={seasons} toast={toast} onRefresh={loadGlobals} />}
            {tab === "Seasons" && <SeasonsTab toast={toast} onRefresh={loadGlobals} />}
          </div>
        </div>
      )}
      <Toast message={toastMsg} type={toastType} onClose={() => setToastMsg(null)} />
    </div>
  );
}
