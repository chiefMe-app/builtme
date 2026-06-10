"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === "login") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
      } else {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });
        if (signUpError) throw signUpError;
      }

      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }

    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#F7F4EF", color: "#1A1A1A", fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Playfair+Display:ital,wght@0,400;0,600;1,400;1,600&family=DM+Mono:wght@300;400&display=swap');

        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #C4A882; border-radius: 2px; }

        .serif { font-family: 'Playfair Display', serif; }
        .mono { font-family: 'DM Mono', monospace; }

        .btn-primary {
          background: #1A1A1A;
          color: #F7F4EF;
          border: none;
          padding: 14px 36px;
          font-family: 'DM Sans', sans-serif;
          font-size: 14px;
          font-weight: 500;
          letter-spacing: 0.04em;
          cursor: pointer;
          transition: all 0.2s;
          border-radius: 2px;
          width: 100%;
        }
        .btn-primary:hover { background: #333; transform: translateY(-1px); }
        .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }

        .input-field {
          background: #FFF;
          border: 1.5px solid #EAE4D9;
          color: #1A1A1A;
          padding: 12px 16px;
          width: 100%;
          font-family: 'DM Sans', sans-serif;
          font-size: 14px;
          outline: none;
          transition: border 0.2s;
          border-radius: 4px;
        }
        .input-field:focus { border-color: #C4A882; }
        .input-field::placeholder { color: #AAA; }

        .auth-toggle {
          background: transparent;
          border: none;
          color: #C4A882;
          font-family: 'DM Sans', sans-serif;
          font-size: 13px;
          cursor: pointer;
          text-decoration: underline;
        }
      `}</style>

      <div className="card" style={{ background: "#FFF", border: "1px solid #EAE4D9", borderRadius: 4, padding: 40, width: "100%", maxWidth: 400 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div>
            <span className="serif" style={{ fontSize: 28, fontWeight: 600 }}>Built</span>
            <span className="serif" style={{ fontSize: 28, fontWeight: 400, fontStyle: "italic", color: "#C4A882" }}>Me</span>
          </div>
          <div className="mono" style={{ fontSize: 10, color: "#AAA", letterSpacing: "0.2em", marginTop: 6 }}>DUBAI</div>
        </div>

        <h1 className="serif" style={{ fontSize: 22, fontWeight: 400, marginBottom: 24, textAlign: "center" }}>
          {mode === "login" ? "Welcome back" : "Create your account"}
        </h1>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label className="mono" style={{ fontSize: 10, color: "#AAA", letterSpacing: "0.1em", display: "block", marginBottom: 6 }}>EMAIL</label>
            <input
              className="input-field"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label className="mono" style={{ fontSize: 10, color: "#AAA", letterSpacing: "0.1em", display: "block", marginBottom: 6 }}>PASSWORD</label>
            <input
              className="input-field"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div style={{ marginBottom: 16, fontSize: 13, color: "#B45757", background: "#FBEEEE", border: "1px solid #F0D6D6", borderRadius: 4, padding: "10px 14px" }}>
              {error}
            </div>
          )}

          <button className="btn-primary" type="submit" disabled={loading} style={{ marginBottom: 16 }}>
            {loading ? "Please wait..." : mode === "login" ? "Sign in" : "Sign up"}
          </button>
        </form>

        <div style={{ textAlign: "center" }}>
          {mode === "login" ? (
            <span style={{ fontSize: 13, color: "#666" }}>
              Don&apos;t have an account?{" "}
              <button className="auth-toggle" onClick={() => { setMode("signup"); setError(null); }}>
                Sign up
              </button>
            </span>
          ) : (
            <span style={{ fontSize: 13, color: "#666" }}>
              Already have an account?{" "}
              <button className="auth-toggle" onClick={() => { setMode("login"); setError(null); }}>
                Sign in
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
