"use client";

import { useState } from "react";
import Link from "next/link";
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
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortBy, setSortBy] = useState<"date" | "risk">("date");

  const inspections = MOCK_INSPECTIONS
    .filter((i) => {
      if (filterStatus !== "all" && i.status !== filterStatus) return false;
      if (search && !`${i.vessel_name} ${i.file_name}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) =>
      sortBy === "date"
        ? new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        : b.risk_score - a.risk_score
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
          <Link href="/inspect" style={{
            fontSize: 13, fontWeight: 700, color: "#fff",
            background: "linear-gradient(135deg, #7c3aed, #3b82f6)",
            borderRadius: 999, padding: "9px 22px", textDecoration: "none",
            boxShadow: "0 2px 20px rgba(124,58,237,0.40)",
          }}>
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
                const ms = maxSeverity(ins.anomalies);
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
                      <span style={{ fontSize: 13, fontWeight: 700, color: ins.anomalies.length ? "#f59e0b" : "#10b981" }}>
                        {ins.anomalies.length}
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
                        <span style={{
                          fontSize: 13, fontWeight: 700,
                          color: ins.risk_score >= 8 ? "#dc2626" : ins.risk_score >= 5 ? "#f59e0b" : "#10b981",
                        }}>
                          {ins.risk_score.toFixed(1)}
                        </span>
                      ) : <span style={{ color: "rgba(186,230,255,0.30)", fontSize: 12 }}>—</span>}
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
                      <div style={{ display: "flex", gap: 8 }}>
                        {ins.status === "completed" && (
                          <>
                            <Link href={`/results/${ins.id}`} style={{
                              fontSize: 11, fontWeight: 600, color: "#a78bfa",
                              textDecoration: "none", padding: "4px 10px",
                              border: "1px solid rgba(167,139,250,0.30)", borderRadius: 6,
                            }}>View</Link>
                            <a href={api.exportReportUrl(ins.id)} target="_blank" rel="noreferrer" style={{
                              fontSize: 11, fontWeight: 600, color: "rgba(186,230,255,0.55)",
                              textDecoration: "none", padding: "4px 10px",
                              border: "1px solid rgba(186,230,255,0.20)", borderRadius: 6,
                            }}>PDF ↗</a>
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
