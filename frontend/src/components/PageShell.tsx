"use client";

import Image from "next/image";
import { Navbar } from "./Navbar";
import { ReactNode } from "react";

export function PageShell({ children }: { children: ReactNode }) {
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
      {/* Shared background image for all app pages */}
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

      <div
        style={{
          position: "relative",
          zIndex: 10,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Navbar />
        <div style={{ paddingTop: 64, flex: 1 }}>{children}</div>
      </div>
    </div>
  );
}
