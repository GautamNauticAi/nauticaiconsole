"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { api } from "@/lib/api";
import type { DetectResponse } from "@/types";

type Stage = "idle" | "selected" | "uploading" | "processing" | "done" | "error";

const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
];

/* ─── shared tokens ─────────────────────────────────────────────── */
const CARD: React.CSSProperties = {
  background: "rgba(8, 10, 30, 0.72)",
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
  borderRadius: 16,
  border: "1px solid rgba(129, 140, 248, 0.22)",
  boxShadow: "0 6px 28px rgba(0,0,0,0.50)",
  padding: 14,
};

const LABEL: React.CSSProperties = {
  display: "block",
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "rgba(186,230,255,0.50)",
  marginBottom: 5,
};

const INPUT_BASE: React.CSSProperties = {
  width: "100%",
  fontSize: 12,
  fontWeight: 500,
  background: "rgba(15,23,42,0.90)",
  border: "1px solid rgba(129,140,248,0.30)",
  borderRadius: 8,
  padding: "7px 11px",
  color: "#fff",
  outline: "none",
  fontFamily: "inherit",
  boxSizing: "border-box",
  appearance: "none",
  WebkitAppearance: "none",
};

const STEP_LABEL: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  color: "rgba(186,230,255,0.42)",
  textTransform: "uppercase",
  letterSpacing: "0.14em",
  marginBottom: 6,
};

export default function InspectPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [stage, setStage] = useState<Stage>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [vesselName, setVesselName] = useState("");
  const [notes, setNotes] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errMsg, setErrMsg] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("nauticai:token");
    if (!token) router.replace("/login");
  }, [router]);

  const acceptFile = useCallback((f: File) => {
    if (!ACCEPTED_TYPES.includes(f.type)) {
      setErrMsg("Only JPG, PNG, WebP or MP4 files are accepted.");
      return;
    }
    setFile(f);
    setStage("selected");
    if (f.type.startsWith("image/")) setPreview(URL.createObjectURL(f));
    else setPreview(null);
    setErrMsg("");
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragActive(false);
      const f = e.dataTransfer.files?.[0];
      if (f) acceptFile(f);
    },
    [acceptFile],
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (f) acceptFile(f);
  };

  const runInspection = async () => {
    if (!file) return;
    setStage("uploading");
    setProgress(0);
    setErrMsg("");
    const tick = window.setInterval(() => {
      setProgress((p) => Math.min(p + 12, 85));
    }, 180);
    try {
      const res: DetectResponse = await api.upload(file, vesselName || undefined);
      window.clearInterval(tick);
      setProgress(100);
      setStage("processing");
      await new Promise((resolve) => setTimeout(resolve, 1200));
      setStage("done");
      if (typeof window !== "undefined")
        window.sessionStorage.setItem("nauticai:lastInspection", JSON.stringify(res));
      setTimeout(() => {
        router.push(`/results/${encodeURIComponent(res.inspection_id)}?source=live`);
      }, 600);
    } catch (err) {
      window.clearInterval(tick);
      setStage("error");
      setErrMsg(err instanceof Error ? err.message : "Unexpected error");
    }
  };

  const reset = () => {
    setStage("idle");
    setFile(null);
    setPreview(null);
    setVesselName("");
    setNotes("");
    setProgress(0);
    setErrMsg("");
  };

  const isRunning = stage === "uploading" || stage === "processing";
  const canRun = stage === "selected";

  return (
    <PageShell>
      {/* ── outer wrapper: tight vertical padding to keep everything above the fold ── */}
      <div
        style={{
          maxWidth: 1140,
          margin: "0 auto",
          padding: "10px 24px 12px",
          /* prevent the page from ever being taller than the viewport minus navbar */
          maxHeight: "calc(100vh - 64px)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* ── Header ── */}
        <div style={{ marginBottom: 10, flexShrink: 0 }}>
          <p
            style={{
              fontSize: 9,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.20em",
              color: "rgba(186,230,255,0.45)",
              marginBottom: 3,
            }}
          >
            Detection Console
          </p>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: "-0.03em",
              lineHeight: 1.1,
              marginBottom: 4,
              background: "linear-gradient(90deg, #fff 55%, #a5b4fc)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Hull Inspection Workflow
          </h1>
          <p
            style={{
              fontSize: 11,
              color: "rgba(186,230,255,0.55)",
              lineHeight: 1.5,
            }}
          >
            Upload hull footage, add context, then run the YOLOv8 model to generate a structured inspection.
          </p>
        </div>

        {/* ── 3-column grid ── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0,1.9fr) minmax(0,1.6fr) minmax(0,1fr)",
            gap: 14,
            flex: 1,
            minHeight: 0,
          }}
        >
          {/* ═══ COL 1 — Upload ═══ */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 0 }}>
            <p style={STEP_LABEL}>Step 1 · Upload footage</p>

            {/* drop zone — fills remaining col height */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              style={{
                ...CARD,
                flex: 1,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                textAlign: "center",
                cursor: "pointer",
                border: dragActive
                  ? "1.5px solid rgba(129,140,248,0.90)"
                  : "1.5px dashed rgba(129,140,248,0.28)",
                background: dragActive
                  ? "rgba(59,130,246,0.12)"
                  : "radial-gradient(ellipse at top left, rgba(59,130,246,0.10) 0%, transparent 60%), rgba(8,10,30,0.72)",
                boxShadow: dragActive
                  ? "0 0 0 3px rgba(129,140,248,0.16), 0 12px 36px rgba(56,189,248,0.22)"
                  : "0 6px 28px rgba(0,0,0,0.50)",
                transition: "border-color 0.18s, box-shadow 0.18s, background 0.18s",
                padding: 16,
                gap: 0,
              }}
            >
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED_TYPES.join(",")}
                style={{ display: "none" }}
                onChange={handleFileChange}
              />

              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview}
                  alt="Preview"
                  style={{
                    maxWidth: "100%",
                    maxHeight: "75%",
                    borderRadius: 10,
                    objectFit: "cover",
                    border: "1px solid rgba(56,189,248,0.35)",
                  }}
                />
              ) : (
                <>
                  {/* upload icon */}
                  <div
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 14,
                      background: "rgba(129,140,248,0.12)",
                      border: "1px solid rgba(129,140,248,0.24)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 12,
                    }}
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(165,180,252,0.85)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </div>

                  <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, color: "rgba(226,232,240,0.95)" }}>
                    Drag &amp; drop hull media here
                  </p>
                  <p style={{ fontSize: 11, color: "rgba(148,163,184,0.75)", marginBottom: 12 }}>
                    or click to browse from device
                  </p>

                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
                    {["JPG · PNG · WebP", "MP4 / MOV", "< 500 MB"].map((t) => (
                      <span
                        key={t}
                        style={{
                          borderRadius: 999,
                          border: "1px solid rgba(129,140,248,0.35)",
                          background: "rgba(15,23,42,0.75)",
                          padding: "2px 9px",
                          fontSize: 9,
                          fontWeight: 600,
                          color: "rgba(191,219,254,0.82)",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>

                  {dragActive && (
                    <p style={{ marginTop: 10, fontSize: 11, color: "rgba(165,180,252,0.95)", fontWeight: 600 }}>
                      Drop to upload
                    </p>
                  )}
                </>
              )}
            </div>

            {/* file chip */}
            {file && (
              <div
                style={{
                  ...CARD,
                  padding: "8px 12px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexShrink: 0,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 11, color: "rgba(226,232,240,0.95)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>
                    {file.name}
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(148,163,184,0.80)", marginTop: 1 }}>
                    {(file.size / 1_000_000).toFixed(2)} MB · {file.type || "media"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={reset}
                  style={{
                    all: "unset",
                    fontSize: 10,
                    fontWeight: 600,
                    borderRadius: 999,
                    border: "1px solid rgba(248,113,113,0.65)",
                    padding: "3px 10px",
                    color: "rgba(254,202,202,0.95)",
                    background: "rgba(127,29,29,0.40)",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  Remove
                </button>
              </div>
            )}

            {/* progress */}
            {isRunning && (
              <div style={{ flexShrink: 0 }}>
                <div style={{ height: 4, borderRadius: 999, background: "rgba(15,23,42,0.90)", overflow: "hidden", marginBottom: 5 }}>
                  <div style={{ width: `${progress}%`, height: "100%", background: "linear-gradient(90deg, #38bdf8, #818cf8)", transition: "width 0.18s ease-out" }} />
                </div>
                <p style={{ fontSize: 10, color: "rgba(191,219,254,0.85)" }}>
                  {stage === "uploading" ? "Uploading footage to NautiCAI…" : "Running YOLOv8 hull model…"}
                </p>
              </div>
            )}

            {errMsg && <p style={{ fontSize: 11, color: "#fca5a5", flexShrink: 0 }}>{errMsg}</p>}
          </div>

          {/* ═══ COL 2 — Inspection Details + Run button ═══ */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 0 }}>
            <p style={STEP_LABEL}>Step 2 · Inspection details</p>

            <div style={{ ...CARD, flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
              <p
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  marginBottom: 12,
                  color: "rgba(226,232,240,0.96)",
                  borderBottom: "1px solid rgba(129,140,248,0.15)",
                  paddingBottom: 10,
                  flexShrink: 0,
                }}
              >
                Inspection Details
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minHeight: 0 }}>
                <div style={{ flexShrink: 0 }}>
                  <label style={LABEL}>Vessel Name</label>
                  <input
                    value={vesselName}
                    onChange={(e) => setVesselName(e.target.value)}
                    placeholder="e.g. MV Pacific Star"
                    style={INPUT_BASE}
                  />
                </div>

                <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                  <label style={LABEL}>Notes (optional)</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Port side scan, pre-dry dock…"
                    style={{
                      ...INPUT_BASE,
                      resize: "none",
                      flex: 1,
                      minHeight: 0,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Run button — full width, professional white toggle like dashboard CTA */}
            <button
              type="button"
              onClick={runInspection}
              disabled={!canRun}
              onMouseEnter={(e) => {
                if (!canRun) return;
                e.currentTarget.style.background = "rgba(15,23,42,0.98)";
                e.currentTarget.style.color = "#f9fafb";
              }}
              onMouseLeave={(e) => {
                if (!canRun) return;
                e.currentTarget.style.background = "#f9fafb";
                e.currentTarget.style.color = "#020617";
              }}
              style={{
                all: "unset",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                width: "100%",
                boxSizing: "border-box",
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "0.02em",
                color: canRun ? "#020617" : "rgba(148,163,184,0.65)",
                background: canRun ? "#f9fafb" : "rgba(15,23,50,0.60)",
                border: canRun
                  ? "1px solid rgba(148,163,184,0.45)"
                  : "1px solid rgba(148,163,184,0.18)",
                borderRadius: 999,
                padding: "11px 24px",
                cursor: canRun ? "pointer" : "not-allowed",
                opacity: canRun ? 1 : 0.7,
                boxShadow: canRun
                  ? "0 4px 22px rgba(15,23,42,0.75)"
                  : "none",
                transition: "all 0.18s ease",
                flexShrink: 0,
              }}
            >
              {canRun ? (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                  Run Inspection
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  Upload a file first
                </>
              )}
            </button>

          </div>


          {/* ═══ COL 3 — Tips + Model Settings ═══ */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 0 }}>
            {/* spacer label to align with col1/col2 */}
            <p style={{ ...STEP_LABEL, visibility: "hidden" }}>placeholder</p>

            {/* Tips */}
            <div style={{ ...CARD, flexShrink: 0 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#a78bfa", textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 10 }}>
                Tips
              </p>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 7 }}>
                {[
                  "Use clear, well‑lit underwater footage for best results.",
                  "Keep the camera steady — motion blur reduces accuracy.",
                  "Focus on the hull; avoid fish or debris‑heavy scenes.",
                ].map((tip) => (
                  <li key={tip} style={{ fontSize: 10, color: "rgba(186,230,255,0.78)", display: "flex", gap: 6, lineHeight: 1.5 }}>
                    <span style={{ color: "#7c3aed", flexShrink: 0, fontWeight: 700, fontSize: 12 }}>›</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>

            {/* Step 3 label */}
            <p style={STEP_LABEL}>Step 3 · Model configuration</p>

            {/* Model Settings */}
            <div style={{ ...CARD, flex: 1, minHeight: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: "rgba(226,232,240,0.96)", borderBottom: "1px solid rgba(129,140,248,0.15)", paddingBottom: 8 }}>
                Model Settings
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {[
                  { label: "Confidence threshold", value: "0.45" },
                  { label: "Model", value: "YOLOv8‑hull‑v2" },
                  { label: "Detection types", value: "All anomalies" },
                ].map((row) => (
                  <div
                    key={row.label}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "7px 0",
                      borderBottom: "1px solid rgba(129,140,248,0.08)",
                    }}
                  >
                    <span style={{ fontSize: 11, color: "rgba(186,230,255,0.62)" }}>{row.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#a78bfa", background: "rgba(109,40,217,0.16)", borderRadius: 5, padding: "2px 7px" }}>
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div >

      <style>{`
        input, textarea { font-family: inherit !important; color: #fff !important; }
        button { font-family: inherit; }
      `}</style>
    </PageShell >
  );
}
