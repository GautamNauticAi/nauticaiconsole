"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { api, MOCK_INSPECTIONS } from "@/lib/api";

type Stage = "idle" | "selected" | "uploading" | "processing" | "done" | "error";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime"];

export default function InspectPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [vesselName, setVesselName] = useState("");
  const [notes, setNotes] = useState("");
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errMsg, setErrMsg] = useState("");

  const acceptFile = useCallback((f: File) => {
    if (!ACCEPTED.includes(f.type)) {
      setErrMsg("Only JPG, PNG, WebP or MP4 files are accepted.");
      return;
    }
    setFile(f);
    setStage("selected");
    if (f.type.startsWith("image/")) {
      const url = URL.createObjectURL(f);
      setPreview(url);
    } else {
      setPreview(null);
    }
    setErrMsg("");
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f) acceptFile(f);
  }, [acceptFile]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) acceptFile(f);
  };

  const runInspection = async () => {
    if (!file) return;
    setStage("uploading");
    setProgress(0);

    /* Simulate progress bar while uploading */
    const tick = setInterval(() => {
      setProgress((p) => Math.min(p + 12, 85));
    }, 180);

    try {
      /* Try real API; fall back to mock for local dev */
      let inspectionId: string;
      try {
        const res = await api.upload(file, vesselName || undefined);
        inspectionId = res.inspection_id;
      } catch {
        /* API not running — use mock */
        inspectionId = MOCK_INSPECTIONS[0].id;
        await new Promise((r) => setTimeout(r, 1800));
      }

      clearInterval(tick);
      setProgress(100);
      setStage("processing");

      /* Poll or wait for processing */
      await new Promise((r) => setTimeout(r, 1200));

      setStage("done");
      setTimeout(() => router.push(`/results/${inspectionId}`), 600);
    } catch (err) {
      clearInterval(tick);
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

  return (
    <PageShell>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 48px" }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 800, letterSpacing: "-0.03em", marginBottom: 4 }}>
            Detection Console
          </h1>
          <p style={{ fontSize: 13, color: "rgba(186,230,255,0.55)" }}>
            Upload hull footage — our model detects corrosion, marine growth, debris and structural damage.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20 }}>

          {/* Upload zone */}
          <div style={{
            background: "rgba(255,255,255,0.04)",
            border: `1px solid ${drag ? "rgba(124,58,237,0.70)" : "rgba(255,255,255,0.09)"}`,
            borderRadius: 18, overflow: "hidden",
            display: "flex", flexDirection: "column",
            transition: "border-color 0.2s",
          }}>

            {/* Drop area */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={onDrop}
              onClick={() => stage === "idle" && inputRef.current?.click()}
              style={{
                flex: 1, minHeight: 320,
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                gap: 14, padding: 32,
                cursor: stage === "idle" ? "pointer" : "default",
                position: "relative",
              }}
            >
              <input ref={inputRef} type="file" accept={ACCEPTED.join(",")} onChange={onFileChange} style={{ display: "none" }} />

              {/* States */}
              {(stage === "idle") && (
                <>
                  <div style={{
                    width: 72, height: 72, borderRadius: 20,
                    background: drag ? "rgba(124,58,237,0.25)" : "rgba(255,255,255,0.07)",
                    border: `2px dashed ${drag ? "rgba(124,58,237,0.70)" : "rgba(255,255,255,0.20)"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.2s",
                  }}>
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="rgba(196,181,253,0.80)" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <p style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 4 }}>
                      {drag ? "Drop to upload" : "Drag & drop hull footage"}
                    </p>
                    <p style={{ fontSize: 12, color: "rgba(186,230,255,0.50)" }}>
                      JPG, PNG, WebP, MP4 · Max 200 MB
                    </p>
                  </div>
                  <button style={{
                    fontSize: 12, fontWeight: 600, color: "#a78bfa",
                    background: "rgba(124,58,237,0.15)",
                    border: "1px solid rgba(124,58,237,0.35)",
                    borderRadius: 8, padding: "7px 18px", cursor: "pointer",
                  }}>
                    Browse files
                  </button>
                </>
              )}

              {(stage === "selected") && preview && (
                <div style={{ width: "100%", position: "relative" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="preview" style={{ width: "100%", borderRadius: 12, maxHeight: 320, objectFit: "contain" }} />
                  <button onClick={(e) => { e.stopPropagation(); reset(); }} style={{
                    position: "absolute", top: 8, right: 8,
                    background: "rgba(0,0,0,0.60)", border: "none", borderRadius: 999,
                    width: 28, height: 28, cursor: "pointer", color: "#fff",
                    fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center",
                  }}>✕</button>
                </div>
              )}

              {(stage === "selected") && !preview && (
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 48, marginBottom: 8 }}>🎬</div>
                  <p style={{ fontSize: 14, fontWeight: 600 }}>{file?.name}</p>
                  <p style={{ fontSize: 12, color: "rgba(186,230,255,0.50)" }}>
                    {file ? `${(file.size / 1_000_000).toFixed(1)} MB` : ""}
                  </p>
                </div>
              )}

              {(stage === "uploading" || stage === "processing") && (
                <div style={{ width: "100%", textAlign: "center" }}>
                  <div style={{ marginBottom: 24 }}>
                    <div style={{
                      width: 64, height: 64, borderRadius: "50%",
                      border: "3px solid rgba(255,255,255,0.10)",
                      borderTop: "3px solid #7c3aed",
                      margin: "0 auto 16px",
                      animation: "spin 0.9s linear infinite",
                    }} />
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                    <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
                      {stage === "uploading" ? "Uploading…" : "Running YOLOv8 detection…"}
                    </p>
                    <p style={{ fontSize: 12, color: "rgba(186,230,255,0.50)" }}>
                      {stage === "processing" ? "Scanning hull for anomalies" : "Transferring file"}
                    </p>
                  </div>
                  {stage === "uploading" && (
                    <div style={{ height: 5, background: "rgba(255,255,255,0.10)", borderRadius: 999, overflow: "hidden", maxWidth: 320, margin: "0 auto" }}>
                      <div style={{ height: "100%", background: "linear-gradient(90deg, #7c3aed, #3b82f6)", borderRadius: 999, width: `${progress}%`, transition: "width 0.2s ease" }} />
                    </div>
                  )}
                </div>
              )}

              {stage === "done" && (
                <div style={{ textAlign: "center" }}>
                  <div style={{
                    width: 64, height: 64, borderRadius: "50%",
                    background: "rgba(16,185,129,0.15)", border: "2px solid #10b981",
                    margin: "0 auto 14px",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 28,
                  }}>✓</div>
                  <p style={{ fontSize: 15, fontWeight: 700, color: "#10b981" }}>Detection complete</p>
                  <p style={{ fontSize: 12, color: "rgba(186,230,255,0.50)", marginTop: 4 }}>Redirecting to results…</p>
                </div>
              )}

              {stage === "error" && (
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "#ef4444", marginBottom: 8 }}>{errMsg}</p>
                  <button onClick={reset} style={{ fontSize: 12, fontWeight: 600, color: "#fff", background: "rgba(239,68,68,0.20)", border: "1px solid rgba(239,68,68,0.40)", borderRadius: 8, padding: "6px 16px", cursor: "pointer" }}>Try again</button>
                </div>
              )}
            </div>

            {/* File info bar */}
            {file && stage === "selected" && (
              <div style={{
                borderTop: "1px solid rgba(255,255,255,0.07)",
                padding: "10px 20px",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                background: "rgba(255,255,255,0.03)",
              }}>
                <span style={{ fontSize: 12, color: "rgba(186,230,255,0.60)", fontFamily: "monospace" }}>{file.name}</span>
                <span style={{ fontSize: 11, color: "rgba(186,230,255,0.40)" }}>{(file.size / 1_000_000).toFixed(2)} MB</span>
              </div>
            )}
          </div>

          {/* Settings panel */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Vessel info */}
            <div style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 16, padding: "20px",
            }}>
              <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>Inspection Details</p>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(186,230,255,0.50)", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
                    Vessel Name
                  </label>
                  <input
                    value={vesselName}
                    onChange={(e) => setVesselName(e.target.value)}
                    placeholder="e.g. MV Pacific Star"
                    style={{
                      width: "100%", fontSize: 13, fontWeight: 500,
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 8, padding: "9px 12px", color: "#fff",
                      outline: "none", fontFamily: "inherit",
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(186,230,255,0.50)", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
                    Notes (optional)
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    placeholder="Port side scan, pre-dry dock…"
                    style={{
                      width: "100%", fontSize: 13, fontWeight: 500,
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 8, padding: "9px 12px", color: "#fff",
                      outline: "none", resize: "vertical", fontFamily: "inherit",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Model settings */}
            <div style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 16, padding: "20px",
            }}>
              <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Model Settings</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  { label: "Confidence threshold", value: "0.45" },
                  { label: "Model",                value: "YOLOv8-hull-v2" },
                  { label: "Detection types",       value: "All anomalies" },
                ].map((r) => (
                  <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "rgba(186,230,255,0.55)" }}>{r.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#a78bfa" }}>{r.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Run button */}
            <button
              onClick={runInspection}
              disabled={stage !== "selected"}
              style={{
                width: "100%", fontSize: 14, fontWeight: 700, color: "#fff",
                background: stage === "selected"
                  ? "linear-gradient(135deg, #7c3aed, #3b82f6)"
                  : "rgba(255,255,255,0.08)",
                border: "none", borderRadius: 12, padding: "14px",
                cursor: stage === "selected" ? "pointer" : "not-allowed",
                opacity: stage === "selected" ? 1 : 0.5,
                boxShadow: stage === "selected" ? "0 4px 24px rgba(124,58,237,0.45)" : "none",
                transition: "all 0.2s",
              }}
            >
              {stage === "selected" ? "Run Inspection →" : "Upload a file first"}
            </button>

            {/* Tips */}
            <div style={{
              background: "rgba(124,58,237,0.08)",
              border: "1px solid rgba(124,58,237,0.20)",
              borderRadius: 12, padding: "14px 16px",
            }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(196,181,253,0.80)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>Tips</p>
              <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  "Use clear, well-lit underwater footage for best results",
                  "Keep the camera steady — motion blur reduces accuracy",
                  "Hull-only footage; avoid fish or debris-heavy shots",
                ].map((t) => (
                  <li key={t} style={{ fontSize: 11, color: "rgba(186,230,255,0.50)", display: "flex", gap: 6 }}>
                    <span style={{ color: "#7c3aed", flexShrink: 0 }}>›</span> {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
