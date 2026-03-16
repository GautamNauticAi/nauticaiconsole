"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, invalidateInspectionsCache } from "@/lib/api";

export function Navbar() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [displayUsername, setDisplayUsername] = useState<string | null>(null);
  const [copyDone, setCopyDone] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("nauticai:token");
    setAuthed(!!token);
    if (!token) {
      setUserEmail(null);
      setDisplayUsername(null);
      return;
    }
    setUserEmail(window.localStorage.getItem("nauticai:userEmail"));
    setDisplayUsername(window.localStorage.getItem("nauticai:username"));
    api.getCurrentUser().then((res) => {
      if (res.user?.email && typeof window !== "undefined") {
        window.localStorage.setItem("nauticai:userEmail", res.user.email);
        setUserEmail(res.user.email);
      }
      const un = res.user?.username ?? null;
      if (un && typeof window !== "undefined") {
        window.localStorage.setItem("nauticai:username", un);
        setDisplayUsername(un);
      }
    }).catch(() => {});
  }, []);

  const handleLogout = () => {
    invalidateInspectionsCache();
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("nauticai:token");
      window.localStorage.removeItem("nauticai:userEmail");
      window.localStorage.removeItem("nauticai:username");
    }
    setAuthed(false);
    setUserEmail(null);
    setDisplayUsername(null);
    router.push("/login");
  };

  const copyUsername = () => {
    if (!displayUsername) return;
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(displayUsername);
      setCopyDone(true);
      setTimeout(() => setCopyDone(false), 2000);
    }
  };

  return (
    <header
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 40,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 56px",
        height: 68,
      }}
    >
      {/* Logo + brand — matches homepage */}
      <Link
        href="/"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          textDecoration: "none",
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          <Image
            src="/logo.png"
            alt="NautiCAI"
            width={34}
            height={34}
            style={{ objectFit: "cover", width: "100%", height: "100%" }}
          />
        </div>
        <span
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: "#fff",
            letterSpacing: "-0.01em",
          }}
        >
          NautiCAI
        </span>
      </Link>

      {/* Centre nav — same items as homepage */}
      <nav
        style={{
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          gap: 36,
        }}
      >
        {[
          { label: "Dashboard", href: "/dashboard", external: false },
          { label: "Inspect", href: "/inspect", external: false },
          { label: "Reports", href: "/reports", external: false },
          {
            label: "About",
            href: "https://www.nauticai-ai.com/",
            external: true,
          },
        ].map((item) =>
          item.external ? (
            <a
              key={item.href}
              href={item.href}
              target="_blank"
              rel="noreferrer"
              style={{
                fontSize: 13,
                fontWeight: 600,
                background:
                  "linear-gradient(160deg, #ffffff 0%, #e2e8f0 50%, #94a3b8 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                textDecoration: "none",
                letterSpacing: "-0.005em",
                transition: "opacity 0.2s",
              }}
            >
              {item.label}
            </a>
          ) : (
            <Link
              key={item.href}
              href={item.href}
              style={{
                fontSize: 13,
                fontWeight: 600,
                background:
                  "linear-gradient(160deg, #ffffff 0%, #e2e8f0 50%, #94a3b8 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                textDecoration: "none",
                letterSpacing: "-0.005em",
                transition: "opacity 0.2s",
              }}
            >
              {item.label}
            </Link>
          )
        )}
      </nav>

      {/* Right actions — minimal: username + copy, log out, contact */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {authed ? (
          <>
            {displayUsername && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "5px 10px",
                  borderRadius: 6,
                  background: "rgba(15,23,42,0.85)",
                  border: "1px solid rgba(148,163,184,0.35)",
                }}
              >
                <code style={{ fontSize: 12, color: "#e2e8f0", fontFamily: "monospace", letterSpacing: "0.02em" }}>{displayUsername}</code>
                <button
                  type="button"
                  onClick={copyUsername}
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: copyDone ? "#10b981" : "rgba(167,139,250,0.95)",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  {copyDone ? "Copied" : "Copy"}
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={handleLogout}
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "rgba(226,232,240,0.9)",
                background: "rgba(15,23,42,0.75)",
                border: "1px solid rgba(148,163,184,0.4)",
                borderRadius: 6,
                padding: "6px 14px",
                cursor: "pointer",
              }}
            >
              Log out
            </button>
          </>
        ) : (
          <Link
            href="/login"
            style={{
              fontSize: 13,
              fontWeight: 600,
              background:
                "linear-gradient(160deg, #ffffff 0%, #e2e8f0 50%, #94a3b8 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              textDecoration: "none",
              transition: "opacity 0.2s",
            }}
          >
            Log In
          </Link>
        )}
        <a
          href="mailto:contact@nauticai.com"
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "#0d0422",
            background: "#fff",
            borderRadius: 999,
            padding: "8px 20px",
            textDecoration: "none",
          }}
        >
          Talk to our team
        </a>
      </div>
    </header>
  );
}
