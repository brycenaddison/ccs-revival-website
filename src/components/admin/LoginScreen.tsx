import { useState, useEffect, useRef } from "react";
import { Auth } from "../../lib/supabase";

interface Props {
  onLogin: () => void;
  toast: (msg: string, type?: "success" | "error") => void;
}

export function LoginScreen({ onLogin, toast }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  useEffect(() => { emailRef.current?.focus(); }, []);

  const submit = async () => {
    if (!email || !password) { toast("Email and password required", "error"); return; }
    setLoading(true);
    try {
      await Auth.signIn(email, password);
      if (!Auth.isAdmin()) { Auth.signOut(); toast("Access denied — admin role required", "error"); setLoading(false); return; }
      onLogin();
    } catch (e: any) { toast(e.message, "error"); }
    setLoading(false);
  };

  return (
    <div className="bg-bg min-h-screen text-text font-body flex items-center justify-center">
      <div className="w-[380px]">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[70%] w-[200px] h-[200px] rounded-full pointer-events-none bg-[radial-gradient(circle,rgba(210,7,8,0.15)_0%,transparent_70%)]" />
        <div className="text-center mb-8 relative">
          <span className="text-4xl">⚔️</span>
          <div className="font-display text-[32px] text-white tracking-widest mt-2">
            CCS
          </div>
          <div className="font-heading text-xs text-text-dim tracking-widest mt-1 uppercase">Admin Dashboard</div>
        </div>
        <div className="bg-bg2 border border-border rounded-lg overflow-hidden relative">
          <div className="p-6">
            <div className="mb-4">
              <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1 block">Email</label>
              <input
                ref={emailRef}
                className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none transition-[border-color] duration-150 focus:border-accent"
                type="email"
                placeholder="admin@yourleague.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === "Enter" && submit()}
              />
            </div>
            <div className="mb-5">
              <label className="text-[11px] text-text-secondary font-heading tracking-wider uppercase mb-1 block">Password</label>
              <input
                className="w-full bg-bg-input border border-border2 rounded-md text-text py-2.5 px-3.5 text-[13px] font-body outline-none transition-[border-color] duration-150 focus:border-accent"
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && submit()}
              />
            </div>
            <button
              className={`w-full bg-accent text-white border-none rounded-md py-3 text-sm font-heading font-medium tracking-wider uppercase cursor-pointer transition-opacity duration-150 ${loading ? "opacity-60" : "opacity-100 hover:opacity-90"}`}
              onClick={submit}
              disabled={loading}
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
