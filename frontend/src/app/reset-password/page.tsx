"use client";

import { useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { authResetPassword } from "@/lib/api";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setErr("");
      if (!token) {
        setErr("Invalid reset link. Request a new one from the login page.");
        return;
      }
      if (password.length < 8) {
        setErr("Password must be at least 8 characters.");
        return;
      }
      if (password !== confirm) {
        setErr("Passwords do not match.");
        return;
      }
      setLoading(true);
      try {
        await authResetPassword(token, password);
        setSuccess(true);
        setTimeout(() => router.push("/login"), 2500);
      } catch (error) {
        setErr(error instanceof Error ? error.message : "Failed to reset password. The link may have expired.");
      } finally {
        setLoading(false);
      }
    },
    [token, password, confirm, router]
  );

  if (!token) {
    return (
      <div
        style={{
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 16,
          padding: "32px 36px",
          maxWidth: 400,
        }}
      >
        <h1 style={{ fontSize: "1.25rem", fontWeight: 800, marginBottom: 12 }}>Invalid link</h1>
        <p style={{ fontSize: 13, color: "rgba(186,230,255,0.65)", marginBottom: 20 }}>
          This reset link is missing or invalid. Request a new one from the sign-in page.
        </p>
        <Link
          href="/login"
          style={{
            display: "inline-block",
            fontSize: 13,
            fontWeight: 600,
            color: "#a78bfa",
            textDecoration: "none",
          }}
        >
          ← Back to sign in
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <div
        style={{
          background: "rgba(16,185,129,0.12)",
          border: "1px solid rgba(16,185,129,0.35)",
          borderRadius: 16,
          padding: "32px 36px",
          maxWidth: 400,
        }}
      >
        <h1 style={{ fontSize: "1.25rem", fontWeight: 800, marginBottom: 12, color: "#6ee7b7" }}>Password updated</h1>
        <p style={{ fontSize: 13, color: "rgba(186,230,255,0.8)", margin: 0 }}>
          You can now sign in with your new password. Redirecting…
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 16,
        padding: "32px 36px",
        maxWidth: 400,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <Image src="/logo.png" alt="NautiCAI" width={36} height={36} style={{ borderRadius: 10 }} />
        <span style={{ fontSize: 16, fontWeight: 800, background: "linear-gradient(135deg, #fff 0%, #c4b5fd 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          NautiCAI
        </span>
      </div>
      <h1 style={{ fontSize: "1.25rem", fontWeight: 800, marginBottom: 8 }}>Set new password</h1>
      <p style={{ fontSize: 13, color: "rgba(186,230,255,0.55)", marginBottom: 24 }}>
        Enter your new password below.
      </p>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(186,230,255,0.50)", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>
            New password
          </label>
          <div style={{ position: "relative" }}>
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              style={{
                width: "100%",
                fontSize: 13,
                fontFamily: "inherit",
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 10,
                padding: "10px 14px",
                paddingRight: 44,
                color: "#fff",
                outline: "none",
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              style={{
                position: "absolute",
                right: 10,
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                padding: 4,
                cursor: "pointer",
                color: "rgba(186,230,255,0.5)",
                fontSize: 12,
              }}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(186,230,255,0.50)", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>
            Confirm password
          </label>
          <input
            type={showPassword ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
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
            }}
          />
        </div>
        {err && (
          <p style={{ fontSize: 12, color: "#ef4444", background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.30)", borderRadius: 8, padding: "8px 12px", margin: 0 }}>
            {err}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: loading ? "rgba(15,23,42,0.6)" : "#020617",
            background: loading ? "rgba(248,250,252,0.8)" : "#f9fafb",
            borderRadius: 999,
            padding: "11px 18px",
            border: "1px solid rgba(148,163,184,0.45)",
            cursor: loading ? "not-allowed" : "pointer",
            boxShadow: loading ? "none" : "0 4px 22px rgba(15,23,42,0.75)",
            marginTop: 4,
          }}
        >
          {loading ? "Updating…" : "Update password"}
        </button>
        <Link href="/login" style={{ fontSize: 12, color: "rgba(186,230,255,0.6)", textDecoration: "none", textAlign: "center" }}>
          ← Back to sign in
        </Link>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        position: "relative",
        overflow: "hidden",
        fontFamily: "'DM Sans', system-ui, sans-serif",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
        <Image src="/bg3.avif" alt="" fill priority style={{ objectFit: "cover", objectPosition: "center" }} />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(135deg, rgba(3,7,18,0.85) 0%, rgba(15,23,42,0.75) 100%)",
          }}
        />
      </div>
      <div style={{ position: "relative", zIndex: 10 }}>
        <Suspense fallback={<div style={{ color: "rgba(186,230,255,0.6)" }}>Loading…</div>}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
