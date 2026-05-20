export function teamInitial(name?: string): string {
  return (name || "?").charAt(0).toUpperCase();
}

export function timeAgo(d?: string): string {
  if (!d) return "";
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function fmtTime(d?: string): string {
  if (!d) return "";
  const dt = new Date(d);
  const t = dt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const diff = Math.floor((dt.getTime() - Date.now()) / 86400000);
  if (diff === 0) return `Today · ${t}`;
  if (diff === 1) return `Tomorrow · ${t}`;
  return dt.toLocaleDateString([], { month: "short", day: "numeric" }) + ` · ${t}`;
}
