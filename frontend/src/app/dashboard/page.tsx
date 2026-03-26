"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { DeleteConfirmModal } from "@/components/DeleteConfirmModal";
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

/* Match Inspect page card style */
const CARD_STYLE: React.CSSProperties = {
  background: "rgba(8, 10, 30, 0.72)",
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
  borderRadius: 16,
  border: "1px solid rgba(129, 140, 248, 0.22)",
  boxShadow: "0 6px 28px rgba(0,0,0,0.50)",
};

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{
      ...CARD_STYLE,
      padding: "20px 22px",
      display: "flex",
      flexDirection: "column",
      gap: 4,
    }}>
      <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(186,230,255,0.5)", letterSpacing: "0.14em", textTransform: "uppercase" }}>{label}</span>
      <span style={{ fontSize: "1.75rem", fontWeight: 700, color: "#f1f5f9", lineHeight: 1.2 }}>{value}</span>
      {sub && <span style={{ fontSize: 11, color: "rgba(148,163,184,0.9)" }}>{sub}</span>}
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
  const [deleteModalInspection, setDeleteModalInspection] = useState<Inspection | null>(null);
  const [displayUsername, setDisplayUsername] = useState<string | null>(null);
  useEffect(() => {
    setDisplayUsername(window.localStorage.getItem("nauticai:username"));
    api.getCurrentUser().then((res) => {
      const un = res.user?.username ?? null;
      if (un && typeof window !== "undefined") {
        window.localStorage.setItem("nauticai:username", un);
        setDisplayUsername(un);
      }
    }).catch(() => {});
  }, []);

  const fetchList = useCallback((forceRefresh = false) => {
    api
      .listInspections(forceRefresh)
      .then(setInspections)
      .catch(() => setInspections([]));
  }, []);

  const openDeleteModal = useCallback((ins: Inspection) => {
    if (String(ins.id)) setDeleteModalInspection(ins);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteModalInspection) return;
    const id = String(deleteModalInspection.inspection_id ?? deleteModalInspection.id);
    await api.deleteInspection(id);
    setInspections((prev) => (prev ?? []).filter((i) => String(i.inspection_id ?? i.id) !== id));
  }, [deleteModalInspection]);

  // Agentic backend has no auth; allow access without login when using Agentic
  useEffect(() => {
    if (typeof window === "undefined") return;
    const useAgentic = process.env.NEXT_PUBLIC_USE_AGENTIC === "1";
    if (useAgentic) return;
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
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 32px" }}>

        {/* Header — match Inspect page tone */}
        <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div>
            <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.20em", color: "rgba(186,230,255,0.45)", marginBottom: 4 }}>Overview</p>
            <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, marginBottom: 4, background: "linear-gradient(90deg, #fff 55%, #a5b4fc)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
              Hull inspection activity
            </h1>
            <p style={{ fontSize: 11, color: "rgba(186,230,255,0.55)" }}>Recent inspections and risk summary</p>
          </div>
          <Link
            href="/inspect"
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "#020617",
              background: "#f9fafb",
              borderRadius: 999,
              padding: "10px 24px",
              textDecoration: "none",
              border: "1px solid rgba(148,163,184,0.45)",
              boxShadow: "0 4px 22px rgba(15,23,42,0.75)",
              transition: "background 0.2s ease, color 0.2s ease",
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
            New inspection
          </Link>
        </div>

        {/* Stat cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
          <StatCard label="Total inspections" value={effectiveStats.total_inspections} sub="All time" />
          <StatCard label="High risk" value={effectiveStats.high_risk_count} sub="Score ≥ 8" />
          <StatCard label="Anomalies found" value={effectiveStats.total_anomalies} sub="Across inspections" />
          <StatCard label="Avg risk score" value={effectiveStats.avg_risk_score.toFixed(1)} sub="Out of 10" />
        </div>

        {/* Main grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 20 }}>

          {/* Inspections table — CARD style, fix date/actions overlap */}
          <div style={{ ...CARD_STYLE, overflow: "hidden", padding: 0 }}>
            <div style={{
              padding: "16px 20px",
              borderBottom: "1px solid rgba(129,140,248,0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(226,232,240,0.96)" }}>Recent inspections</span>
              <Link href="/reports" style={{ fontSize: 12, color: "rgba(148,163,184,0.9)", textDecoration: "none", fontWeight: 600 }}>View all</Link>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
                <colgroup>
                  <col style={{ width: "18%" }} />
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "24%", minWidth: 140 }} />
                </colgroup>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(129,140,248,0.2)", background: "rgba(15,23,42,0.6)" }}>
                    {[
                      { label: "Vessel", align: "left" as const },
                      { label: "Images", align: "center" as const },
                      { label: "Anomalies", align: "center" as const },
                      { label: "Risk", align: "center" as const },
                      { label: "NDT thickness (Demo)", align: "center" as const },
                      { label: "Status", align: "center" as const },
                      { label: "Date", align: "left" as const },
                      { label: "Actions", align: "right" as const },
                    ].map((col) => (
                      <th
                        key={col.label}
                        style={{
                          padding: "12px 14px",
                          textAlign: col.align,
                          fontSize: 9,
                          fontWeight: 700,
                          color: "rgba(186,230,255,0.5)",
                          letterSpacing: "0.1em",
                          textTransform: "uppercase",
                        }}
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {effectiveInspections.length === 0 && !loading && (
                    <tr>
                      <td colSpan={8} style={{ padding: "40px 16px", textAlign: "center", color: "rgba(148,163,184,0.9)", fontSize: 13 }}>No inspections yet. Run one from Inspect.</td>
                    </tr>
                  )}
                  {loading && (
                    <tr>
                      <td colSpan={8} style={{ padding: "32px 16px", textAlign: "center", color: "rgba(148,163,184,0.8)", fontSize: 13 }}>Loading…</td>
                    </tr>
                  )}
                  {!loading && effectiveInspections.map((ins, i) => (
                    <tr
                      key={ins.id}
                      style={{
                        borderBottom: i < effectiveInspections.length - 1 ? "1px solid rgba(129,140,248,0.12)" : "none",
                      }}
                    >
                      <td style={{ padding: "12px 14px", overflow: "hidden", textOverflow: "ellipsis" }}>
                        <span style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 500, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={String(ins.vessel_name ?? ins.inspection_id)}>{ins.vessel_name ?? ins.inspection_id ?? "—"}</span>
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "center" }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(191,219,254,0.9)" }}>{(ins as any).image_count ?? 1}</span>
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "center" }}>
                        {(() => {
                          const anyIns = ins as any;
                          const anomaliesArr = Array.isArray(anyIns.anomalies) ? anyIns.anomalies : Array.isArray(anyIns.detected_classes) ? anyIns.detected_classes : [];
                          return <span style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>{anomaliesArr.length}</span>;
                        })()}
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "center" }}>
                        {ins.status === "completed" ? (
                          (() => {
                            const anyIns = ins as any;
                            const numeric = typeof anyIns.risk_score === "number" ? anyIns.risk_score : anyIns.risk_level === "HIGH" || anyIns.risk_level === "CRITICAL" ? 8.5 : anyIns.risk_level === "MEDIUM" ? 5.5 : anyIns.risk_level === "LOW" ? 3.0 : 1.0;
                            return <RiskBadge score={numeric} />;
                          })()
                        ) : <span style={{ color: "#64748b", fontSize: 12 }}>—</span>}
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "center" }}>
                        <span style={{ fontSize: 12, color: "#e2e8f0" }}>
                          {ins.ndt_estimated_final_thickness_mm != null
                            ? `${ins.ndt_estimated_final_thickness_mm.toFixed(2)} mm`
                            : "—"}
                        </span>
                        {ins.ndt_estimated_loss_percent != null && (
                          <div style={{ fontSize: 10, color: "rgba(148,163,184,0.9)", marginTop: 2 }}>
                            sample -{ins.ndt_estimated_loss_percent.toFixed(1)}%
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "center" }}>
                        <span style={{ fontSize: 12, fontWeight: 500, color: "#94a3b8", textTransform: "capitalize" }}>{ins.status}</span>
                      </td>
                      <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                        <span style={{ fontSize: 12, color: "#94a3b8" }}>{new Date(ins.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                        {ins.status === "completed" && (
                          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", alignItems: "center" }}>
                            <Link href={`/results/${encodeURIComponent(ins.inspection_id)}`} style={{ fontSize: 12, fontWeight: 600, color: "rgba(148,163,184,0.95)", textDecoration: "underline" }}>Results</Link>
                            <button type="button" onClick={async () => { try { await api.downloadAgenticPdf(ins.inspection_id); } catch { window.alert("Download failed. Make sure you are logged in."); } }} style={{ fontSize: 12, fontWeight: 600, color: "rgba(148,163,184,0.95)", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}>PDF</button>
                            <button type="button" onClick={() => openDeleteModal(ins)} style={{ fontSize: 12, fontWeight: 600, color: "#f87171", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Remove</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Anomaly breakdown — CARD style */}
          <div style={{ ...CARD_STYLE, padding: "20px", display: "flex", flexDirection: "column", gap: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(226,232,240,0.96)", borderBottom: "1px solid rgba(129,140,248,0.15)", paddingBottom: 10 }}>Anomaly breakdown</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {anomalyBreakdown.map((a) => (
                <div key={a.label}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: "#e2e8f0" }}>{a.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>{a.count}</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: "rgba(51,65,85,0.6)", overflow: "hidden" }}>
                    <div style={{
                      height: "100%",
                      borderRadius: 2,
                      background: "rgba(129,140,248,0.5)",
                      width: `${totalAnomalies ? (a.count / totalAnomalies) * 100 : 0}%`,
                    }} />
                  </div>
                </div>
              ))}
            </div>
            <div style={{ borderTop: "1px solid rgba(129,140,248,0.15)", paddingTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(186,230,255,0.42)", letterSpacing: "0.14em", textTransform: "uppercase" }}>Telegram bot</span>
              {displayUsername ? (
                <p style={{ fontSize: 11, color: "rgba(226,232,240,0.9)", margin: 0 }}>
                  Your username: <code style={{ background: "rgba(15,23,42,0.8)", padding: "2px 6px", borderRadius: 4 }}>{displayUsername}</code>
                  <br />
                  <span style={{ fontSize: 10, color: "rgba(148,163,184,0.8)" }}>Enter this in the NautiCAI Inspector bot after /start to get your reports</span>
                </p>
              ) : (
                <p style={{ fontSize: 11, color: "rgba(148,163,184,0.9)", margin: 0 }}>
                  Log in to see your username for the Telegram bot.
                </p>
              )}
              <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(186,230,255,0.42)", letterSpacing: "0.14em", textTransform: "uppercase", marginTop: 8 }}>Quick actions</span>
              <Link href="/inspect" style={{ fontSize: 13, color: "rgba(148,163,184,0.9)", textDecoration: "none", padding: "6px 0" }}>New inspection</Link>
              <Link href="/reports" style={{ fontSize: 13, color: "rgba(148,163,184,0.9)", textDecoration: "none", padding: "6px 0" }}>View all reports</Link>
            </div>
          </div>

        </div>
      </div>

      <DeleteConfirmModal
        open={!!deleteModalInspection}
        onClose={() => setDeleteModalInspection(null)}
        title="Remove inspection?"
        message="This cannot be undone."
        vesselLabel={deleteModalInspection ? `Vessel: ${deleteModalInspection.vessel_name ?? deleteModalInspection.inspection_id ?? deleteModalInspection.id}` : undefined}
        onConfirm={handleDeleteConfirm}
      />
    </PageShell>
  );
}
