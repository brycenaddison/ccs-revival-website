const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

interface Session {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email: string;
    app_metadata: { role?: string; provider?: string; providers?: string[] };
    [key: string]: unknown;
  };
}

interface DbOptions {
  method?: string;
  body?: Record<string, unknown>;
  query?: string;
  headers?: Record<string, string>;
}

export const Auth = {
  _session: null as Session | null,

  async signIn(email: string, password: string): Promise<Session> {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error_description || err.msg || "Login failed");
    }
    const data: Session = await res.json();
    Auth._session = data;
    sessionStorage.setItem("sb_session", JSON.stringify(data));
    return data;
  },

  signOut() {
    Auth._session = null;
    sessionStorage.removeItem("sb_session");
  },

  getSession(): Session | null {
    if (Auth._session) return Auth._session;
    const stored = sessionStorage.getItem("sb_session");
    if (stored) { Auth._session = JSON.parse(stored); return Auth._session; }
    return null;
  },

  getToken(): string | null {
    return Auth.getSession()?.access_token || null;
  },

  getUser() {
    return Auth.getSession()?.user || null;
  },

  isAdmin(): boolean {
    const user = Auth.getUser();
    return user?.app_metadata?.role === "admin";
  },

  async refresh(): Promise<Session | null> {
    const session = Auth.getSession();
    if (!session?.refresh_token) return null;
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    if (!res.ok) { Auth.signOut(); return null; }
    const data: Session = await res.json();
    Auth._session = data;
    sessionStorage.setItem("sb_session", JSON.stringify(data));
    return data;
  },
};

export async function db(table: string, options: DbOptions = {}) {
  const { method = "GET", body, query = "", headers = {} } = options;
  const token = Auth.getToken() || SUPABASE_ANON_KEY;
  const url = `${SUPABASE_URL}/rest/v1/${table}${query}`;
  const res = await fetch(url, {
    method,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: method === "POST" || method === "PATCH" ? "return=representation" : "",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    const refreshed = await Auth.refresh();
    if (refreshed) return db(table, options);
    throw new Error("Session expired. Please sign in again.");
  }
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`${res.status}: ${err}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export async function uploadFile(bucket: string, path: string, file: File): Promise<string> {
  const token = Auth.getToken() || SUPABASE_ANON_KEY;
  const url = `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": file.type,
      "x-upsert": "true",
    },
    body: file,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Upload failed: ${err}`);
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}
