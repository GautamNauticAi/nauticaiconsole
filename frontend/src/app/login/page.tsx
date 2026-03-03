"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!email || !password) { setErr("Please fill in all fields."); return; }
    setLoading(true);
    /* TODO: wire to Supabase auth */
    await new Promise((r) => setTimeout(r, 900));
    setLoading(false);
    router.push("/dashboard");
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        position: "relative",
        overflow: "hidden",
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        color: "#fff",
      }}
    >
      {/* Shared background image (same as landing) */}
      <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
        <Image
          src="/background.png"
          alt=""
          fill
          priority
          style={{ objectFit: "cover", objectPosition: "center" }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(135deg, rgba(0,0,0,0.22) 0%, rgba(0,0,0,0.08) 50%, rgba(0,0,0,0.32) 100%)",
          }}
        />
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        input::placeholder { color: rgba(186,230,255,0.35); }
        input:focus { border-color: rgba(124,58,237,0.70) !important; }
        @keyframes fade-up { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
      `}</style>

      <div
        style={{
          position: "relative",
          zIndex: 10,
          width: "100%",
          maxWidth: 400,
          margin: "0 auto",
          padding: "40px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 400,
            background: "rgba(5,5,20,0.70)",
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 20,
            padding: "34px 30px",
            backdropFilter: "blur(18px)",
            WebkitBackdropFilter: "blur(18px)",
            animation: "fade-up 0.5s ease both",
          }}
        >

        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, overflow: "hidden" }}>
            <Image src="/logo.png" alt="NautiCAI" width={36} height={36} style={{ objectFit: "cover" }} />
          </div>
          <span style={{
            fontSize: 16, fontWeight: 800, letterSpacing: "-0.01em",
            background: "linear-gradient(135deg, #fff 0%, #c4b5fd 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>NautiCAI</span>
        </div>

        <h1 style={{ fontSize: "1.4rem", fontWeight: 800, letterSpacing: "-0.03em", marginBottom: 6 }}>Sign in</h1>
        <p style={{ fontSize: 13, color: "rgba(186,230,255,0.55)", marginBottom: 28 }}>
          Access the hull inspection platform
        </p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(186,230,255,0.50)", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>
              Email
            </label>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@nauticai.com"
              style={{
                width: "100%", fontSize: 13, fontFamily: "inherit",
                background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 10, padding: "10px 14px", color: "#fff",
                outline: "none", transition: "border-color 0.2s",
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(186,230,255,0.50)", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>
              Password
            </label>
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{
                width: "100%", fontSize: 13, fontFamily: "inherit",
                background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 10, padding: "10px 14px", color: "#fff",
                outline: "none", transition: "border-color 0.2s",
              }}
            />
          </div>

          {err && (
            <p style={{ fontSize: 12, color: "#ef4444", background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.30)", borderRadius: 8, padding: "8px 12px" }}>
              {err}
            </p>
          )}

          <button type="submit" disabled={loading} style={{
            fontSize: 14, fontWeight: 700, color: "#fff",
            background: "linear-gradient(135deg, #7c3aed, #3b82f6)",
            border: "none", borderRadius: 10, padding: "12px",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1,
            boxShadow: "0 4px 22px rgba(124,58,237,0.42)",
            transition: "opacity 0.2s",
          }}>
            {loading ? "Signing in…" : "Sign in →"}
          </button>
        </form>

        <div style={{ marginTop: 24, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 18, textAlign: "center" }}>
          <p style={{ fontSize: 12, color: "rgba(186,230,255,0.45)" }}>
            Don&apos;t have an account?{" "}
            <a href="mailto:contact@nauticai.com" style={{ color: "#a78bfa", textDecoration: "none", fontWeight: 600 }}>
              Contact us
            </a>
          </p>
        </div>

          <div style={{ marginTop: 20, textAlign: "center" }}>
            <Link href="/" style={{ fontSize: 11, color: "rgba(186,230,255,0.35)", textDecoration: "none" }}>
              ← Back to homepage
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
