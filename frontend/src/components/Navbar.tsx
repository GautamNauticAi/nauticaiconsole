"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { label: "Dashboard",  href: "/dashboard" },
  { label: "Inspect",    href: "/inspect"   },
  { label: "Reports",    href: "/reports"   },
];

export function Navbar() {
  const path = usePathname();

  return (
    <header style={{
      position: "fixed", top: 0, left: 0, right: 0,
      zIndex: 50,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 48px",
      height: 64,
      background: "rgba(10,5,32,0.70)",
      backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
      borderBottom: "1px solid rgba(255,255,255,0.07)",
    }}>
      {/* Logo */}
      <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, overflow: "hidden", flexShrink: 0 }}>
          <Image src="/logo.png" alt="NautiCAI" width={32} height={32} style={{ objectFit: "cover" }} />
        </div>
        <span style={{
          fontSize: 14, fontWeight: 700, letterSpacing: "-0.01em",
          background: "linear-gradient(135deg, #fff 0%, #c4b5fd 100%)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>NautiCAI</span>
      </Link>

      {/* Nav */}
      <nav style={{ display: "flex", gap: 4 }}>
        {NAV.map((n) => {
          const active = path.startsWith(n.href);
          return (
            <Link key={n.href} href={n.href} style={{
              fontSize: 13, fontWeight: active ? 600 : 500,
              color: active ? "#fff" : "rgba(218,228,255,0.65)",
              textDecoration: "none",
              padding: "6px 14px",
              borderRadius: 8,
              background: active ? "rgba(124,58,237,0.22)" : "transparent",
              border: active ? "1px solid rgba(124,58,237,0.35)" : "1px solid transparent",
              transition: "all 0.18s ease",
            }}>{n.label}</Link>
          );
        })}
      </nav>

      {/* Right */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <Link href="/inspect" style={{
          fontSize: 13, fontWeight: 700, color: "#fff",
          background: "linear-gradient(135deg, #7c3aed, #3b82f6)",
          borderRadius: 999, padding: "7px 18px",
          textDecoration: "none",
          boxShadow: "0 2px 16px rgba(124,58,237,0.40)",
          transition: "opacity 0.18s",
        }}>
          + New Inspection
        </Link>
      </div>
    </header>
  );
}
