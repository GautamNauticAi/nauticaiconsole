"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { PageShell } from "@/components/PageShell";
import { MOCK_INSPECTIONS, api } from "@/lib/api";
import type { Anomaly, Severity } from "@/types";

const severityColor: Record<Severity, string> = {
  low:      "#10b981",
  medium:   "#f59e0b",
  high:     "#ef4444",
  critical: "#dc2626",
};

const severityBg: Record<Severity, string> = {
  low:      "rgba(16,185,129,0.12)",
  medium:   "rgba(245,158,11,0.12)",
  high:     "rgba(239,68,68,0.12)",
  critical: "rgba(220,38,38,0.15)",
};

const anomalyIcon: Record<string, string> = {
  corrosion:     "🔴",
  marine_growth: "🟣",
  hull_debris:   "🟠",
  dents_damage:  "🔵",
  clean:         "🟢",
};

function RiskGauge({ score }: { score: number }) {
  const pct = (score / 10) * 100;
  const color = score >= 8 ? "#dc2626" : score >= 5 ? "#f59e0b" : "#10b981";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      <div style={{ position: "relative", width: 110, height: 110 }}>
        <svg viewBox="0 0 120 120" style={{ width: 110, height: 110, transform: "rotate(-90deg)" }}>
          <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
          <circle cx="60" cy="60" r="50" fill="none" stroke={color} strokeWidth="10"
            strokeDasharray={`${pct * 3.14} 314`}
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray 1s ease" }} />
        </svg>
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ fontSize: "1.6rem", fontWeight: 800, color, lineHeight: 1 }}>{score.toFixed(1)}</span>
          <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(186,230,255,0.50)", letterSpacing: "0.1em", textTransform: "uppercase" }}>/ 10</span>
        </div>
      </div>
      <span style={{
        fontSize: 11, fontWeight: 700, color,
        background: `${color}18`, border: `1px solid ${color}44`,
        borderRadius: 999, padding: "3px 12px",
      }}>
        {score >= 8 ? "Critical Risk" : score >= 5 ? "High Risk" : "Low Risk"}
      </span>
    </div>
  );
}

function AnomalyCard({ a }: { a: Anomaly }) {
  const color = severityColor[a.severity];
  const bg    = severityBg[a.severity];
  return (
    <div style={{
      background: bg,
      border: `1px solid ${color}30`,
      borderRadius: 12, padding: "12px 14px",
      display: "flex", gap: 12, alignItems: "flex-start",
    }}>
      <span style={{ fontSize: 20, flexShrink: 0 }}>{anomalyIcon[a.type] ?? "⚪"}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{a.label}</span>
          <span style={{
            fontSize: 10, fontWeight: 700, color,
            background: `${color}22`, border: `1px solid ${color}44`,
            borderRadius: 999, padding: "2px 8px", textTransform: "capitalize",
          }}>{a.severity}</span>
        </div>
        <div style={{ display: "flex", gap: 14 }}>
          <span style={{ fontSize: 11, color: "rgba(186,230,255,0.55)" }}>
            Confidence: <strong style={{ color: "#fff" }}>{(a.confidence * 100).toFixed(0)}%</strong>
          </span>
          <span style={{ fontSize: 11, color: "rgba(186,230,255,0.55)" }}>
            Area: <strong style={{ color: "#fff" }}>{a.area_percentage.toFixed(1)}%</strong>
          </span>
        </div>
        <div style={{ marginTop: 6, height: 3, borderRadius: 999, background: "rgba(255,255,255,0.10)", overflow: "hidden" }}>
          <div style={{ height: "100%", background: color, borderRadius: 999, width: `${a.confidence * 100}%` }} />
        </div>
      </div>
    </div>
  );
}

export default function ResultsPage() {
  const { id } = useParams<{ id: string }>();
  const inspection = MOCK_INSPECTIONS.find((i) => i.id === id) ?? MOCK_INSPECTIONS[0];

  const criticalCount = inspection.anomalies.filter((a) => a.severity === "critical").length;
  const highCount     = inspection.anomalies.filter((a) => a.severity === "high").length;

  return (
    <PageShell>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 48px" }}>

        {/* Header */}
        <div style={{ marginBottom: 28, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <Link href="/dashboard" style={{ fontSize: 12, color: "rgba(186,230,255,0.50)", textDecoration: "none" }}>← Dashboard</Link>
              <span style={{ color: "rgba(255,255,255,0.20)" }}>/</span>
              <span style={{ fontSize: 12, color: "rgba(186,230,255,0.50)" }}>Results</span>
            </div>
            <h1 style={{ fontSize: "1.75rem", fontWeight: 800, letterSpacing: "-0.03em" }}>
              {inspection.vessel_name ?? "Unnamed Vessel"}
            </h1>
            <p style={{ fontSize: 12, color: "rgba(186,230,255,0.50)", marginTop: 3 }}>
              Inspection ID: <span style={{ fontFamily: "monospace" }}>{inspection.id}</span> · {new Date(inspection.created_at).toLocaleString()}
            </p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <a href={api.exportReportUrl(inspection.id)} target="_blank" rel="noreferrer" style={{
              fontSize: 13, fontWeight: 600, color: "#a78bfa",
              background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.35)",
              borderRadius: 8, padding: "8px 18px", textDecoration: "none",
            }}>
              Export PDF ↗
            </a>
            <Link href="/inspect" style={{
              fontSize: 13, fontWeight: 700, color: "#fff",
              background: "linear-gradient(135deg, #7c3aed, #3b82f6)",
              borderRadius: 8, padding: "8px 18px", textDecoration: "none",
              boxShadow: "0 2px 16px rgba(124,58,237,0.38)",
            }}>
              New Inspection
            </Link>
          </div>
        </div>

        {/* Summary strip */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 24,
        }}>
          {[
            { label: "Anomalies",      value: inspection.anomalies.length,            color: "#f59e0b" },
            { label: "Critical",       value: criticalCount,                           color: "#dc2626" },
            { label: "High Risk",      value: highCount,                               color: "#ef4444" },
            { label: "Hull Coverage",  value: `${inspection.hull_coverage}%`,          color: "#10b981" },
            { label: "File",           value: inspection.file_name ?? "—",             color: "#94a3b8" },
          ].map((s) => (
            <div key={s.label} style={{
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 12, padding: "14px 16px",
            }}>
              <p style={{ fontSize: 10, fontWeight: 600, color: "rgba(186,230,255,0.45)", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 4 }}>{s.label}</p>
              <p style={{ fontSize: 16, fontWeight: 800, color: s.color, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.value}</p>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 20 }}>

          {/* Annotated image */}
          <div style={{
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 16, overflow: "hidden",
          }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Annotated Hull Image</span>
              <span style={{ fontSize: 11, color: "rgba(186,230,255,0.45)" }}>Bounding boxes shown for each anomaly</span>
            </div>
            <div style={{ padding: 20, position: "relative" }}>
              {inspection.annotated_image_url ? (
                <div style={{ position: "relative", borderRadius: 10, overflow: "hidden" }}>
                  <Image
                    src={inspection.annotated_image_url}
                    alt="Annotated hull"
                    width={800} height={500}
                    style={{ width: "100%", height: "auto", display: "block", borderRadius: 10 }}
                  />
                  {/* Overlay bounding boxes */}
                  <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
                    {inspection.anomalies.map((a) => {
                      const c = severityColor[a.severity];
                      return (
                        <g key={a.id}>
                          <rect
                            x={`${(a.bbox.x1 / 800) * 100}%`}
                            y={`${(a.bbox.y1 / 500) * 100}%`}
                            width={`${((a.bbox.x2 - a.bbox.x1) / 800) * 100}%`}
                            height={`${((a.bbox.y2 - a.bbox.y1) / 500) * 100}%`}
                            fill="none" stroke={c} strokeWidth="2"
                          />
                          <rect
                            x={`${(a.bbox.x1 / 800) * 100}%`}
                            y={`calc(${(a.bbox.y1 / 500) * 100}% - 18px)`}
                            width="90" height="16"
                            fill={c} rx="3"
                          />
                          <text
                            x={`calc(${(a.bbox.x1 / 800) * 100}% + 4px)`}
                            y={`calc(${(a.bbox.y1 / 500) * 100}% - 5px)`}
                            fill="#fff" fontSize="9" fontWeight="700" fontFamily="monospace"
                          >
                            {a.label} {(a.confidence * 100).toFixed(0)}%
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              ) : (
                <div style={{
                  height: 300, borderRadius: 10,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px dashed rgba(255,255,255,0.15)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "rgba(186,230,255,0.35)", fontSize: 13,
                }}>
                  Annotated image not available
                </div>
              )}
            </div>
          </div>

          {/* Right panel */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Risk gauge */}
            <div style={{
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 16, padding: "20px",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
            }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(186,230,255,0.50)", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 8 }}>Risk Score</span>
              <RiskGauge score={inspection.risk_score} />
            </div>

            {/* Anomaly list */}
            <div style={{
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 16, padding: "16px 18px", flex: 1,
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 14 }}>Detected Anomalies</span>
              {inspection.anomalies.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px 0" }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                  <p style={{ fontSize: 13, color: "rgba(186,230,255,0.55)" }}>No anomalies detected</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {inspection.anomalies.map((a) => <AnomalyCard key={a.id} a={a} />)}
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </PageShell>
  );
}
