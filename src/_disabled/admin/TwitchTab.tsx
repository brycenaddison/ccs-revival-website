import { useState, useEffect, useCallback } from "react";
import { db } from "../../lib/supabase";

interface Props {
  toast: (msg: string, type?: "success" | "error") => void;
}

export function TwitchTab({ toast }: Props) {
  const [embeds, setEmbeds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [channelInput, setChannelInput] = useState("");
  const [clipUrl, setClipUrl] = useState("");
  const [clipTitle, setClipTitle] = useState("");
  const [ytUrl, setYtUrl] = useState("");
  const [ytTitle, setYtTitle] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEmbeds(await db("twitch_embeds", { query: "?select=*&order=sort_order,created_at.desc" }) || []);
    } catch (e: any) { toast(e.message, "error"); }
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const addChannel = async () => {
    const channel = channelInput.trim().toLowerCase();
    if (!channel) { toast("Enter a channel name", "error"); return; }
    try {
      await db("twitch_embeds", {
        method: "POST",
        body: {
          embed_type: "channel",
          channel_name: channel,
          title: channel,
          is_active: true,
          sort_order: embeds.length,
        },
      });
      toast("Channel added", "success");
      setChannelInput("");
      load();
    } catch (e: any) { toast(e.message, "error"); }
  };

  const addClip = async () => {
    const url = clipUrl.trim();
    if (!url) { toast("Paste a clip or VOD URL", "error"); return; }
    if (!/https?:\/\/(www\.)?(twitch\.tv|clips\.twitch\.tv)\/.+/.test(url)) {
      toast("Invalid Twitch URL", "error");
      return;
    }
    try {
      await db("twitch_embeds", {
        method: "POST",
        body: {
          embed_type: "clip",
          clip_url: url,
          title: clipTitle.trim() || "Clip",
          is_active: true,
          sort_order: embeds.length,
        },
      });
      toast("Clip added", "success");
      setClipUrl("");
      setClipTitle("");
      load();
    } catch (e: any) { toast(e.message, "error"); }
  };

  const addYoutube = async () => {
    const url = ytUrl.trim();
    if (!url) { toast("Paste a YouTube URL", "error"); return; }
    if (!/https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.+/.test(url)) {
      toast("Invalid YouTube URL", "error");
      return;
    }
    try {
      await db("twitch_embeds", {
        method: "POST",
        body: {
          embed_type: "youtube",
          clip_url: url,
          title: ytTitle.trim() || "YouTube Video",
          is_active: true,
          sort_order: embeds.length,
        },
      });
      toast("YouTube video added", "success");
      setYtUrl("");
      setYtTitle("");
      load();
    } catch (e: any) { toast(e.message, "error"); }
  };

  const toggleActive = async (id: string, current: boolean) => {
    try {
      await db(`twitch_embeds?id=eq.${id}`, { method: "PATCH", body: { is_active: !current } });
      toast(!current ? "Activated" : "Deactivated", "success");
      load();
    } catch (e: any) { toast(e.message, "error"); }
  };

  const del = async (id: string) => {
    if (!confirm("Delete this embed?")) return;
    try {
      await db(`twitch_embeds?id=eq.${id}`, { method: "DELETE" });
      toast("Deleted", "success");
      load();
    } catch (e: any) { toast(e.message, "error"); }
  };

  return (
    <div>
      {/* Add Channel */}
      <div className="bg-bg2 border border-border rounded-lg overflow-hidden mb-4">
        <div className="px-4 py-3.5 border-b border-border">
          <span className="font-display text-[17px] text-text-bright tracking-widest">ADD CHANNEL</span>
        </div>
        <div className="p-4">
          <div className="flex gap-3 items-end">
            <div className="flex-1 flex flex-col">
              <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">Twitch Channel Name</label>
              <input
                className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none focus:border-accent"
                placeholder="ccsleague"
                value={channelInput}
                onChange={e => setChannelInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addChannel()}
              />
            </div>
            <button
              className="bg-accent text-white border-none rounded-md px-5 py-2.5 text-[13px] font-heading font-medium tracking-wider uppercase cursor-pointer hover:opacity-90"
              onClick={addChannel}
            >
              Add Channel
            </button>
          </div>
        </div>
      </div>

      {/* Add Clip/VOD */}
      <div className="bg-bg2 border border-border rounded-lg overflow-hidden mb-4">
        <div className="px-4 py-3.5 border-b border-border">
          <span className="font-display text-[17px] text-text-bright tracking-widest">ADD CLIP / VOD</span>
        </div>
        <div className="p-4">
          <div className="flex gap-3 mb-3">
            <div className="flex-[2] flex flex-col">
              <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">Clip / VOD URL</label>
              <input
                className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none focus:border-accent"
                placeholder="https://clips.twitch.tv/ExampleClip123"
                value={clipUrl}
                onChange={e => setClipUrl(e.target.value)}
              />
            </div>
            <div className="flex-1 flex flex-col">
              <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">Title</label>
              <input
                className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none focus:border-accent"
                placeholder="Week 3 Highlights"
                value={clipTitle}
                onChange={e => setClipTitle(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addClip()}
              />
            </div>
          </div>
          <button
            className="bg-accent text-white border-none rounded-md px-5 py-2.5 text-[13px] font-heading font-medium tracking-wider uppercase cursor-pointer hover:opacity-90"
            onClick={addClip}
          >
            Add Clip
          </button>
        </div>
      </div>

      {/* Add YouTube VOD */}
      <div className="bg-bg2 border border-border rounded-lg overflow-hidden mb-4">
        <div className="px-4 py-3.5 border-b border-border">
          <span className="font-display text-[17px] text-text-bright tracking-widest">ADD YOUTUBE VIDEO</span>
        </div>
        <div className="p-4">
          <div className="flex gap-3 mb-3">
            <div className="flex-[2] flex flex-col">
              <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">YouTube URL</label>
              <input
                className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none focus:border-accent"
                placeholder="https://www.youtube.com/watch?v=..."
                value={ytUrl}
                onChange={e => setYtUrl(e.target.value)}
              />
            </div>
            <div className="flex-1 flex flex-col">
              <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">Title</label>
              <input
                className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none focus:border-accent"
                placeholder="Week 1 VOD"
                value={ytTitle}
                onChange={e => setYtTitle(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addYoutube()}
              />
            </div>
          </div>
          <button
            className="bg-ccs-red text-white border-none rounded-md px-5 py-2.5 text-[13px] font-heading font-medium tracking-wider uppercase cursor-pointer hover:opacity-90"
            onClick={addYoutube}
          >
            Add YouTube Video
          </button>
        </div>
      </div>

      {/* Embeds List */}
      <div className="bg-bg2 border border-border rounded-lg overflow-hidden mb-4">
        <div className="px-4 py-3.5 border-b border-border">
          <span className="font-display text-[17px] text-text-bright tracking-widest">ALL EMBEDS ({embeds.length})</span>
        </div>
        {embeds.length === 0 ? (
          <div className="py-10 text-center text-text-dim text-[13px]">{loading ? "Loading..." : "No embeds yet."}</div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {["Type", "Channel / URL", "Title", "Active", ""].map((h, i) => (
                  <th key={`${h}-${i}`} className="px-3.5 py-2.5 text-left text-[10px] text-text-muted font-heading font-normal tracking-wider border-b border-border uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {embeds.map((e: any) => (
                <tr key={e.id} className="hover:bg-bg3/30 transition-colors">
                  <td className="px-3.5 py-2.5 border-b border-border align-middle">
                    {e.embed_type === "channel" ? (
                      <span className="bg-ccs-purple/20 text-ccs-purple px-2 py-0.5 rounded text-[10px] font-heading tracking-wider uppercase">Channel</span>
                    ) : e.embed_type === "youtube" ? (
                      <span className="bg-ccs-red/20 text-ccs-red px-2 py-0.5 rounded text-[10px] font-heading tracking-wider uppercase">YouTube</span>
                    ) : (
                      <span className="bg-ccs-blue/20 text-ccs-blue px-2 py-0.5 rounded text-[10px] font-heading tracking-wider uppercase">Clip</span>
                    )}
                  </td>
                  <td className="px-3.5 py-2.5 border-b border-border text-[13px] font-body">
                    {e.embed_type === "channel" ? (
                      <span className="text-text-secondary">{e.channel_name}</span>
                    ) : (
                      <a href={e.clip_url} target="_blank" rel="noopener noreferrer" className="text-ccs-blue hover:underline truncate block max-w-[300px]">{e.clip_url}</a>
                    )}
                  </td>
                  <td className="px-3.5 py-2.5 border-b border-border text-[13px] font-heading text-text-secondary">{e.title || <span className="text-text-subtle">&mdash;</span>}</td>
                  <td className="px-3.5 py-2.5 border-b border-border align-middle">
                    <button
                      className={`w-10 h-5 rounded-full border cursor-pointer transition-colors relative ${e.is_active ? "bg-ccs-green/30 border-ccs-green" : "bg-bg-input border-border2"}`}
                      onClick={() => toggleActive(e.id, e.is_active)}
                      title={e.is_active ? "Active — click to deactivate" : "Inactive — click to activate"}
                    >
                      <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full transition-all ${e.is_active ? "right-0.5 bg-ccs-green" : "left-0.5 bg-text-muted"}`} />
                    </button>
                  </td>
                  <td className="px-3.5 py-2.5 border-b border-border text-right">
                    <button className="bg-transparent text-ccs-red border border-border2 rounded-md px-3 py-1.5 text-[11px] font-heading cursor-pointer uppercase hover:bg-ccs-red/10" onClick={() => del(e.id)}>Delete</button>
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
