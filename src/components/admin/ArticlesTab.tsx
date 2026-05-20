import { useState, useEffect, useCallback, useRef } from "react";
import { db, uploadFile } from "../../lib/supabase";

interface Props {
  toast: (msg: string, type?: "success" | "error") => void;
}

const emptyForm = {
  title: "",
  subtitle: "",
  body: "",
  tag: "",
  article_type: "news" as "hero" | "feature" | "news",
  author: "",
  image_url: "",
  match_id: "",
  is_published: false,
};

export function ArticlesTab({ toast }: Props) {
  const [articles, setArticles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ ...emptyForm });
  const [editing, setEditing] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const imageFileRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast("Please select an image file", "error"); return; }
    const allowedExts = ["jpg", "jpeg", "png", "gif", "webp", "svg"];
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (!allowedExts.includes(ext)) { toast("Allowed: JPG, PNG, GIF, WEBP, SVG", "error"); return; }
    if (file.size > 5 * 1024 * 1024) { toast("Image must be under 5MB", "error"); return; }
    setUploading(true);
    try {
      const path = `${Date.now()}_${(form.title || "article").toLowerCase().replace(/\s+/g, "-").slice(0, 30)}.${ext}`;
      const publicUrl = await uploadFile("articles_images", path, file);
      setForm(f => ({ ...f, image_url: publicUrl }));
      toast("Image uploaded", "success");
    } catch (err: any) { toast(err.message, "error"); }
    setUploading(false);
    e.target.value = "";
  };

  const load = useCallback(async () => {
    setLoading(true);
    try { setArticles(await db("articles", { query: "?select=*&order=created_at.desc" }) || []); }
    catch (e: any) { toast(e.message, "error"); }
    setLoading(false);
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.title) { toast("Title is required", "error"); return; }
    const body: any = { ...form };
    if (!body.subtitle) body.subtitle = null;
    if (!body.body) body.body = null;
    if (!body.tag) body.tag = null;
    if (!body.author) body.author = null;
    if (!body.image_url) body.image_url = null;
    if (!body.match_id) body.match_id = null;
    if (body.is_published && !editing) {
      body.published_at = new Date().toISOString();
    }
    try {
      if (editing) {
        await db(`articles?id=eq.${editing}`, { method: "PATCH", body });
        toast("Article updated", "success");
      } else {
        await db("articles", { method: "POST", body });
        toast("Article created", "success");
      }
      setForm({ ...emptyForm });
      setEditing(null);
      load();
    } catch (e: any) { toast(e.message, "error"); }
  };

  const del = async (id: string) => {
    if (!confirm("Delete this article?")) return;
    try { await db(`articles?id=eq.${id}`, { method: "DELETE" }); toast("Deleted", "success"); load(); }
    catch (e: any) { toast(e.message, "error"); }
  };

  const edit = (a: any) => {
    setEditing(a.id);
    setForm({
      title: a.title || "",
      subtitle: a.subtitle || "",
      body: a.body || "",
      tag: a.tag || "",
      article_type: a.article_type || "news",
      author: a.author || "",
      image_url: a.image_url || "",
      match_id: a.match_id || "",
      is_published: a.is_published || false,
    });
  };

  const resetForm = () => {
    setEditing(null);
    setForm({ ...emptyForm });
  };

  const togglePublish = async (a: any) => {
    const newPublished = !a.is_published;
    const body: any = { is_published: newPublished };
    if (newPublished) {
      body.published_at = new Date().toISOString();
    } else {
      body.published_at = null;
    }
    try {
      await db(`articles?id=eq.${a.id}`, { method: "PATCH", body });
      toast(newPublished ? "Article published" : "Article unpublished", "success");
      load();
    } catch (e: any) { toast(e.message, "error"); }
  };

  const typeBadgeColor = (type: string) => {
    switch (type) {
      case "hero": return "bg-purple-500/20 text-purple-300 border-purple-500/30";
      case "feature": return "bg-blue-500/20 text-blue-300 border-blue-500/30";
      default: return "bg-gray-500/20 text-gray-300 border-gray-500/30";
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <div>
      {/* Add/Edit Form */}
      <div className="bg-bg2 border border-border rounded-lg overflow-hidden mb-4">
        <div className="px-4 py-3.5 border-b border-border flex justify-between items-center">
          <span className="font-display text-[17px] text-text-bright tracking-widest">{editing ? "EDIT ARTICLE" : "ADD NEW ARTICLE"}</span>
          {editing && <button className="bg-bg-input text-text border border-border2 rounded-md px-5 py-2.5 text-[13px] font-heading tracking-wider uppercase cursor-pointer hover:text-white" onClick={resetForm}>Cancel</button>}
        </div>
        <div className="p-4">
          {/* Title + Tag */}
          <div className="flex gap-3 mb-3">
            <div className="flex-[2] flex flex-col">
              <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">Title</label>
              <input className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none focus:border-accent" placeholder="Article title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="flex-1 flex flex-col">
              <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">Tag</label>
              <input className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none focus:border-accent" placeholder="ROSTER MOVES" value={form.tag} onChange={e => setForm({ ...form, tag: e.target.value })} />
            </div>
          </div>

          {/* Subtitle */}
          <div className="flex gap-3 mb-3">
            <div className="flex-1 flex flex-col">
              <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">Subtitle</label>
              <input className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none focus:border-accent" placeholder="Optional subtitle" value={form.subtitle} onChange={e => setForm({ ...form, subtitle: e.target.value })} />
            </div>
          </div>

          {/* Body */}
          <div className="flex gap-3 mb-3">
            <div className="flex-1 flex flex-col">
              <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">Body</label>
              <textarea className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none focus:border-accent resize-y min-h-[120px]" placeholder="Article content..." rows={6} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} />
            </div>
          </div>

          {/* Type + Author + Match ID */}
          <div className="flex gap-3 mb-3">
            <div className="flex-1 flex flex-col">
              <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">Article Type</label>
              <select className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none cursor-pointer focus:border-accent" value={form.article_type} onChange={e => setForm({ ...form, article_type: e.target.value as any })}>
                <option value="news">News</option>
                <option value="feature">Feature</option>
                <option value="hero">Hero</option>
              </select>
            </div>
            <div className="flex-1 flex flex-col">
              <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">Author</label>
              <input className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none focus:border-accent" placeholder="Author name" value={form.author} onChange={e => setForm({ ...form, author: e.target.value })} />
            </div>
            <div className="flex-1 flex flex-col">
              <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">Match ID</label>
              <input className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none focus:border-accent" placeholder="Optional match UUID" value={form.match_id} onChange={e => setForm({ ...form, match_id: e.target.value })} />
            </div>
          </div>

          {/* Image Upload */}
          <div className="flex gap-3 mb-3">
            <div className="flex-1 flex flex-col">
              <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1">Article Image</label>
              <div className="flex gap-2 items-center">
                <input ref={imageFileRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                <button
                  className={`bg-bg-input text-text border border-border2 rounded-md px-5 py-2.5 text-[13px] font-heading tracking-wider uppercase cursor-pointer ${uploading ? "opacity-60" : "hover:text-white"}`}
                  onClick={() => imageFileRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? "Uploading..." : "Upload Image"}
                </button>
                <span className="text-[11px] text-text-dim">or</span>
                <input className="flex-1 bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none focus:border-accent" placeholder="Paste image URL..." value={form.image_url} onChange={e => setForm({ ...form, image_url: e.target.value })} />
                {form.image_url && <button className="bg-transparent text-ccs-red border border-border2 rounded-md px-2.5 py-1.5 text-[10px] font-heading cursor-pointer uppercase hover:bg-ccs-red/10" onClick={() => setForm({ ...form, image_url: "" })}>Clear</button>}
              </div>
            </div>
          </div>

          {/* Published toggle + preview + submit */}
          <div className="flex gap-3 items-center mt-1">
            {form.image_url && (
              <img src={form.image_url} alt="Preview" className="w-16 h-12 rounded-lg object-cover bg-bg-input border border-border2" onError={(e: any) => { e.target.style.display = "none"; }} />
            )}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={form.is_published} onChange={e => setForm({ ...form, is_published: e.target.checked })} className="w-4 h-4 accent-accent cursor-pointer" />
              <span className="text-[12px] text-text-secondary font-heading tracking-wider uppercase">Published</span>
            </label>
            <button className="bg-accent text-white border-none rounded-md px-5 py-2.5 text-[13px] font-heading font-medium tracking-wider uppercase cursor-pointer hover:opacity-90" onClick={save}>
              {editing ? "Update Article" : "Add Article"}
            </button>
          </div>
        </div>
      </div>

      {/* Articles List */}
      <div className="bg-bg2 border border-border rounded-lg overflow-hidden mb-4">
        <div className="px-4 py-3.5 border-b border-border">
          <span className="font-display text-[17px] text-text-bright tracking-widest">ALL ARTICLES ({articles.length})</span>
        </div>
        {articles.length === 0 ? (
          <div className="py-10 text-center text-text-dim text-[13px]">{loading ? "Loading..." : "No articles yet."}</div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {["Title", "Type", "Author", "Published", "Date", ""].map((h, i) => (
                  <th key={`${h}-${i}`} className="px-3.5 py-2.5 text-left text-[10px] text-text-muted font-heading font-normal tracking-wider border-b border-border uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {articles.map((a: any) => (
                <tr key={a.id} className="hover:bg-bg3/30 transition-colors">
                  <td className="px-3.5 py-2.5 border-b border-border align-middle max-w-[300px]">
                    <div className="font-heading font-medium text-[13px] text-text-bright truncate">{a.title}</div>
                    {a.tag && <span className="text-[10px] text-accent font-heading tracking-wider uppercase">{a.tag}</span>}
                  </td>
                  <td className="px-3.5 py-2.5 border-b border-border align-middle">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-heading tracking-wider uppercase border ${typeBadgeColor(a.article_type)}`}>
                      {a.article_type || "news"}
                    </span>
                  </td>
                  <td className="px-3.5 py-2.5 border-b border-border text-[13px] text-text-secondary">{a.author || <span className="text-text-subtle">—</span>}</td>
                  <td className="px-3.5 py-2.5 border-b border-border align-middle">
                    <button
                      className={`px-3 py-1.5 rounded-md text-[11px] font-heading tracking-wider uppercase cursor-pointer border transition-colors ${
                        a.is_published
                          ? "bg-green-500/15 text-green-400 border-green-500/30 hover:bg-green-500/25"
                          : "bg-bg-input text-text-muted border-border2 hover:text-white"
                      }`}
                      onClick={() => togglePublish(a)}
                    >
                      {a.is_published ? "Live" : "Draft"}
                    </button>
                  </td>
                  <td className="px-3.5 py-2.5 border-b border-border text-[12px] text-text-secondary font-mono">
                    {formatDate(a.published_at || a.created_at)}
                  </td>
                  <td className="px-3.5 py-2.5 border-b border-border text-right">
                    <button className="bg-bg-input text-text border border-border2 rounded-md px-3 py-1.5 text-[11px] font-heading tracking-wider uppercase cursor-pointer mr-1.5 hover:text-white" onClick={() => edit(a)}>Edit</button>
                    <button className="bg-transparent text-ccs-red border border-border2 rounded-md px-3 py-1.5 text-[11px] font-heading cursor-pointer uppercase hover:bg-ccs-red/10" onClick={() => del(a.id)}>Delete</button>
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
