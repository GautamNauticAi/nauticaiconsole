"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { api } from "@/lib/api";
import type { AgenticInspectResponse } from "@/types";

/** Annotated hull image (live preview) fetched with auth so backend returns the image. imageIndex for batch (0, 1, 2, ...). */
function AnnotatedPreview({
  vesselId,
  imageIndex = 0,
}: {
  vesselId: string;
  imageIndex?: number;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    let revoked = false;
    let createdUrl: string | null = null;
    setLoading(true);
    setImgError(false);
    api
      .fetchAnnotatedImageBlobUrl(vesselId, imageIndex)
      .then((url) => {
        createdUrl = url;
        if (!revoked) {
          setBlobUrl(url);
          setLoading(false);
        } else {
          URL.revokeObjectURL(url);
        }
      })
      .catch(() => {
        if (!revoked) {
          setImgError(true);
          setLoading(false);
        }
      });
    return () => {
      revoked = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [vesselId, imageIndex]);

  const fallback = (
    <div
      style={{
        height: "min(42vh, 280px)",
        borderRadius: 10,
        background: "rgba(15,23,42,0.90)",
        border: "1px dashed rgba(148,163,184,0.60)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        color: "rgba(186,230,255,0.75)",
        fontSize: 12,
        textAlign: "center",
        padding: "0 16px",
      }}
    >
      <span style={{ fontSize: 28, marginBottom: 8 }}>✓</span>
      <p style={{ margin: 0 }}>Inspection complete</p>
      <p style={{ margin: "4px 0 0", fontSize: 11, color: "rgba(186,230,255,0.6)" }}>
        Download the official PDF for full details and audit trail.
      </p>
    </div>
  );

  if (loading) {
    return (
      <div style={{ minHeight: "min(42vh, 280px)", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(186,230,255,0.7)", fontSize: 13 }}>
        Loading image…
      </div>
    );
  }
  if (imgError || !blobUrl) return fallback;

  return (
    <img
      src={blobUrl}
      alt="Annotated hull inspection"
      style={{
        maxHeight: "min(42vh, 320px)",
        width: "auto",
        maxWidth: "100%",
        objectFit: "contain",
        borderRadius: 8,
        display: "block",
      }}
      onError={() => setImgError(true)}
    />
  );
}

function RiskGauge({ requiresCleaning }: { requiresCleaning: boolean }) {
  const color = requiresCleaning ? "#dc2626" : "#10b981";
  const score = requiresCleaning ? 8.5 : 2;
  const pct = (score / 10) * 100;
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
        {requiresCleaning ? "Cleaning required" : "Acceptable"}
      </span>
    </div>
  );
}

export default function ResultsPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const [agenticReport, setAgenticReport] = useState<AgenticInspectResponse | null>(null);
  const [agenticBatch, setAgenticBatch] = useState<AgenticInspectResponse[] | null>(null);
  const [batchIndex, setBatchIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hullRegion, setHullRegion] = useState("");
  const [shellThickness, setShellThickness] = useState("");

  const fromLive = searchParams.get("source") === "live";
  const isBatch = searchParams.get("batch") === "1";

  const normalizeVesselId = (s: string) => (s || "").trim().replace(/\s+/g, "_");

  useEffect(() => {
    if (!id) return;

    if (fromLive && typeof window !== "undefined") {
      const normId = normalizeVesselId(id);
      if (isBatch) {
        const raw = sessionStorage.getItem("nauticai:lastAgenticInspectionBatch");
        if (raw) {
          try {
            const batch: AgenticInspectResponse[] = JSON.parse(raw);
            if (Array.isArray(batch) && batch.length > 0 && normalizeVesselId(batch[0].metadata.vessel_id) === normId) {
              setAgenticBatch(batch);
              setBatchIndex(0);
              setAgenticReport(batch[0]);
              setLoading(false);
              return;
            }
          } catch {
            // ignore
          }
        }
      } else {
        const raw = sessionStorage.getItem("nauticai:lastAgenticInspection");
        if (raw) {
          try {
            const parsed: AgenticInspectResponse = JSON.parse(raw);
            if (normalizeVesselId(parsed.metadata.vessel_id) === normId) {
              setAgenticReport(parsed);
              setLoading(false);
              return;
            }
          } catch {
            // ignore
          }
        }
      }
    }

    // When opening from Dashboard/Reports, fetch all reports so multi-image shows slider + correct metrics
    api.getAgenticReportBatch(id).then((reports) => {
      if (reports.length > 1) {
        setAgenticBatch(reports);
        setAgenticReport(reports[0]);
      } else if (reports.length === 1) {
        setAgenticReport(reports[0]);
      } else {
        api.getAgenticReport(id).then((report) => {
          if (report) setAgenticReport(report);
        }).catch(() => {});
      }
      setLoading(false);
    }).catch(() => {
      api.getAgenticReport(id).then((report) => {
        if (report) setAgenticReport(report);
      }).catch(() => {});
      setLoading(false);
    });
  }, [fromLive, id, isBatch]);

  const currentReport = agenticBatch?.length
    ? (agenticBatch[batchIndex] ?? agenticBatch[0])
    : agenticReport;

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
              {currentReport ? `${currentReport.metadata.vessel_id} — Hull inspection` : "Hull inspection results"}
            </h1>
            {currentReport && (
              <p style={{ fontSize: 12, color: "rgba(226,238,255,0.72)", marginTop: 6 }}>
                Vessel ID:{" "}
                <span style={{ fontFamily: "monospace" }}>
                  {currentReport.metadata.vessel_id}
                </span>
                {agenticBatch && agenticBatch.length > 1 && (
                  <span style={{ marginLeft: 8, color: "rgba(186,230,255,0.7)" }}>
                    · Image {batchIndex + 1} of {agenticBatch.length} in this run
                  </span>
                )}{" "}
                · {new Date(currentReport.metadata.inspection_timestamp).toLocaleString()}
              </p>
            )}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {id && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await api.downloadAgenticPdf(id);
                  } catch (e) {
                    console.error(e);
                    if (typeof window !== "undefined") window.alert("Download failed. Make sure you are logged in.");
                  }
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
              label: "Hull coverage",
              value: currentReport ? `${currentReport.ai_vision_metrics.total_hull_coverage_percentage.toFixed(1)}%` : "—",
              sub: "fouling area",
              color: "#e2e8f0",
            },
            {
              label: "IMO rating",
              value: currentReport?.compliance_result.official_imo_rating ?? "—",
              sub: "compliance",
              color: "#e2e8f0",
            },
            {
              label: "Condition",
              value: currentReport?.ai_vision_metrics.severity ?? "—",
              sub: currentReport ? `${currentReport.ai_vision_metrics.total_detections} area(s) identified` : null,
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
              <span style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0", letterSpacing: "0.01em" }}>Inspection report</span>
              {agenticBatch && agenticBatch.length > 1 && (
                <span style={{ fontSize: 12, color: "rgba(186,230,255,0.65)" }}>
                  Image {batchIndex + 1} of {agenticBatch.length}
                </span>
              )}
            </div>
            <div style={{ padding: 10, position: "relative", flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {loading ? (
                <div style={{ color: "rgba(186,230,255,0.75)", fontSize: 12 }}>Loading report…</div>
              ) : currentReport && id ? (
                <>
                  {agenticBatch && agenticBatch.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setBatchIndex((i) => (i <= 0 ? agenticBatch.length - 1 : i - 1))}
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
                  <AnnotatedPreview vesselId={id} imageIndex={batchIndex} />
                  {agenticBatch && agenticBatch.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setBatchIndex((i) => (i >= agenticBatch.length - 1 ? 0 : i + 1))}
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
                <div style={{ color: "rgba(186,230,255,0.75)", fontSize: 12 }}>No report data for this vessel.</div>
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
              {currentReport ? (
                <RiskGauge requiresCleaning={currentReport.compliance_result.requires_cleaning} />
              ) : (
                <span
                  style={{
                    fontSize: 12,
                    color: "rgba(186,230,255,0.45)",
                  }}
                >
                  {loading ? "Loading…" : "No report data"}
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
              {currentReport ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div
                    style={{
                      padding: "12px 14px",
                      borderRadius: 10,
                      background: "rgba(30,41,59,0.5)",
                      border: "1px solid rgba(148,163,184,0.2)",
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 14, color: "#e2e8f0" }}>
                      {currentReport.compliance_result.official_imo_rating}
                    </div>
                    <div style={{ fontSize: 12, color: "rgba(226,232,240,0.75)", marginTop: 4 }}>
                      {currentReport.compliance_result.recommended_action}
                    </div>
                  </div>
                  <div
                    style={{
                      padding: "12px 14px",
                      borderRadius: 10,
                      background: "rgba(30,41,59,0.5)",
                      border: "1px solid rgba(148,163,184,0.2)",
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 14, color: "#e2e8f0" }}>
                      {currentReport.ai_vision_metrics.total_detections} fouling area(s) identified
                    </div>
                    <div style={{ fontSize: 12, color: "rgba(226,232,240,0.75)", marginTop: 4 }}>
                      Hull coverage: {currentReport.ai_vision_metrics.total_hull_coverage_percentage.toFixed(1)}% · {currentReport.ai_vision_metrics.severity} severity
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "28px 0" }}>
                  <p style={{ fontSize: 14, color: "rgba(226,232,240,0.7)" }}>
                    {loading ? "Loading…" : "No report data"}
                  </p>
                </div>
              )}
              </div>
            </div>

          </div>
        </div>
      </div>

    </PageShell>
  );
}
