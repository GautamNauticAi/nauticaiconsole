"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { PdfViewerModal } from "@/components/PdfViewerModal";
import { api } from "@/lib/api";
import type { Inspection, Severity } from "@/types";

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
  const [viewingPdf, setViewingPdf] = useState<Inspection | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const refreshList = useCallback((forceRefresh = false) => {
    api.listInspections(forceRefresh).then(setInspections).catch(() => setInspections([]));
  }, []);

  const handleDelete = useCallback(
    async (ins: Inspection) => {
      const id = String(ins.id);
      if (!id) return;
      if (!confirm("Remove this inspection from reports? This cannot be undone.")) return;
      setDeletingId(id);
      try {
        await api.deleteInspection(id);
        setInspections((prev) => prev.filter((i) => String(i.id) !== id));
      } catch (e) {
        alert(e instanceof Error ? e.message : "Failed to delete");
      } finally {
        setDeletingId(null);
      }
    },
    []
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
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
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 48px" }}>

        {/* Header */}
        <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 600, color: "#f1f5f9", marginBottom: 4 }}>Reports</h1>
            <p style={{ fontSize: 13, color: "#64748b" }}>Inspection history — filter, sort, export</p>
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

        {/* Filters bar */}
        <div style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          marginBottom: 20,
          background: "#1e293b",
          border: "1px solid #334155",
          borderRadius: 8,
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

        {/* Table */}
        <div style={{
          background: "#1e293b",
          border: "1px solid #334155",
          borderRadius: 8,
          overflow: "hidden",
        }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", minWidth: 800 }}>
              <colgroup>
                <col style={{ width: "14%" }} />
                <col style={{ width: "20%" }} />
                <col style={{ width: "11%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "9%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "18%" }} />
              </colgroup>
              <thead>
                <tr style={{ borderBottom: "1px solid #334155", background: "#0f172a" }}>
                  {["Vessel", "File", "Date", "Anomalies", "Severity", "Risk", "Status", "Actions"].map((h) => (
                    <th key={h} style={{
                      padding: "12px 16px",
                      textAlign: "left",
                      fontSize: 11,
                      fontWeight: 600,
                      color: "#64748b",
                      letterSpacing: "0.02em",
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={8} style={{ padding: "40px 16px", textAlign: "center", color: "#64748b", fontSize: 13 }}>Loading…</td>
                  </tr>
                )}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ padding: "40px 16px", textAlign: "center", color: "#64748b", fontSize: 13 }}>No inspections match your filters.</td>
                  </tr>
                )}
                {!loading && filtered.map((ins, i) => {
                  const ms = maxSeverity(ins.anomalies ?? []);
                  const msColor = ms ? severityColor[ms] : "#64748b";
                  const rowId = ins.inspection_id ?? String(ins.id);
                  const anyIns = ins as any;
                  const numericRisk = typeof anyIns.risk_score === "number" ? anyIns.risk_score : anyIns.risk_level === "HIGH" || anyIns.risk_level === "CRITICAL" ? 8.5 : anyIns.risk_level === "MEDIUM" ? 5.5 : anyIns.risk_level === "LOW" ? 3.0 : 1.0;
                  return (
                    <tr key={rowId} style={{ borderBottom: i < filtered.length - 1 ? "1px solid #334155" : "none" }}>
                      <td style={{ padding: "12px 16px", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 0 }}>
                        <span style={{ fontSize: 13, color: "#e2e8f0", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={ins.vessel_name ?? undefined}>{ins.vessel_name ?? "—"}</span>
                      </td>
                      <td style={{ padding: "12px 16px", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 0 }}>
                        <span style={{ fontSize: 12, color: "#94a3b8", fontFamily: "monospace", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={ins.file_name ?? undefined}>{ins.file_name ?? "—"}</span>
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 12, color: "#94a3b8" }}>
                        {new Date(ins.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>{anomalyCount(ins)}</td>
                      <td style={{ padding: "12px 16px" }}>
                        {ms ? <span style={{ fontSize: 12, color: msColor, textTransform: "capitalize" }}>{ms}</span> : <span style={{ color: "#64748b", fontSize: 12 }}>—</span>}
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 500, color: "#e2e8f0" }}>
                        {ins.status === "completed" ? numericRisk.toFixed(1) : "—"}
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 12, color: "#94a3b8", textTransform: "capitalize" }}>{ins.status}</td>
                      <td style={{ padding: "12px 16px" }}>
                        {ins.status === "completed" && (
                          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                            <button
                              type="button"
                              onClick={() => setViewingPdf(ins)}
                              style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}
                            >
                              View
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(ins)}
                              disabled={deletingId === String(ins.id)}
                              style={{ fontSize: 12, fontWeight: 600, color: "#f87171", background: "none", border: "none", cursor: deletingId === String(ins.id) ? "wait" : "pointer", padding: 0 }}
                            >
                              {deletingId === String(ins.id) ? "…" : "Remove"}
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

        <p style={{ marginTop: 12, fontSize: 12, color: "#64748b", textAlign: "right" }}>
          {filtered.length} inspection{filtered.length !== 1 ? "s" : ""}
        </p>

        {viewingPdf && (
          <PdfViewerModal
            inspection={viewingPdf}
            annotatedImage={null}
            onClose={() => setViewingPdf(null)}
          />
        )}
      </div>
    </PageShell>
  );
}
