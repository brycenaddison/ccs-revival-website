import { useState, useEffect, useCallback } from "react";
import { db } from "../../lib/supabase";

interface Props {
  toast: (msg: string, type?: "success" | "error") => void;
}

export function TwitterTab({ toast }: Props) {
  const [feeds, setFeeds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [handleInput, setHandleInput] = useState("");
  const [tweetUrl, setTweetUrl] = useState("");
  const [tweetTitle, setTweetTitle] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setFeeds(await db("twitter_feeds", { query: "?select=*&order=sort_order,created_at.desc" }) || []);
    } catch (e: any) { toast(e.message, "error"); }
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const addTimeline = async () => {
    const handle = handleInput.trim().replace(/^@/, "");
    if (!handle) { toast("Enter an X handle", "error"); return; }
    try {
      await db("twitter_feeds", {
        method: "POST",
        body: {
          feed_type: "timeline",
          handle,
          title: `@${handle}`,
          is_active: true,
          sort_order: feeds.length,
        },
      });
      toast("Timeline added", "success");
      setHandleInput("");
      load();
    } catch (e: any) { toast(e.message, "error"); }
  };

  const addTweet = async () => {
    const url = tweetUrl.trim();
    if (!url) { toast("Paste a tweet URL", "error"); return; }
    if (!/https?:\/\/(x|twitter)\.com\/.+\/status\/\d+/.test(url)) {
      toast("Invalid tweet URL", "error");
      return;
    }
    try {
      await db("twitter_feeds", {
        method: "POST",
        body: {
          feed_type: "tweet",
          tweet_url: url,
          title: tweetTitle.trim() || "Pinned Tweet",
          is_active: true,
          sort_order: feeds.length,
        },
      });
      toast("Pinned tweet added", "success");
      setTweetUrl("");
      setTweetTitle("");
      load();
    } catch (e: any) { toast(e.message, "error"); }
  };

  const toggleActive = async (id: string, current: boolean) => {
    try {
      await db(`twitter_feeds?id=eq.${id}`, { method: "PATCH", body: { is_active: !current } });
      toast(!current ? "Activated" : "Deactivated", "success");
      load();
    } catch (e: any) { toast(e.message, "error"); }
  };

  const del = async (id: string) => {
    if (!confirm("Delete this feed?")) return;
    try {
      await db(`twitter_feeds?id=eq.${id}`, { method: "DELETE" });
      toast("Deleted", "success");
      load();
    } catch (e: any) { toast(e.message, "error"); }
  };

  return (
    <div>
      {/* Add Timeline */}
      <div className="bg-bg2 border border-border rounded-lg overflow-hidden mb-4">
        <div className="px-4 py-3.5 border-b border-border">
          <span className="font-display text-[17px] text-text-bright tracking-widest">ADD TIMELINE</span>
        </div>
        <div className="p-4">
          <div className="flex gap-3 items-end">
            <div className="flex-1 flex flex-col">
              <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">X Handle</label>
              <div className="flex items-center gap-0">
                <span className="bg-bg-input border border-border2 border-r-0 rounded-l-md text-text-muted py-2.5 px-3 text-[13px] font-body select-none">@</span>
                <input
                  className="w-full bg-bg-input border border-border2 rounded-r-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none focus:border-accent"
                  placeholder="CCSLeague"
                  value={handleInput}
                  onChange={e => setHandleInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addTimeline()}
                />
              </div>
            </div>
            <button
              className="bg-accent text-white border-none rounded-md px-5 py-2.5 text-[13px] font-heading font-medium tracking-wider uppercase cursor-pointer hover:opacity-90"
              onClick={addTimeline}
            >
              Add Timeline
            </button>
          </div>
        </div>
      </div>

      {/* Add Pinned Tweet */}
      <div className="bg-bg2 border border-border rounded-lg overflow-hidden mb-4">
        <div className="px-4 py-3.5 border-b border-border">
          <span className="font-display text-[17px] text-text-bright tracking-widest">ADD PINNED TWEET</span>
        </div>
        <div className="p-4">
          <div className="flex gap-3 mb-3">
            <div className="flex-[2] flex flex-col">
              <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">Tweet URL</label>
              <input
                className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none focus:border-accent"
                placeholder="https://x.com/CCSLeague/status/123456789"
                value={tweetUrl}
                onChange={e => setTweetUrl(e.target.value)}
              />
            </div>
            <div className="flex-1 flex flex-col">
              <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">Title (optional)</label>
              <input
                className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none focus:border-accent"
                placeholder="Pinned Tweet"
                value={tweetTitle}
                onChange={e => setTweetTitle(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addTweet()}
              />
            </div>
          </div>
          <button
            className="bg-accent text-white border-none rounded-md px-5 py-2.5 text-[13px] font-heading font-medium tracking-wider uppercase cursor-pointer hover:opacity-90"
            onClick={addTweet}
          >
            Add Tweet
          </button>
        </div>
      </div>

      {/* Feeds List */}
      <div className="bg-bg2 border border-border rounded-lg overflow-hidden mb-4">
        <div className="px-4 py-3.5 border-b border-border">
          <span className="font-display text-[17px] text-text-bright tracking-widest">ALL FEEDS ({feeds.length})</span>
        </div>
        {feeds.length === 0 ? (
          <div className="py-10 text-center text-text-dim text-[13px]">{loading ? "Loading..." : "No feeds yet."}</div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {["Type", "Handle / URL", "Title", "Active", ""].map((h, i) => (
                  <th key={`${h}-${i}`} className="px-3.5 py-2.5 text-left text-[10px] text-text-muted font-heading font-normal tracking-wider border-b border-border uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {feeds.map((f: any) => (
                <tr key={f.id} className="hover:bg-bg3/30 transition-colors">
                  <td className="px-3.5 py-2.5 border-b border-border align-middle">
                    {f.feed_type === "timeline" ? (
                      <span className="bg-ccs-blue/20 text-ccs-blue px-2 py-0.5 rounded text-[10px] font-heading tracking-wider uppercase">Timeline</span>
                    ) : (
                      <span className="bg-ccs-purple/20 text-ccs-purple px-2 py-0.5 rounded text-[10px] font-heading tracking-wider uppercase">Tweet</span>
                    )}
                  </td>
                  <td className="px-3.5 py-2.5 border-b border-border text-[13px] font-body">
                    {f.feed_type === "timeline" ? (
                      <span className="text-text-secondary">@{f.handle}</span>
                    ) : (
                      <a href={f.tweet_url} target="_blank" rel="noopener noreferrer" className="text-ccs-blue hover:underline truncate block max-w-[300px]">{f.tweet_url}</a>
                    )}
                  </td>
                  <td className="px-3.5 py-2.5 border-b border-border text-[13px] font-heading text-text-secondary">{f.title || <span className="text-text-subtle">&mdash;</span>}</td>
                  <td className="px-3.5 py-2.5 border-b border-border align-middle">
                    <button
                      className={`w-10 h-5 rounded-full border cursor-pointer transition-colors relative ${f.is_active ? "bg-ccs-green/30 border-ccs-green" : "bg-bg-input border-border2"}`}
                      onClick={() => toggleActive(f.id, f.is_active)}
                      title={f.is_active ? "Active — click to deactivate" : "Inactive — click to activate"}
                    >
                      <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full transition-all ${f.is_active ? "right-0.5 bg-ccs-green" : "left-0.5 bg-text-muted"}`} />
                    </button>
                  </td>
                  <td className="px-3.5 py-2.5 border-b border-border text-right">
                    <button className="bg-transparent text-ccs-red border border-border2 rounded-md px-3 py-1.5 text-[11px] font-heading cursor-pointer uppercase hover:bg-ccs-red/10" onClick={() => del(f.id)}>Delete</button>
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
