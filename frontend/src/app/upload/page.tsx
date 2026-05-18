"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import {
  uploadFilesToS3Ingest,
  type AwsIngestSource,
} from "@/lib/awsIngest";

type Stage = "idle" | "selected" | "uploading" | "done" | "error";

const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
];

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
};

const STEP_LABEL: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  color: "rgba(186,230,255,0.42)",
  textTransform: "uppercase",
  letterSpacing: "0.14em",
  marginBottom: 6,
};

function sourceLabel(source: AwsIngestSource): string {
  return source === "hull" ? "Hull (Prasad)" : "Pipeline (Aishwarya)";
}

function sourceFolder(source: AwsIngestSource): string {
  return source === "hull" ? "incoming/hull/" : "incoming/pipeline/";
}

export default function CloudUploadPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [source, setSource] = useState<AwsIngestSource>("hull");
  const [stage, setStage] = useState<Stage>("idle");
  const [files, setFiles] = useState<File[]>([]);
  const [vesselName, setVesselName] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errMsg, setErrMsg] = useState("");
  const [uploadedKeys, setUploadedKeys] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("nauticai:token");
    if (!token) router.replace("/login");
  }, [router]);

  const acceptFiles = useCallback((fileList: FileList | File[]) => {
    const arr = Array.from(fileList);
    const valid = arr.filter((f) => ACCEPTED_TYPES.includes(f.type));
    if (valid.length === 0 && arr.length > 0) {
      setErrMsg("Only JPG, PNG, WebP or MP4 files are accepted.");
      return;
    }
    if (valid.length === 0) return;
    setFiles(valid);
    setStage("selected");
    setErrMsg("");
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragActive(false);
      const list = e.dataTransfer.files;
      if (list?.length) acceptFiles(list);
    },
    [acceptFiles],
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (list?.length) acceptFiles(list);
    e.target.value = "";
  };

  const runUpload = async () => {
    if (files.length === 0) return;
    setStage("uploading");
    setProgress(0);
    setErrMsg("");
    setUploadedKeys([]);
    const vesselId = vesselName.trim() || `demo_${Date.now()}`;
    try {
      const results = await uploadFilesToS3Ingest(source, files, vesselId, (fileIndex, pct) => {
        const total = files.length;
        const base = (fileIndex / total) * 100;
        setProgress(Math.round(base + (pct / 100) * (100 / total)));
      });
      setUploadedKeys(results.map((r) => r.key));
      setProgress(100);
      setStage("done");
    } catch (err) {
      setStage("error");
      setErrMsg(err instanceof Error ? err.message : "Upload failed");
    }
  };

  const reset = () => {
    setFiles([]);
    setStage("idle");
    setProgress(0);
    setErrMsg("");
    setUploadedKeys([]);
  };

  const isRunning = stage === "uploading";

  const channelBtn = (s: AwsIngestSource, accent: string) => {
    const active = source === s;
    return (
      <button
        type="button"
        onClick={() => setSource(s)}
        disabled={isRunning}
        style={{
          flex: 1,
          padding: "12px 14px",
          borderRadius: 12,
          border: active
            ? `1.5px solid ${accent}`
            : "1px solid rgba(129,140,248,0.28)",
          background: active
            ? `linear-gradient(135deg, ${accent}22, rgba(8,10,30,0.9))`
            : "rgba(15,23,42,0.75)",
          color: "#fff",
          cursor: isRunning ? "not-allowed" : "pointer",
          textAlign: "left",
          fontFamily: "inherit",
          opacity: isRunning ? 0.7 : 1,
        }}
      >
        <span style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
          {sourceLabel(s)}
        </span>
        <span style={{ fontSize: 10, color: "rgba(148,163,184,0.9)" }}>
          AWS folder: <span style={{ fontFamily: "monospace" }}>{sourceFolder(s)}</span>
        </span>
      </button>
    );
  };

  return (
    <PageShell backgroundSrc="/bg3.avif">
      <div style={{ paddingTop: 72, minHeight: "100vh" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 24px 48px" }}>
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
              fontSize: 24,
              fontWeight: 800,
              letterSpacing: "-0.03em",
              marginBottom: 6,
              background: "linear-gradient(90deg, #fff 55%, #a5b4fc)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Cloud upload (demo)
          </h1>
          <p style={{ fontSize: 12, color: "rgba(186,230,255,0.55)", marginBottom: 20, lineHeight: 1.5 }}>
            Send images to AWS S3. Lambda inspects them automatically; check{" "}
            <Link href="/reports" style={{ color: "#93c5fd" }}>
              Reports
            </Link>{" "}
            and Telegram when processing finishes.
          </p>

          <p style={STEP_LABEL}>Step 1 · Choose destination</p>
          <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
            {channelBtn("hull", "#38bdf8")}
            {channelBtn("pipeline", "#a78bfa")}
          </div>

          <p style={STEP_LABEL}>Step 2 · Vessel name (optional)</p>
          <div style={{ ...CARD, marginBottom: 14 }}>
            <label style={LABEL}>Vessel / batch label</label>
            <input
              value={vesselName}
              onChange={(e) => setVesselName(e.target.value)}
              placeholder="e.g. MV Pacific Star"
              style={INPUT_BASE}
              disabled={isRunning}
            />
          </div>

          <p style={STEP_LABEL}>Step 3 · Select files</p>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setDragActive(false);
            }}
            onDrop={handleDrop}
            onClick={() => !isRunning && inputRef.current?.click()}
            style={{
              ...CARD,
              marginBottom: 14,
              minHeight: 140,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              textAlign: "center",
              cursor: isRunning ? "not-allowed" : "pointer",
              border: dragActive
                ? "1.5px solid rgba(129,140,248,0.90)"
                : "1.5px dashed rgba(129,140,248,0.28)",
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_TYPES.join(",")}
              multiple
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
            <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
              {files.length > 0
                ? `${files.length} file(s) selected`
                : "Drag & drop or click to select"}
            </p>
            <p style={{ fontSize: 10, color: "rgba(148,163,184,0.85)" }}>
              Target: {sourceFolder(source)} ({sourceLabel(source)})
            </p>
          </div>

          {isRunning && (
            <div style={{ marginBottom: 14 }}>
              <div
                style={{
                  height: 4,
                  borderRadius: 999,
                  background: "rgba(15,23,42,0.90)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${progress}%`,
                    height: "100%",
                    background: "linear-gradient(90deg, #38bdf8, #818cf8)",
                    transition: "width 0.18s ease-out",
                  }}
                />
              </div>
              <p style={{ fontSize: 10, color: "rgba(191,219,254,0.85)", marginTop: 6 }}>
                Uploading to S3… {progress}%
              </p>
            </div>
          )}

          {errMsg && (
            <p style={{ fontSize: 11, color: "#fca5a5", marginBottom: 12 }}>{errMsg}</p>
          )}

          {stage === "done" && (
            <div
              style={{
                ...CARD,
                marginBottom: 14,
                borderColor: "rgba(52,211,153,0.45)",
              }}
            >
              <p style={{ fontSize: 12, fontWeight: 700, color: "#6ee7b7", marginBottom: 8 }}>
                Uploaded to S3
              </p>
              <p style={{ fontSize: 11, color: "rgba(186,230,255,0.7)", lineHeight: 1.5 }}>
                Processing usually takes 1–3 minutes. Refresh Reports or check Telegram.
              </p>
              {uploadedKeys.length > 0 && (
                <ul
                  style={{
                    marginTop: 10,
                    paddingLeft: 16,
                    fontSize: 10,
                    color: "rgba(148,163,184,0.9)",
                    fontFamily: "monospace",
                  }}
                >
                  {uploadedKeys.map((k) => (
                    <li key={k} style={{ marginBottom: 4, wordBreak: "break-all" }}>
                      {k}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={runUpload}
              disabled={files.length === 0 || isRunning}
              style={{
                flex: 1,
                minWidth: 160,
                padding: "12px 20px",
                borderRadius: 10,
                border: "none",
                background:
                  files.length === 0 || isRunning
                    ? "rgba(71,85,105,0.6)"
                    : "linear-gradient(135deg, #38bdf8, #6366f1)",
                color: "#fff",
                fontWeight: 700,
                fontSize: 13,
                cursor: files.length === 0 || isRunning ? "not-allowed" : "pointer",
                fontFamily: "inherit",
              }}
            >
              {isRunning
                ? "Uploading…"
                : `Upload to ${source === "hull" ? "Hull" : "Pipeline"} AWS`}
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={isRunning}
              style={{
                padding: "12px 16px",
                borderRadius: 10,
                border: "1px solid rgba(129,140,248,0.35)",
                background: "rgba(15,23,42,0.75)",
                color: "#e2e8f0",
                fontWeight: 600,
                fontSize: 12,
                cursor: isRunning ? "not-allowed" : "pointer",
                fontFamily: "inherit",
              }}
            >
              Clear
            </button>
            <Link
              href="/inspect"
              style={{
                padding: "12px 16px",
                borderRadius: 10,
                border: "1px solid rgba(129,140,248,0.25)",
                color: "rgba(191,219,254,0.9)",
                fontSize: 12,
                fontWeight: 600,
                textDecoration: "none",
                alignSelf: "center",
              }}
            >
              Direct inspect
            </Link>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
