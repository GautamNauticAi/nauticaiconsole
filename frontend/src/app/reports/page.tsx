"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { DeleteConfirmModal } from "@/components/DeleteConfirmModal";
import { api } from "@/lib/api";
import type { Inspection, Severity } from "@/types";

/* Match Inspect/Dashboard card style */
const CARD_STYLE: React.CSSProperties = {
  background: "rgba(8, 10, 30, 0.72)",
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
  borderRadius: 16,
  border: "1px solid rgba(129, 140, 248, 0.22)",
  boxShadow: "0 6px 28px rgba(0,0,0,0.50)",
};

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

function anomalyCount(ins: Inspection): number {
  if (ins.anomalies?.length) return ins.anomalies.length;
  const classes = ins.detected_classes;
  if (Array.isArray(classes)) return classes.length;
  if (typeof classes === "string") {
    try {
      const arr = JSON.parse(classes) as string[];
      return Array.isArray(arr) ? arr.length : 0;
    } catch {
      return 0;
    }
  }
  return 0;
}

export default function ReportsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortBy, setSortBy] = useState<"date" | "risk">("date");
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteModalInspection, setDeleteModalInspection] = useState<Inspection | null>(null);

  const refreshList = useCallback((forceRefresh = false) => {
    api.listInspections(forceRefresh).then(setInspections).catch(() => setInspections([]));
  }, []);

  const openDeleteModal = useCallback((ins: Inspection) => {
    if (String(ins.inspection_id ?? ins.id)) setDeleteModalInspection(ins);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteModalInspection) return;
    const id = String(deleteModalInspection.inspection_id ?? deleteModalInspection.id);
    await api.deleteInspection(id);
    setInspections((prev) => prev.filter((i) => String(i.inspection_id ?? i.id) !== id));
  }, [deleteModalInspection]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const useAgentic = process.env.NEXT_PUBLIC_USE_AGENTIC === "1";
    if (useAgentic) return;
    const token = window.localStorage.getItem("nauticai:token");
    if (!token) router.replace("/login");
  }, [router]);

  // Refetch when user returns to this tab so data is fresh after new inspection or remove elsewhere
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibility = () => {
      if (document.visibilityState === "visible") refreshList(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [refreshList]);

  useEffect(() => {
    let active = true;
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

  const filtered = inspections
    .filter((i) => {
      if (filterStatus !== "all" && i.status !== filterStatus) return false;
      if (search && !`${i.vessel_name ?? ""} ${i.file_name ?? ""}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) =>
      sortBy === "date"
        ? new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        : (b.risk_score ?? 0) - (a.risk_score ?? 0)
    );

  return (
    <PageShell>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 32px" }}>

        {/* Header — match Inspect/Dashboard */}
        <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div>
            <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.20em", color: "rgba(186,230,255,0.45)", marginBottom: 4 }}>Reports</p>
            <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, marginBottom: 4, background: "linear-gradient(90deg, #fff 55%, #a5b4fc)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
              Inspection history
            </h1>
            <p style={{ fontSize: 11, color: "rgba(186,230,255,0.55)" }}>Filter, sort, export PDF</p>
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

        {/* Filters bar — CARD style */}
        <div style={{
          ...CARD_STYLE,
          display: "flex",
          gap: 12,
          alignItems: "center",
          marginBottom: 20,
          padding: "12px 16px",
        }}>
          <div style={{ position: "relative", flex: 1, maxWidth: 320 }}>
            <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth={2}>
              <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search vessel or file"
              style={{
                width: "100%",
                paddingLeft: 32,
                paddingRight: 12,
                paddingTop: 8,
                paddingBottom: 8,
                fontSize: 13,
                fontFamily: "inherit",
                background: "#0f172a",
                border: "1px solid #334155",
                borderRadius: 6,
                color: "#e2e8f0",
                outline: "none",
              }}
            />
          </div>
          {["all", "completed", "processing", "failed"].map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: filterStatus === s ? "#f1f5f9" : "#94a3b8",
                background: filterStatus === s ? "#334155" : "transparent",
                border: "1px solid #334155",
                borderRadius: 6,
                padding: "6px 12px",
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {s}
            </button>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
            <span style={{ fontSize: 12, color: "#64748b" }}>Sort:</span>
            {(["date", "risk"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: sortBy === s ? "#f1f5f9" : "#94a3b8",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  textTransform: "capitalize",
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Table — CARD style, Images column, Date/Actions no overlap */}
        <div style={{ ...CARD_STYLE, overflow: "hidden", padding: 0 }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
              <colgroup>
                <col style={{ width: "16%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "14%", minWidth: 140 }} />
              </colgroup>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(129,140,248,0.2)", background: "rgba(15,23,42,0.6)" }}>
                  {["Vessel", "Images", "Date", "Anomalies", "Severity", "Risk", "NDT thickness (Demo)", "Status", "Actions"].map((h) => (
                    <th key={h} style={{
                      padding: "12px 14px",
                      textAlign: "left",
                      fontSize: 9,
                      fontWeight: 700,
                      color: "rgba(186,230,255,0.5)",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={9} style={{ padding: "40px 16px", textAlign: "center", color: "rgba(148,163,184,0.8)", fontSize: 13 }}>Loading…</td>
                  </tr>
                )}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ padding: "40px 16px", textAlign: "center", color: "rgba(148,163,184,0.9)", fontSize: 13 }}>No inspections match your filters.</td>
                  </tr>
                )}
                {!loading && filtered.map((ins, i) => {
                  const ms = maxSeverity(ins.anomalies ?? []);
                  const msColor = ms ? severityColor[ms] : "#64748b";
                  const rowId = ins.inspection_id ?? String(ins.id);
                  const anyIns = ins as any;
                  const numericRisk = typeof anyIns.risk_score === "number" ? anyIns.risk_score : anyIns.risk_level === "HIGH" || anyIns.risk_level === "CRITICAL" ? 8.5 : anyIns.risk_level === "MEDIUM" ? 5.5 : anyIns.risk_level === "LOW" ? 3.0 : 1.0;
                  return (
                    <tr key={rowId} style={{ borderBottom: i < filtered.length - 1 ? "1px solid rgba(129,140,248,0.12)" : "none" }}>
                      <td style={{ padding: "12px 14px", overflow: "hidden", textOverflow: "ellipsis" }}>
                        <span style={{ fontSize: 13, color: "#e2e8f0", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={String(ins.vessel_name ?? ins.inspection_id)}>{ins.vessel_name ?? ins.inspection_id ?? "—"}</span>
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "center", fontSize: 12, fontWeight: 600, color: "rgba(191,219,254,0.9)" }}>
                        {anyIns.image_count ?? 1}
                      </td>
                      <td style={{ padding: "12px 14px", fontSize: 12, color: "#94a3b8", whiteSpace: "nowrap" }}>
                        {new Date(ins.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      </td>
                      <td style={{ padding: "12px 14px", fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>{anomalyCount(ins)}</td>
                      <td style={{ padding: "12px 14px" }}>
                        {ms ? <span style={{ fontSize: 12, color: msColor, textTransform: "capitalize" }}>{ms}</span> : <span style={{ color: "#64748b", fontSize: 12 }}>—</span>}
                      </td>
                      <td style={{ padding: "12px 14px", fontSize: 13, fontWeight: 500, color: "#e2e8f0" }}>
                        {ins.status === "completed" ? numericRisk.toFixed(1) : "—"}
                      </td>
                      <td style={{ padding: "12px 14px", fontSize: 12, color: "rgba(226,232,240,0.92)" }}>
                        {ins.ndt_estimated_final_thickness_mm != null
                          ? `${ins.ndt_estimated_final_thickness_mm.toFixed(2)} mm${ins.ndt_estimated_loss_percent != null ? ` (sample -${ins.ndt_estimated_loss_percent.toFixed(1)}%)` : ""}`
                          : "—"}
                      </td>
                      <td style={{ padding: "12px 14px", fontSize: 12, color: "#94a3b8", textTransform: "capitalize" }}>{ins.status}</td>
                      <td style={{ padding: "12px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                        {ins.status === "completed" && (
                          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", alignItems: "center" }}>
                            <Link href={`/results/${encodeURIComponent(ins.inspection_id)}`} style={{ fontSize: 12, fontWeight: 600, color: "rgba(148,163,184,0.95)", textDecoration: "underline" }}>Results</Link>
                            <button type="button" onClick={async () => { try { await api.downloadAgenticPdf(ins.inspection_id); } catch { window.alert("Download failed. Make sure you are logged in."); } }} style={{ fontSize: 12, fontWeight: 600, color: "rgba(148,163,184,0.95)", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}>PDF</button>
                            <button
                              type="button"
                              onClick={() => openDeleteModal(ins)}
                              style={{ fontSize: 12, fontWeight: 600, color: "#f87171", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <p style={{ marginTop: 12, fontSize: 12, color: "rgba(148,163,184,0.9)", textAlign: "right" }}>
          {filtered.length} inspection{filtered.length !== 1 ? "s" : ""}
        </p>

      </div>

      <DeleteConfirmModal
        open={!!deleteModalInspection}
        onClose={() => setDeleteModalInspection(null)}
        title="Remove inspection from reports?"
        message="This cannot be undone."
        vesselLabel={deleteModalInspection ? `Vessel: ${deleteModalInspection.vessel_name ?? deleteModalInspection.inspection_id ?? deleteModalInspection.id}` : undefined}
        onConfirm={handleDeleteConfirm}
      />
    </PageShell>
  );
}
