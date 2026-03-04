"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { MOCK_INSPECTIONS, api } from "@/lib/api";
import type { Severity } from "@/types";

const severityColor: Record<Severity, string> = {
  low:      "#10b981",
  medium:   "#f59e0b",
  high:     "#ef4444",
  critical: "#dc2626",
};

function maxSeverity(anomalies: { severity: Severity }[]): Severity | null {
  const order: Severity[] = ["critical", "high", "medium", "low"];
  for (const s of order) {
    if (anomalies.some((a) => a.severity === s)) return s;
  }
  return null;
}

export default function ReportsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortBy, setSortBy] = useState<"date" | "risk">("date");
  const [hoverNew, setHoverNew] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("nauticai:token");
    if (!token) router.replace("/login");
  }, [router]);

  const inspections = MOCK_INSPECTIONS
    .filter((i) => {
      if (filterStatus !== "all" && i.status !== filterStatus) return false;
      if (search && !`${i.vessel_name} ${i.file_name}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) =>
      sortBy === "date"
        ? new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        : (b.risk_score ?? 0) - (a.risk_score ?? 0)
    );

  return (
    <PageShell>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 48px" }}>

        {/* Header */}
        <div style={{ marginBottom: 28, display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: "1.75rem", fontWeight: 800, letterSpacing: "-0.03em", marginBottom: 4 }}>Reports</h1>
            <p style={{ fontSize: 13, color: "rgba(186,230,255,0.55)" }}>Full inspection history — filter, sort and export</p>
          </div>
          <Link
            href="/inspect"
            onMouseEnter={() => setHoverNew(true)}
            onMouseLeave={() => setHoverNew(false)}
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: hoverNew ? "#f9fafb" : "#020617",
              background: hoverNew ? "rgba(15,23,42,0.98)" : "#f9fafb",
              borderRadius: 999,
              padding: "9px 22px",
              textDecoration: "none",
              border: hoverNew
                ? "1px solid rgba(148,163,184,0.55)"
                : "1px solid rgba(148,163,184,0.25)",
              boxShadow: hoverNew
                ? "0 0 0 1px rgba(15,23,42,0.9)"
                : "0 4px 20px rgba(15,23,42,0.65)",
              transition: "all 0.16s ease",
            }}
          >
            + New Inspection
          </Link>
        </div>

        {/* Filters bar */}
        <div style={{
          display: "flex", gap: 12, alignItems: "center", marginBottom: 20,
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 12, padding: "12px 16px",
        }}>
          {/* Search */}
          <div style={{ position: "relative", flex: 1 }}>
            <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(186,230,255,0.40)" strokeWidth={2}>
              <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search vessel or file…"
              style={{
                width: "100%", paddingLeft: 32, paddingRight: 12, paddingTop: 7, paddingBottom: 7,
                fontSize: 13, fontFamily: "inherit",
                background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: 8, color: "#fff", outline: "none",
              }}
            />
          </div>

          {/* Status filter */}
          {["all", "completed", "processing", "failed"].map((s) => (
            <button key={s} onClick={() => setFilterStatus(s)} style={{
              fontSize: 12, fontWeight: 600,
              color: filterStatus === s ? "#fff" : "rgba(186,230,255,0.55)",
              background: filterStatus === s ? "rgba(124,58,237,0.30)" : "transparent",
              border: filterStatus === s ? "1px solid rgba(124,58,237,0.45)" : "1px solid transparent",
              borderRadius: 8, padding: "6px 14px", cursor: "pointer",
              textTransform: "capitalize", transition: "all 0.15s",
            }}>{s}</button>
          ))}

          {/* Sort */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
            <span style={{ fontSize: 11, color: "rgba(186,230,255,0.45)" }}>Sort:</span>
            {(["date", "risk"] as const).map((s) => (
              <button key={s} onClick={() => setSortBy(s)} style={{
                fontSize: 12, fontWeight: 600,
                color: sortBy === s ? "#a78bfa" : "rgba(186,230,255,0.50)",
                background: "transparent", border: "none", cursor: "pointer",
                textTransform: "capitalize",
              }}>{s}</button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div style={{
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 16, overflow: "hidden",
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                {["Vessel", "File", "Date", "Anomalies", "Max Severity", "Risk Score", "Status", "Actions"].map((h) => (
                  <th key={h} style={{
                    padding: "12px 20px", textAlign: "left",
                    fontSize: 11, fontWeight: 600, color: "rgba(186,230,255,0.42)",
                    letterSpacing: "0.08em", textTransform: "uppercase",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {inspections.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: "48px 20px", textAlign: "center", color: "rgba(186,230,255,0.35)", fontSize: 13 }}>
                    No inspections match your filters.
                  </td>
                </tr>
              )}
              {inspections.map((ins, i) => {
                const ms = maxSeverity(ins.anomalies ?? []);
                const msColor = ms ? severityColor[ms] : "#94a3b8";
                return (
                  <tr key={ins.id} style={{
                    borderBottom: i < inspections.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                  }}>
                    <td style={{ padding: "14px 20px" }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{ins.vessel_name ?? "—"}</span>
                    </td>
                    <td style={{ padding: "14px 20px" }}>
                      <span style={{ fontSize: 12, color: "rgba(186,230,255,0.55)", fontFamily: "monospace" }}>{ins.file_name ?? "—"}</span>
                    </td>
                    <td style={{ padding: "14px 20px" }}>
                      <span style={{ fontSize: 12, color: "rgba(186,230,255,0.50)" }}>
                        {new Date(ins.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                      </span>
                    </td>
                    <td style={{ padding: "14px 20px" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: (ins.anomalies?.length ?? 0) ? "#f59e0b" : "#10b981" }}>
                        {ins.anomalies?.length ?? 0}
                      </span>
                    </td>
                    <td style={{ padding: "14px 20px" }}>
                      {ms ? (
                        <span style={{
                          fontSize: 11, fontWeight: 700, color: msColor,
                          background: `${msColor}18`, border: `1px solid ${msColor}44`,
                          borderRadius: 999, padding: "3px 10px", textTransform: "capitalize",
                        }}>{ms}</span>
                      ) : <span style={{ color: "rgba(186,230,255,0.30)", fontSize: 12 }}>—</span>}
                    </td>
                    <td style={{ padding: "14px 20px" }}>
                      {ins.status === "completed" ? (
                        (() => {
                          const anyIns = ins as any;
                          const numericRisk =
                            typeof anyIns.risk_score === "number"
                              ? anyIns.risk_score
                              : anyIns.risk_level === "HIGH" ||
                                anyIns.risk_level === "CRITICAL"
                              ? 8.5
                              : anyIns.risk_level === "MEDIUM"
                              ? 5.5
                              : anyIns.risk_level === "LOW"
                              ? 3.0
                              : 1.0;
                          const color =
                            numericRisk >= 8 ? "#dc2626" : numericRisk >= 5 ? "#f59e0b" : "#10b981";
                          return (
                            <span
                              style={{
                                fontSize: 13,
                                fontWeight: 700,
                                color,
                              }}
                            >
                              {numericRisk.toFixed(1)}
                            </span>
                          );
                        })()
                      ) : (
                        <span style={{ color: "rgba(186,230,255,0.30)", fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: "14px 20px" }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, textTransform: "capitalize",
                        color: ins.status === "completed" ? "#10b981" : ins.status === "processing" ? "#f59e0b" : ins.status === "failed" ? "#ef4444" : "#94a3b8",
                        background: ins.status === "completed" ? "rgba(16,185,129,0.12)" : ins.status === "processing" ? "rgba(245,158,11,0.12)" : "rgba(239,68,68,0.12)",
                        border: `1px solid ${ins.status === "completed" ? "rgba(16,185,129,0.30)" : ins.status === "processing" ? "rgba(245,158,11,0.30)" : "rgba(239,68,68,0.30)"}`,
                        borderRadius: 999, padding: "3px 10px",
                      }}>{ins.status}</span>
                    </td>
                    <td style={{ padding: "14px 20px" }}>
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        {ins.status === "completed" && (
                          <>
                            <Link
                              href={`/results/${ins.id}`}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                minWidth: 72,
                                fontSize: 11,
                                fontWeight: 600,
                                color: "#020617",
                                textDecoration: "none",
                                padding: "5px 12px",
                                borderRadius: 999,
                                border: "1px solid rgba(148,163,184,0.45)",
                                background: "#f9fafb",
                                boxShadow: "0 4px 18px rgba(15,23,42,0.70)",
                                transition: "all 0.16s ease",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = "rgba(15,23,42,0.98)";
                                e.currentTarget.style.color = "#f9fafb";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = "#f9fafb";
                                e.currentTarget.style.color = "#020617";
                              }}
                            >
                              View
                            </Link>
                            <a
                              href={api.exportReportUrl(ins.id)}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                minWidth: 72,
                                fontSize: 11,
                                fontWeight: 600,
                                color: "#e5e7eb",
                                textDecoration: "none",
                                padding: "5px 12px",
                                borderRadius: 999,
                                border: "1px solid rgba(148,163,184,0.45)",
                                background: "rgba(15,23,42,0.96)",
                                boxShadow: "0 3px 16px rgba(15,23,42,0.75)",
                                transition: "opacity 0.16s ease",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.opacity = "0.9";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.opacity = "1";
                              }}
                            >
                              PDF ↗
                            </a>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p style={{ marginTop: 14, fontSize: 11, color: "rgba(186,230,255,0.30)", textAlign: "right" }}>
          {inspections.length} inspection{inspections.length !== 1 ? "s" : ""} shown
        </p>
      </div>
    </PageShell>
  );
}
