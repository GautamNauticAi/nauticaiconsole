"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { authLogin, authSignup } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!email || !password) { setErr("Please fill in all fields."); return; }
    setLoading(true);
    try {
      const fn = mode === "login" ? authLogin : authSignup;
      const res = await fn(email, password);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("nauticai:token", res.token);
        window.localStorage.setItem("nauticai:userEmail", res.user.email);
      }
      router.push("/dashboard");
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
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
      <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
        <Image
          src="/bg3.avif"
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
              "radial-gradient(circle at top left, rgba(56,189,248,0.42), transparent 60%), radial-gradient(circle at bottom right, rgba(129,140,248,0.55), transparent 62%), linear-gradient(135deg, rgba(3,7,18,0.70) 0%, rgba(15,23,42,0.40) 45%, rgba(15,23,42,0.85) 100%)",
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
          maxWidth: 1120,
          margin: "0 auto",
          padding: "40px 32px",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 56,
        }}
      >
        {/* Left panel – product story / usage */}
        <div style={{ flex: 1.1, maxWidth: 560 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 10px",
              borderRadius: 999,
              border: "1px solid rgba(148,163,184,0.45)",
              background: "rgba(15,23,42,0.7)",
              marginBottom: 14,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "999px",
                background:
                  "radial-gradient(circle at 30% 30%, #22d3ee, #4f46e5)",
              }}
            />
            <span
              style={{
                fontSize: 11,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "rgba(191,219,254,0.9)",
                fontWeight: 600,
              }}
            >
              Hull inspection workspace
            </span>
          </div>

          <h1
            style={{
              fontSize: 32,
              lineHeight: 1.1,
              fontWeight: 800,
              letterSpacing: "-0.04em",
              marginBottom: 12,
            }}
          >
            Turn{" "}
            <span
              style={{
                background:
                  "linear-gradient(135deg,#e5e7eb 0%,#c4b5fd 40%,#38bdf8 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              hull footage
            </span>{" "}
            into clear reports.
          </h1>

          <p
            style={{
              fontSize: 13,
              color: "rgba(186,230,255,0.75)",
              maxWidth: 480,
              marginBottom: 20,
            }}
          >
            NautiCAI analyses underwater video and images to flag corrosion,
            marine growth and structural risk—so surveyors and operators
            agree on the same source of truth.
          </p>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              marginBottom: 18,
            }}
          >
            {[
              { label: "99% hull coverage", sub: "AI-reviewed frames" },
              { label: "< 10 min / run", sub: "from upload to report" },
              { label: "Fleet-ready", sub: "multi-vessel history" },
            ].map((chip) => (
              <div
                key={chip.label}
                style={{
                  padding: "8px 12px",
                  borderRadius: 14,
                  border: "1px solid rgba(148,163,184,0.55)",
                  background: "rgba(15,23,42,0.80)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#e5e7eb",
                  }}
                >
                  {chip.label}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    color: "rgba(148,163,184,0.9)",
                  }}
                >
                  {chip.sub}
                </span>
              </div>
            ))}
          </div>

          <ul
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              listStyle: "none",
              padding: 0,
              margin: 0,
            }}
          >
            {[
              "Bring diver, ROV and dock inspections into one place.",
              "Share interactive hull views instead of email threads and screenshots.",
              "Export audit-ready PDFs with anomalies, clips and comments.",
            ].map((line) => (
              <li
                key={line}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    marginTop: 3,
                    width: 14,
                    height: 14,
                    borderRadius: "999px",
                    background: "rgba(34,197,94,0.18)",
                    border: "1px solid rgba(34,197,94,0.55)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <svg
                    width="9"
                    height="9"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="#4ade80"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="3.5 8.5 6.5 11.5 12.5 4.5" />
                  </svg>
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: "rgba(191,219,254,0.9)",
                  }}
                >
                  {line}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Right panel – auth card pinned to the right */}
        <div
          style={{
            position: "relative",
            flexShrink: 0,
            width: 380,
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          {/* subtle glow behind the auth card */}
          <div
            style={{
              position: "absolute",
              right: -60,
              top: "50%",
              transform: "translateY(-50%)",
              width: 420,
              height: 420,
              borderRadius: "999px",
              background:
                "radial-gradient(circle at center, rgba(129,140,248,0.75), transparent 60%)",
              opacity: 0.9,
              filter: "blur(18px)",
              pointerEvents: "none",
            }}
          />

          <div
            style={{
              width: "100%",
              maxWidth: 380,
              background:
                "linear-gradient(145deg, rgba(15,23,42,0.96), rgba(15,23,42,0.92))",
              border: "1px solid rgba(148,163,184,0.45)",
              borderRadius: 20,
              padding: "32px 28px",
              backdropFilter: "blur(18px)",
              WebkitBackdropFilter: "blur(18px)",
              animation: "fade-up 0.5s ease both",
            }}
          >
            {/* Logo */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 28,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  overflow: "hidden",
                }}
              >
                <Image
                  src="/logo.png"
                  alt="NautiCAI"
                  width={36}
                  height={36}
                  style={{ objectFit: "cover" }}
                />
              </div>
              <span
                style={{
                  fontSize: 16,
                  fontWeight: 800,
                  letterSpacing: "-0.01em",
                  background:
                    "linear-gradient(135deg, #fff 0%, #c4b5fd 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                NautiCAI
              </span>
            </div>

            <h1
              style={{
                fontSize: "1.4rem",
                fontWeight: 800,
                letterSpacing: "-0.03em",
                marginBottom: 6,
              }}
            >
              {mode === "login" ? "Sign in" : "Create account"}
            </h1>
            <p
              style={{
                fontSize: 13,
                color: "rgba(186,230,255,0.55)",
                marginBottom: 24,
              }}
            >
              {mode === "login"
                ? "Access the hull inspection platform"
                : "Create a manual account to access the platform"}
            </p>

            <form
              onSubmit={handleSubmit}
              style={{ display: "flex", flexDirection: "column", gap: 14 }}
            >
              <div>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "rgba(186,230,255,0.50)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@nauticai.com"
                  style={{
                    width: "100%",
                    fontSize: 13,
                    fontFamily: "inherit",
                    background: "rgba(255,255,255,0.07)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 10,
                    padding: "10px 14px",
                    color: "#fff",
                    outline: "none",
                    transition: "border-color 0.2s",
                  }}
                />
              </div>
              <div>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "rgba(186,230,255,0.50)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{
                    width: "100%",
                    fontSize: 13,
                    fontFamily: "inherit",
                    background: "rgba(255,255,255,0.07)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 10,
                    padding: "10px 14px",
                    color: "#fff",
                    outline: "none",
                    transition: "border-color 0.2s",
                  }}
                />
              </div>

              {err && (
                <p
                  style={{
                    fontSize: 12,
                    color: "#ef4444",
                    background: "rgba(239,68,68,0.10)",
                    border: "1px solid rgba(239,68,68,0.30)",
                    borderRadius: 8,
                    padding: "8px 12px",
                  }}
                >
                  {err}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                onMouseEnter={(e) => {
                  if (loading) return;
                  e.currentTarget.style.background = "rgba(15,23,42,0.98)";
                  e.currentTarget.style.color = "#f9fafb";
                }}
                onMouseLeave={(e) => {
                  if (loading) return;
                  e.currentTarget.style.background = "#f9fafb";
                  e.currentTarget.style.color = "#020617";
                }}
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: loading ? "rgba(15,23,42,0.6)" : "#020617",
                  background: loading
                    ? "rgba(248,250,252,0.8)"
                    : "#f9fafb",
                  borderRadius: 999,
                  padding: "11px 18px",
                  border: "1px solid rgba(148,163,184,0.45)",
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.8 : 1,
                  boxShadow: loading
                    ? "none"
                    : "0 4px 22px rgba(15,23,42,0.75)",
                  transition: "all 0.18s ease",
                  marginTop: 4,
                }}
              >
                {loading
                  ? mode === "login"
                    ? "Signing in…"
                    : "Creating account…"
                  : mode === "login"
                  ? "Sign in →"
                  : "Sign up →"}
              </button>
            </form>

            <div
              style={{
                marginTop: 22,
                borderTop: "1px solid rgba(255,255,255,0.08)",
                paddingTop: 16,
                textAlign: "center",
              }}
            >
              {mode === "login" ? (
                <p
                  style={{
                    fontSize: 12,
                    color: "rgba(186,230,255,0.45)",
                  }}
                >
                  Don&apos;t have an account?{" "}
                  <button
                    type="button"
                    onClick={() => setMode("signup")}
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      margin: 0,
                      cursor: "pointer",
                      color: "#a78bfa",
                      fontWeight: 600,
                    }}
                  >
                    Sign up
                  </button>
                </p>
              ) : (
                <p
                  style={{
                    fontSize: 12,
                    color: "rgba(186,230,255,0.45)",
                  }}
                >
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => setMode("login")}
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      margin: 0,
                      cursor: "pointer",
                      color: "#a78bfa",
                      fontWeight: 600,
                    }}
                  >
                    Sign in
                  </button>
                </p>
              )}
            </div>

            <div style={{ marginTop: 18, textAlign: "center" }}>
              <Link
                href="/"
                style={{
                  fontSize: 11,
                  color: "rgba(186,230,255,0.35)",
                  textDecoration: "none",
                }}
              >
                ← Back to homepage
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
