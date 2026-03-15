"use client";

import Link from "next/link";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { PdfViewerModal } from "@/components/PdfViewerModal";
import { api } from "@/lib/api";
import type { Inspection, Severity, DashboardStats } from "@/types";

function computeStatsFromList(inspections: Inspection[]): DashboardStats {
  if (!inspections.length) {
    return { total_inspections: 0, high_risk_count: 0, total_anomalies: 0, avg_risk_score: 0 };
  }
  const total_inspections = inspections.length;
  const high_risk_count = inspections.filter(
    (i) => i.risk_level === "HIGH" || i.risk_level === "CRITICAL"
  ).length;
  const classCount = (i: Inspection): number => {
    const c = i.detected_classes;
    if (Array.isArray(c)) return c.length;
    if (typeof c === "string") {
      try {
        const arr = JSON.parse(c) as unknown;
        return Array.isArray(arr) ? arr.length : 0;
      } catch {
        return 0;
      }
    }
    return 0;
  };
  const total_anomalies = inspections.reduce((sum, i) => sum + classCount(i), 0);
  const riskScoreFor = (i: Inspection): number => {
    switch (i.risk_level) {
      case "HIGH":
      case "CRITICAL":
        return 8.5;
      case "MEDIUM":
        return 5.5;
      case "LOW":
        return 3.0;
      case "SAFE":
      default:
        return 1.0;
    }
  };
  const avg_risk_score =
    inspections.reduce((sum, i) => sum + riskScoreFor(i), 0) / total_inspections;
  return {
    total_inspections,
    high_risk_count,
    total_anomalies,
    avg_risk_score,
  };
}

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

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{
      background: "#1e293b",
      border: "1px solid #334155",
      borderRadius: 8,
      padding: "20px 22px",
      display: "flex",
      flexDirection: "column",
      gap: 4,
    }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", letterSpacing: "0.02em" }}>{label}</span>
      <span style={{ fontSize: "1.75rem", fontWeight: 700, color: "#f1f5f9", lineHeight: 1.2 }}>{value}</span>
      {sub && <span style={{ fontSize: 11, color: "#64748b" }}>{sub}</span>}
    </div>
  );
}

function RiskBadge({ score }: { score: number }) {
  const color = score >= 8 ? "#dc2626" : score >= 5 ? "#d97706" : "#059669";
  const label = score >= 8 ? "Critical" : score >= 5 ? "High" : "Low";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 12, fontWeight: 600, color: "#f1f5f9",
      background: "#334155",
      border: "1px solid #475569",
      borderRadius: 4,
      padding: "4px 8px",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }} />
      <span>{label}</span>
      <span style={{ color: "#94a3b8", marginLeft: 2 }}>{score.toFixed(1)}</span>
    </span>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const [inspections, setInspections] = useState<Inspection[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewingPdf, setViewingPdf] = useState<Inspection | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchList = useCallback((forceRefresh = false) => {
    api
      .listInspections(forceRefresh)
      .then(setInspections)
      .catch(() => setInspections([]));
  }, []);

  const handleDelete = useCallback(async (ins: Inspection) => {
    const id = String(ins.id);
    if (!id) return;
    if (!confirm("Remove this inspection? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      await api.deleteInspection(id);
      setInspections((prev) => (prev ?? []).filter((i) => String(i.id) !== id));
      const list = await api.listInspections();
      setInspections(list);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setDeletingId(null);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("nauticai:token");
    if (!token) router.replace("/login");
  }, [router]);

  // Single source of truth: fetch inspections once, derive stats from it
  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .listInspections()
      .then((list) => {
        if (active) setInspections(list);
      })
      .catch(() => {
        if (active) setInspections([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibility = () => {
      if (document.visibilityState === "visible") fetchList(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [fetchList]);

  const effectiveInspections: Inspection[] = inspections ?? [];
  const effectiveStats = useMemo(
    () => computeStatsFromList(effectiveInspections),
    [effectiveInspections]
  );

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

  const anomalyBreakdown = computedBreakdown;
  const totalAnomalies = anomalyBreakdown.reduce((s, a) => s + a.count, 0);

  return (
    <PageShell>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 48px" }}>

        {/* Header */}
        <div style={{ marginBottom: 28, display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 600, color: "#f1f5f9", marginBottom: 4 }}>
              Overview
            </h1>
            <p style={{ fontSize: 13, color: "#64748b" }}>
              Hull inspection activity
            </p>
          </div>
          <Link
            href="/inspect"
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "#0d0422",
              background: "#fff",
              borderRadius: 999,
              padding: "8px 20px",
              textDecoration: "none",
              transition: "background 0.2s ease, color 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#0d0422";
              e.currentTarget.style.color = "#fff";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#fff";
              e.currentTarget.style.color = "#0d0422";
            }}
          >
            New inspection
          </Link>
        </div>

        {/* Stat cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }}>
          <StatCard label="Total inspections" value={effectiveStats.total_inspections} sub="All time" />
          <StatCard label="High risk" value={effectiveStats.high_risk_count} sub="Score ≥ 8" />
          <StatCard label="Anomalies found" value={effectiveStats.total_anomalies} sub="Across inspections" />
          <StatCard label="Avg risk score" value={effectiveStats.avg_risk_score.toFixed(1)} sub="Out of 10" />
        </div>

        {/* Main grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 20 }}>

          {/* Inspections table */}
          <div style={{
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: 8,
            overflow: "hidden",
          }}>
            <div style={{
              padding: "16px 20px",
              borderBottom: "1px solid #334155",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#f1f5f9" }}>Recent inspections</span>
              <Link href="/reports" style={{ fontSize: 13, color: "#64748b", textDecoration: "none", fontWeight: 500 }}>View all</Link>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", minWidth: 640 }}>
                <colgroup>
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "24%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "10%" }} />
                </colgroup>
                <thead>
                  <tr style={{ borderBottom: "1px solid #334155", background: "#0f172a" }}>
                    {[
                      { label: "Vessel", align: "left" as const },
                      { label: "File", align: "left" as const },
                      { label: "Anomalies", align: "center" as const },
                      { label: "Risk", align: "center" as const },
                      { label: "Status", align: "center" as const },
                      { label: "Date", align: "left" as const },
                      { label: "", align: "right" as const },
                    ].map((col) => (
                      <th
                        key={col.label || "actions"}
                        style={{
                          padding: "12px 16px",
                          textAlign: col.align,
                          fontSize: 11,
                          fontWeight: 600,
                          color: "#64748b",
                          letterSpacing: "0.03em",
                        }}
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {effectiveInspections.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ padding: "32px 16px", textAlign: "center", color: "#64748b", fontSize: 13 }}>No inspections yet. Run one from Inspect.</td>
                    </tr>
                  )}
                  {effectiveInspections.map((ins, i) => (
                    <tr
                      key={ins.id}
                      style={{
                        borderBottom: i < effectiveInspections.length - 1 ? "1px solid #334155" : "none",
                      }}
                    >
                      <td style={{ padding: "12px 16px", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 0 }}>
                        <span style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 500, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={ins.vessel_name ?? undefined}>{ins.vessel_name ?? "—"}</span>
                      </td>
                      <td style={{ padding: "12px 16px", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 0 }}>
                        <span style={{ fontSize: 12, color: "#94a3b8", fontFamily: "monospace", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={ins.file_name ?? undefined}>{ins.file_name ?? "—"}</span>
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "center" }}>
                        {(() => {
                          const anyIns = ins as any;
                          const anomaliesArr = Array.isArray(anyIns.anomalies) ? anyIns.anomalies : Array.isArray(anyIns.detected_classes) ? anyIns.detected_classes : [];
                          const count = anomaliesArr.length;
                          return <span style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>{count}</span>;
                        })()}
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "center" }}>
                        {ins.status === "completed" ? (
                          (() => {
                            const anyIns = ins as any;
                            const numeric = typeof anyIns.risk_score === "number" ? anyIns.risk_score : anyIns.risk_level === "HIGH" || anyIns.risk_level === "CRITICAL" ? 8.5 : anyIns.risk_level === "MEDIUM" ? 5.5 : anyIns.risk_level === "LOW" ? 3.0 : 1.0;
                            return <RiskBadge score={numeric} />;
                          })()
                        ) : <span style={{ color: "#64748b", fontSize: 12 }}>—</span>}
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "center" }}>
                        <span style={{ fontSize: 12, fontWeight: 500, color: "#94a3b8", textTransform: "capitalize" }}>{ins.status}</span>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{ fontSize: 12, color: "#94a3b8" }}>{new Date(ins.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "right" }}>
                        {ins.status === "completed" && (
                          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", alignItems: "center" }}>
                            <button type="button" onClick={() => setViewingPdf(ins)} style={{ fontSize: 12, fontWeight: 600, color: "#64748b", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}>View</button>
                            <button type="button" onClick={() => handleDelete(ins)} disabled={deletingId === String(ins.id)} style={{ fontSize: 12, fontWeight: 600, color: "#f87171", background: "none", border: "none", cursor: deletingId === String(ins.id) ? "wait" : "pointer", padding: 0 }}>{deletingId === String(ins.id) ? "…" : "Remove"}</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Anomaly breakdown */}
          <div style={{
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: 8,
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#f1f5f9" }}>Anomaly breakdown</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {anomalyBreakdown.map((a) => (
                <div key={a.label}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: "#e2e8f0" }}>{a.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>{a.count}</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: "#334155", overflow: "hidden" }}>
                    <div style={{
                      height: "100%",
                      borderRadius: 2,
                      background: "#64748b",
                      width: `${totalAnomalies ? (a.count / totalAnomalies) * 100 : 0}%`,
                    }} />
                  </div>
                </div>
              ))}
            </div>
            <div style={{ borderTop: "1px solid #334155", paddingTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", letterSpacing: "0.02em" }}>Quick actions</span>
              <Link href="/inspect" style={{ fontSize: 13, color: "#94a3b8", textDecoration: "none", padding: "8px 0" }}>New inspection</Link>
              <Link href="/reports" style={{ fontSize: 13, color: "#94a3b8", textDecoration: "none", padding: "8px 0" }}>View all reports</Link>
            </div>
          </div>

        </div>
      </div>

      {viewingPdf && (
        <PdfViewerModal inspection={viewingPdf} annotatedImage={null} onClose={() => setViewingPdf(null)} />
      )}
    </PageShell>
  );
}
