"use client";

import Image from "next/image";
import Link from "next/link";

export function Navbar() {
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

      {/* Right actions — login + contact */}
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
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
