"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { api, MOCK_INSPECTIONS, MOCK_STATS } from "@/lib/api";
import type { Inspection, Severity, DashboardStats } from "@/types";

const severityColor: Record<Severity, string> = {
  low:      "#10b981",
  medium:   "#f59e0b",
  high:     "#ef4444",
  critical: "#dc2626",
};

const statusColor: Record<string, string> = {
  completed:  "#10b981",
  processing: "#f59e0b",
  pending:    "#94a3b8",
  failed:     "#ef4444",
};

const FALLBACK_ANOMALY_BREAKDOWN = [
  { label: "Corrosion",     count: 42, color: "#ef4444" },
  { label: "Marine Growth", count: 31, color: "#7c3aed" },
  { label: "Hull Debris",   count: 24, color: "#f59e0b" },
  { label: "Dents & Damage",count: 14, color: "#3b82f6" },
  { label: "Clean",         count: 7,  color: "#10b981" },
];

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent: string }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.05)",
      border: "1px solid rgba(255,255,255,0.09)",
      borderRadius: 16, padding: "22px 24px",
      display: "flex", flexDirection: "column", gap: 6,
    }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(186,230,255,0.50)", textTransform: "uppercase", letterSpacing: "0.1em" }}>{label}</span>
      <span style={{ fontSize: "2rem", fontWeight: 800, color: accent, lineHeight: 1 }}>{value}</span>
      {sub && <span style={{ fontSize: 11, color: "rgba(226,238,255,0.50)" }}>{sub}</span>}
    </div>
  );
}

function RiskBadge({ score }: { score: number }) {
  const color = score >= 8 ? "#dc2626" : score >= 5 ? "#f59e0b" : "#10b981";
  const label = score >= 8 ? "Critical" : score >= 5 ? "High" : "Low";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: 11, fontWeight: 700, color,
      background: `${color}18`, border: `1px solid ${color}44`,
      borderRadius: 999, padding: "2px 10px",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, display: "inline-block" }} />
      {label} {score.toFixed(1)}
    </span>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [inspections, setInspections] = useState<Inspection[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoverNew, setHoverNew] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("nauticai:token");
    if (!token) router.replace("/login");
  }, [router]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [s, list] = await Promise.all([
          api.getStats(),
          api.listInspections(),
        ]);
        if (!active) return;
        setStats(s);
        setInspections(list);
      } catch {
        if (!active) return;
        setStats(MOCK_STATS);
        setInspections(MOCK_INSPECTIONS);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const effectiveStats = stats ?? MOCK_STATS;
  const effectiveInspections: Inspection[] =
    inspections ?? MOCK_INSPECTIONS;

  // Derive anomaly breakdown from inspection data (fallback to static if empty)
  const breakdownBase = [
    { key: "corrosion", label: "Corrosion", color: "#ef4444" },
    { key: "marine", label: "Marine Growth", color: "#7c3aed" },
    { key: "debris", label: "Hull Debris", color: "#f59e0b" },
    { key: "dent", label: "Dents & Damage", color: "#3b82f6" },
  ];

  const computedBreakdown = breakdownBase.map((row) => {
    let count = 0;
    for (const ins of effectiveInspections) {
      const anyIns = ins as any;
      const fromDetected = Array.isArray(anyIns.detected_classes)
        ? anyIns.detected_classes
        : [];
      const fromAnomalies = Array.isArray(anyIns.anomalies)
        ? anyIns.anomalies
        : [];
      const names = [...fromDetected, ...fromAnomalies].map((c: any) => {
        if (!c) return "";
        if (typeof c === "string") return c.toLowerCase();
        if (typeof c.class === "string") return c.class.toLowerCase();
        if (typeof c.label === "string") return c.label.toLowerCase();
        if (typeof c.name === "string") return c.name.toLowerCase();
        return "";
      });
      count += names.filter((n) => n && n.includes(row.key)).length;
    }
    return { label: row.label, color: row.color, count };
  });

  const hasData = computedBreakdown.some((b) => b.count > 0);
  const anomalyBreakdown = hasData ? computedBreakdown : FALLBACK_ANOMALY_BREAKDOWN;
  const totalAnomalies = anomalyBreakdown.reduce((s, a) => s + a.count, 0);

  return (
    <PageShell>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 48px" }}>

        {/* Header */}
        <div style={{ marginBottom: 36, display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: "1.75rem", fontWeight: 800, letterSpacing: "-0.03em", marginBottom: 4 }}>
              Overview
            </h1>
            <p style={{ fontSize: 13, color: "rgba(186,230,255,0.55)" }}>
              Hull inspection activity — all vessels
            </p>
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

        {/* Stat cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 32 }}>
          <StatCard label="Total Inspections" value={effectiveStats.total_inspections}  sub="all time"              accent="#fff" />
          <StatCard label="High Risk Vessels"  value={effectiveStats.high_risk_count}    sub="risk score ≥ 8"        accent="#ef4444" />
          <StatCard label="Anomalies Found"    value={effectiveStats.total_anomalies}    sub="across all inspections" accent="#f59e0b" />
          <StatCard label="Avg Risk Score"     value={effectiveStats.avg_risk_score.toFixed(1)} sub="out of 10"      accent="#7c3aed" />
        </div>

        {/* Main grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 20 }}>

          {/* Inspections table */}
          <div style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 16, overflow: "hidden",
          }}>
            <div style={{
              padding: "18px 24px",
              borderBottom: "1px solid rgba(255,255,255,0.07)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>Recent Inspections</span>
              <Link href="/reports" style={{ fontSize: 12, color: "rgba(186,230,255,0.60)", textDecoration: "none" }}>
                View all →
              </Link>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  {[
                    { label: "Vessel",    align: "left" },
                    { label: "File",      align: "left" },
                    { label: "Anomalies", align: "center" },
                    { label: "Risk",      align: "center" },
                    { label: "Status",    align: "center" },
                    { label: "Date",      align: "left" },
                    { label: "",          align: "right" },
                  ].map((col) => (
                    <th
                      key={col.label + col.align}
                      style={{
                        padding: "11px 24px",
                        textAlign: col.align as "left" | "center" | "right",
                        fontSize: 11,
                        fontWeight: 600,
                        color: "rgba(186,230,255,0.45)",
                        letterSpacing: "0.07em",
                        textTransform: "uppercase",
                      }}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {effectiveInspections.map((ins, i) => (
                  <tr
                    key={ins.id}
                    style={{
                      borderBottom:
                        i < effectiveInspections.length - 1
                          ? "1px solid rgba(255,255,255,0.05)"
                          : "none",
                      transition: "background 0.15s",
                    }}
                  >
                    <td style={{ padding: "14px 24px", textAlign: "center" }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{ins.vessel_name ?? "—"}</span>
                    </td>
                    <td style={{ padding: "14px 24px", textAlign: "center" }}>
                      <span style={{ fontSize: 12, color: "rgba(186,230,255,0.60)", fontFamily: "monospace" }}>
                        {ins.file_name ?? "—"}
                      </span>
                    </td>
                    <td style={{ padding: "14px 24px", textAlign: "center" }}>
                      {(() => {
                        const anyIns = ins as any;
                        const anomaliesArr = Array.isArray(anyIns.anomalies)
                          ? anyIns.anomalies
                          : Array.isArray(anyIns.detected_classes)
                          ? anyIns.detected_classes
                          : [];
                        const count = anomaliesArr.length;
                        const has = count > 0;
                        return (
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: has ? "#f59e0b" : "#10b981",
                            }}
                          >
                            {count}
                          </span>
                        );
                      })()}
                    </td>
                    <td style={{ padding: "14px 24px" }}>
                      {ins.status === "completed" ? (
                        (() => {
                          const anyIns = ins as any;
                          const numeric =
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
                          return <RiskBadge score={numeric} />;
                        })()
                      ) : (
                        <span
                          style={{
                            color: "rgba(186,230,255,0.35)",
                            fontSize: 12,
                          }}
                        >
                          —
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "14px 24px" }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700,
                        color: statusColor[ins.status],
                        background: `${statusColor[ins.status]}18`,
                        border: `1px solid ${statusColor[ins.status]}44`,
                        borderRadius: 999, padding: "3px 10px",
                        textTransform: "capitalize",
                      }}>{ins.status}</span>
                    </td>
                    <td style={{ padding: "14px 24px" }}>
                      <span style={{ fontSize: 12, color: "rgba(186,230,255,0.45)" }}>
                        {new Date(ins.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                    </td>
                    <td style={{ padding: "14px 24px", textAlign: "right" }}>
                      {ins.status === "completed" && (
                        <Link
                          href={`/results/${ins.id}`}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            minWidth: 72,
                            fontSize: 11,
                            fontWeight: 600,
                            color: "#a78bfa",
                            textDecoration: "none",
                            padding: "5px 12px",
                            borderRadius: 999,
                            border: "1px solid rgba(167,139,250,0.35)",
                            background: "rgba(15,23,42,0.95)",
                          }}
                        >
                          View
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Anomaly breakdown */}
          <div style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 16, padding: "20px 22px",
            display: "flex", flexDirection: "column", gap: 16,
          }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Anomaly Breakdown</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {anomalyBreakdown.map((a) => (
                <div key={a.label}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: "rgba(226,238,255,0.80)" }}>{a.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: a.color }}>{a.count}</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                    <div style={{
                      height: "100%", borderRadius: 999,
                      background: a.color,
                      width: `${(a.count / totalAnomalies) * 100}%`,
                      transition: "width 0.6s ease",
                    }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Quick links */}
            <div style={{ marginTop: 8, borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(186,230,255,0.40)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Quick Actions</span>
              {[
                { label: "Start New Inspection", href: "/inspect",   color: "#7c3aed" },
                { label: "View All Reports",      href: "/reports",   color: "#3b82f6" },
              ].map((l) => (
                <Link key={l.href} href={l.href} style={{
                  display: "block", fontSize: 13, fontWeight: 600,
                  color: l.color, textDecoration: "none",
                  padding: "8px 12px", borderRadius: 8,
                  background: `${l.color}12`,
                  border: `1px solid ${l.color}28`,
                  textAlign: "center",
                  transition: "opacity 0.18s",
                }}>{l.label}</Link>
              ))}
            </div>
          </div>

        </div>
      </div>
    </PageShell>
  );
}
