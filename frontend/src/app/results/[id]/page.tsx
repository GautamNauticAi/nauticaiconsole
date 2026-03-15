"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { PageShell } from "@/components/PageShell";
import { ImageViewerModal } from "@/components/ImageViewerModal";
import { api } from "@/lib/api";
import type {
  Anomaly,
  Severity,
  DetectResponse,
  DetectionBox,
  Inspection,
} from "@/types";

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
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <div style={{ position: "relative", width: 80, height: 80 }}>
        <svg viewBox="0 0 120 120" style={{ width: 80, height: 80, transform: "rotate(-90deg)" }}>
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
          <span style={{ fontSize: "1.25rem", fontWeight: 800, color, lineHeight: 1 }}>{score.toFixed(1)}</span>
          <span style={{ fontSize: 8, fontWeight: 700, color: "rgba(186,230,255,0.50)", letterSpacing: "0.08em", textTransform: "uppercase" }}>/ 10</span>
        </div>
      </div>
      <span style={{
        fontSize: 10, fontWeight: 700, color,
        background: `${color}18`, border: `1px solid ${color}44`,
        borderRadius: 999, padding: "2px 10px",
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
  const searchParams = useSearchParams();
  const [liveDetect, setLiveDetect] = useState<DetectResponse | null>(null);
  const [liveBatch, setLiveBatch] = useState<DetectResponse[] | null>(null);
  const [batchIndex, setBatchIndex] = useState(0);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [hullRegion, setHullRegion] = useState("");
  const [shellThickness, setShellThickness] = useState("");
  const [imageViewerOpen, setImageViewerOpen] = useState(false);

  const fromLive = searchParams.get("source") === "live";
  const isBatch = searchParams.get("batch") === "1";

  useEffect(() => {
    if (!id) return;

    if (fromLive && typeof window !== "undefined") {
      if (isBatch) {
        const raw = sessionStorage.getItem("nauticai:lastInspectionBatch");
        if (raw) {
          try {
            const batch: DetectResponse[] = JSON.parse(raw);
            if (Array.isArray(batch) && batch.length > 0 && batch[0].inspection_id === id) {
              setLiveBatch(batch);
              setBatchIndex(0);
            }
          } catch {
            // ignore
          }
        }
      } else {
        const raw = sessionStorage.getItem("nauticai:lastInspection");
        if (raw) {
          try {
            const parsed: DetectResponse = JSON.parse(raw);
            if (parsed.inspection_id === id) setLiveDetect(parsed);
          } catch {
            // ignore
          }
        }
      }
    }

    api
      .getInspection(id)
      .then((ins) => {
        if (ins) setInspection(ins);
      })
      .catch(() => {});
  }, [fromLive, id, isBatch]);

  const currentLive = liveBatch?.length
    ? (liveBatch[batchIndex] ?? liveBatch[0])
    : liveDetect;

  const criticalCount = 0;
  const highCount = 0;

  const annotatedSrc =
    currentLive?.annotated_image || inspection?.annotated_image_url || null;

  const anomalies = inspection?.anomalies ?? [];
  const detections = currentLive?.detections ?? [];

  const effectiveRiskScore = (() => {
    if (typeof inspection?.risk_score === "number") {
      return inspection.risk_score;
    }
    const level = currentLive?.summary.risk_level;
    if (!level) return 0;
    switch (level) {
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
  })();

  return (
    <PageShell>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "20px 28px", minHeight: "100vh", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>

        {/* Header – compact */}
        <div style={{ marginBottom: 16, display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <Link href="/dashboard" style={{ fontSize: 12, color: "rgba(186,230,255,0.65)", textDecoration: "none" }}>← Dashboard</Link>
              <span style={{ color: "rgba(255,255,255,0.18)" }}>/</span>
              <span style={{ fontSize: 12, color: "rgba(186,230,255,0.55)" }}>Results</span>
            </div>
            <h1 style={{ fontSize: "1.35rem", fontWeight: 800, letterSpacing: "-0.03em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 420 }}>
              {inspection?.file_name ?? (currentLive ? api.inspectionFromDetectResponse(currentLive).file_name : null) ?? "Hull inspection results"}
            </h1>
            {(inspection || currentLive) && (
              <p style={{ fontSize: 12, color: "rgba(226,238,255,0.72)", marginTop: 6 }}>
                Inspection ID:{" "}
                <span style={{ fontFamily: "monospace" }}>
                  {inspection?.inspection_id ?? currentLive?.inspection_id}
                </span>
                {liveBatch && liveBatch.length > 1 && (
                  <span style={{ marginLeft: 8, color: "rgba(186,230,255,0.7)" }}>
                    · Image {batchIndex + 1} of {liveBatch.length} in this run
                  </span>
                )}{" "}
                · {new Date((inspection?.created_at ?? currentLive?.timestamp) ?? "").toLocaleString()}
              </p>
            )}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {id && (
              <button
                type="button"
                onClick={() => {
                  const ins = inspection ?? (currentLive ? api.inspectionFromDetectResponse(currentLive) : null);
                  if (ins) api.exportReportPdf(ins, currentLive?.annotated_image ?? undefined);
                }}
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#a78bfa",
                  background: "rgba(124,58,237,0.15)",
                  border: "1px solid rgba(124,58,237,0.35)",
                  borderRadius: 8,
                  padding: "8px 18px",
                  cursor: "pointer",
                }}
              >
                Download PDF
              </button>
            )}
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

        {/* Summary – 3 clear cards for clients */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 16,
            marginBottom: 20,
            flexShrink: 0,
          }}
        >
          {[
            {
              label: "Findings",
              value: currentLive?.summary.total ?? inspection?.detected_classes?.length ?? 0,
              sub: "items detected",
              color: "#e2e8f0",
            },
            {
              label: "Risk",
              value: currentLive?.summary.risk_level ?? inspection?.risk_level ?? "—",
              sub: "overall level",
              color: "#e2e8f0",
            },
            {
              label: "Inspection",
              value: inspection?.file_name ?? (currentLive ? api.inspectionFromDetectResponse(currentLive).file_name : null) ?? "—",
              sub: null,
              color: "#94a3b8",
            },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                background: "rgba(15,23,42,0.6)",
                border: "1px solid rgba(148,163,184,0.25)",
                borderRadius: 12,
                padding: "14px 16px",
              }}
            >
              <p
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: "rgba(226,232,240,0.7)",
                  marginBottom: 4,
                  letterSpacing: "0.01em",
                }}
              >
                {s.label}
              </p>
              <p
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: s.color,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  lineHeight: 1.3,
                }}
              >
                {s.value}
              </p>
              {s.sub && (
                <p style={{ fontSize: 11, color: "rgba(148,163,184,0.7)", marginTop: 2 }}>{s.sub}</p>
              )}
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.35fr 0.9fr", gap: 12, flex: 1, minHeight: 0 }}>
          {/* Annotated image – scaled to fit, click to open dialog */}
          <div style={{
            background: "rgba(5,5,20,0.78)", border: "1px solid rgba(148,163,184,0.40)",
            borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0,
          }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(148,163,184,0.3)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0", letterSpacing: "0.01em" }}>Detection result</span>
              <span style={{ fontSize: 12, color: "rgba(186,230,255,0.65)" }}>
                {liveBatch && liveBatch.length > 1 ? `Image ${batchIndex + 1} of ${liveBatch.length}` : "Click to enlarge"}
              </span>
            </div>
            <div style={{ padding: 10, position: "relative", flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {annotatedSrc ? (
                <>
                  {liveBatch && liveBatch.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setBatchIndex((i) => (i <= 0 ? liveBatch.length - 1 : i - 1))}
                      aria-label="Previous image"
                      style={{
                        position: "absolute",
                        left: 14,
                        top: "50%",
                        transform: "translateY(-50%)",
                        zIndex: 2,
                        width: 36,
                        height: 36,
                        borderRadius: "50%",
                        background: "rgba(30,41,59,0.95)",
                        border: "1px solid #475569",
                        color: "#e2e8f0",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 18,
                      }}
                    >
                      ‹
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setImageViewerOpen(true)}
                    style={{
                      position: "relative",
                      borderRadius: 10,
                      overflow: "hidden",
                      background: "radial-gradient(circle at 20% 0%, rgba(251,191,36,0.2), transparent 60%)",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      maxHeight: "min(42vh, 320px)",
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                  {currentLive ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={annotatedSrc}
                      alt="Annotated hull"
                      style={{
                        maxHeight: "min(42vh, 320px)",
                        width: "auto",
                        maxWidth: "100%",
                        objectFit: "contain",
                        display: "block",
                        borderRadius: 8,
                      }}
                    />
                  ) : (
                    <Image
                      src={annotatedSrc}
                      alt="Annotated hull"
                      width={800}
                      height={500}
                      style={{
                        maxHeight: "min(42vh, 320px)",
                        width: "auto",
                        maxWidth: "100%",
                        objectFit: "contain",
                        borderRadius: 8,
                      }}
                    />
                  )}
                  {anomalies.length > 0 && (
                    <svg
                      style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        pointerEvents: "none",
                        borderRadius: 8,
                      }}
                    >
                      {anomalies.map((a) => {
                        const c = severityColor[a.severity];
                        return (
                          <g key={a.id}>
                            <rect
                              x={`${(a.bbox.x1 / 800) * 100}%`}
                              y={`${(a.bbox.y1 / 500) * 100}%`}
                              width={`${((a.bbox.x2 - a.bbox.x1) / 800) * 100}%`}
                              height={`${((a.bbox.y2 - a.bbox.y1) / 500) * 100}%`}
                              fill="none"
                              stroke={c}
                              strokeWidth="2"
                            />
                            <rect
                              x={`${(a.bbox.x1 / 800) * 100}%`}
                              y={`calc(${(a.bbox.y1 / 500) * 100}% - 18px)`}
                              width="96"
                              height="16"
                              fill={c}
                              rx="3"
                            />
                            <text
                              x={`calc(${(a.bbox.x1 / 800) * 100}% + 4px)`}
                              y={`calc(${(a.bbox.y1 / 500) * 100}% - 5px)`}
                              fill="#fff"
                              fontSize="9"
                              fontWeight="700"
                              fontFamily="monospace"
                            >
                              {a.label} {(a.confidence * 100).toFixed(0)}%
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  )}
                </button>
                  {liveBatch && liveBatch.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setBatchIndex((i) => (i >= liveBatch.length - 1 ? 0 : i + 1))}
                      aria-label="Next image"
                      style={{
                        position: "absolute",
                        right: 14,
                        top: "50%",
                        transform: "translateY(-50%)",
                        zIndex: 2,
                        width: 36,
                        height: 36,
                        borderRadius: "50%",
                        background: "rgba(30,41,59,0.95)",
                        border: "1px solid #475569",
                        color: "#e2e8f0",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 18,
                      }}
                    >
                      ›
                    </button>
                  )}
                </>
              ) : (
                <div
                  style={{
                    height: "min(42vh, 280px)",
                    borderRadius: 10,
                    background: "rgba(15,23,42,0.90)",
                    border: "1px dashed rgba(148,163,184,0.60)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "rgba(186,230,255,0.75)",
                    fontSize: 12,
                    textAlign: "center",
                    padding: "0 16px",
                  }}
                >
                  Annotated image will appear here once detection returns.
                </div>
              )}
            </div>
          </div>

          {/* Right panel – compact */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>

            {/* UWILD NDT Sensor Inputs */}
            <div
              style={{
                background: "rgba(5,5,20,0.80)",
                border: "1px solid rgba(148,163,184,0.45)",
                borderRadius: 12,
                padding: "10px 14px",
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#e2e8f0",
                  display: "block",
                  marginBottom: 12,
                  letterSpacing: "0.01em",
                }}
              >
                Add details (optional)
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: "rgba(226,232,240,0.8)", display: "block", marginBottom: 6 }}>
                    Area
                  </label>
                  <input
                    type="text"
                    value={hullRegion}
                    onChange={(e) => setHullRegion(e.target.value)}
                    placeholder="e.g. Aft starboard"
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      fontSize: 12,
                      background: "rgba(15,23,42,0.9)",
                      border: "1px solid rgba(148,163,184,0.45)",
                      borderRadius: 8,
                      color: "#e2eeff",
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "rgba(226,232,240,0.8)", display: "block", marginBottom: 6 }}>
                    Shell thickness (mm)
                  </label>
                  <input
                    type="text"
                    value={shellThickness}
                    onChange={(e) => setShellThickness(e.target.value)}
                    placeholder="e.g. 12"
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      fontSize: 12,
                      background: "rgba(15,23,42,0.9)",
                      border: "1px solid rgba(148,163,184,0.45)",
                      borderRadius: 8,
                      color: "#e2eeff",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Risk */}
            <div
              style={{
                background: "rgba(15,23,42,0.6)",
                border: "1px solid rgba(148,163,184,0.25)",
                borderRadius: 12,
                padding: "16px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#e2e8f0",
                  marginBottom: 4,
                  letterSpacing: "0.01em",
                }}
              >
                Risk level
              </span>
              {(currentLive || inspection) ? (
                <RiskGauge score={effectiveRiskScore} />
              ) : (
                <span
                  style={{
                    fontSize: 12,
                    color: "rgba(186,230,255,0.45)",
                  }}
                >
                  Waiting for inspection details…
                </span>
              )}
            </div>

            {/* What we found – client-friendly list */}
            <div
              style={{
                background: "rgba(15,23,42,0.6)",
                border: "1px solid rgba(148,163,184,0.25)",
                borderRadius: 12,
                padding: "14px 16px",
                flex: 1,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#e2e8f0",
                  display: "block",
                  marginBottom: 12,
                  letterSpacing: "0.01em",
                }}
              >
                What we found
              </span>

              <div
                style={{
                  maxHeight: "min(220px, 28vh)",
                  overflowY: "auto",
                  overflowX: "hidden",
                  paddingRight: 4,
                }}
              >
              {anomalies.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {anomalies.map((a) => (
                    <div
                      key={a.id}
                      style={{
                        padding: "12px 14px",
                        borderRadius: 10,
                        background: "rgba(30,41,59,0.5)",
                        border: "1px solid rgba(148,163,184,0.2)",
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: 14, color: "#e2e8f0", textTransform: "capitalize" }}>
                        {a.label}
                      </div>
                      <div style={{ fontSize: 12, color: "rgba(226,232,240,0.75)", marginTop: 4 }}>
                        {a.severity} severity
                      </div>
                    </div>
                  ))}
                </div>
              ) : detections.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {detections.map((d, idx) => {
                    const speciesLine = d.species?.length
                      ? d.species.map((s) => s.class_name).join(", ")
                      : null;
                    return (
                      <div
                        key={idx}
                        style={{
                          padding: "12px 14px",
                          borderRadius: 10,
                          background: "rgba(30,41,59,0.5)",
                          border: "1px solid rgba(148,163,184,0.2)",
                        }}
                      >
                        <div style={{ fontWeight: 600, fontSize: 14, color: "#e2e8f0", textTransform: "capitalize" }}>
                          {d.class_name}
                        </div>
                        <div style={{ fontSize: 12, color: "rgba(226,232,240,0.75)", marginTop: 4 }}>
                          {speciesLine ? `Species: ${speciesLine}` : "Detected"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "28px 0" }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>✓</div>
                  <p style={{ fontSize: 14, color: "rgba(226,232,240,0.7)" }}>
                    No issues detected
                  </p>
                </div>
              )}
              </div>
            </div>

          </div>
        </div>
      </div>

      {imageViewerOpen && (liveBatch?.length ? liveBatch.map((r) => r.annotated_image) : annotatedSrc ? [annotatedSrc] : []).length > 0 && (
        <ImageViewerModal
          images={liveBatch?.length ? liveBatch.map((r) => r.annotated_image) : [annotatedSrc!]}
          initialIndex={liveBatch?.length ? batchIndex : 0}
          title="Annotated output"
          onClose={() => setImageViewerOpen(false)}
        />
      )}
    </PageShell>
  );
}
