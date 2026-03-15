"use client";

import { useEffect, useState, useCallback } from "react";
import type { Inspection } from "@/types";
import { getInspectionPdfBlobUrl } from "@/lib/exportPdf";
import { api } from "@/lib/api";

const ZOOM_STEP = 25;
const ZOOM_MIN = 50;
const ZOOM_MAX = 200;

export function PdfViewerModal({
  inspection,
  annotatedImage,
  onClose,
}: {
  inspection: Inspection;
  annotatedImage?: string | null;
  onClose: () => void;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);

  useEffect(() => {
    const url = getInspectionPdfBlobUrl(inspection, annotatedImage);
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [inspection, annotatedImage]);

  const handleDownload = useCallback(() => {
    api.exportReportPdf(inspection, annotatedImage ?? undefined);
  }, [inspection, annotatedImage]);

  const zoomIn = () => setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP));
  const zoomOut = () => setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP));

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.75)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "#1e293b",
          border: "1px solid #334155",
          borderRadius: 8,
          maxWidth: "95vw",
          maxHeight: "95vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Toolbar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: "1px solid #334155",
            gap: 12,
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>
            Inspection report
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              onClick={zoomOut}
              disabled={zoom <= ZOOM_MIN}
              style={{
                width: 36,
                height: 36,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#334155",
                border: "1px solid #475569",
                borderRadius: 6,
                color: "#e2e8f0",
                cursor: zoom <= ZOOM_MIN ? "not-allowed" : "pointer",
                opacity: zoom <= ZOOM_MIN ? 0.5 : 1,
              }}
              aria-label="Zoom out"
            >
              −
            </button>
            <span style={{ fontSize: 12, color: "#94a3b8", minWidth: 40, textAlign: "center" }}>
              {zoom}%
            </span>
            <button
              type="button"
              onClick={zoomIn}
              disabled={zoom >= ZOOM_MAX}
              style={{
                width: 36,
                height: 36,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#334155",
                border: "1px solid #475569",
                borderRadius: 6,
                color: "#e2e8f0",
                cursor: zoom >= ZOOM_MAX ? "not-allowed" : "pointer",
                opacity: zoom >= ZOOM_MAX ? 0.5 : 1,
              }}
              aria-label="Zoom in"
            >
              +
            </button>
            <button
              type="button"
              onClick={handleDownload}
              style={{
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: 600,
                color: "#e2e8f0",
                background: "#334155",
                border: "1px solid #475569",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              Download
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: 600,
                color: "#f1f5f9",
                background: "#475569",
                border: "1px solid #64748b",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
        </div>

        {/* Scrollable PDF area with zoom */}
        <div
          style={{
            flex: 1,
            overflow: "auto",
            padding: 16,
            minHeight: 400,
          }}
        >
          {blobUrl && (
            <iframe
              src={blobUrl}
              title="Inspection report PDF"
              style={{
                width: `${zoom}%`,
                height: `${(zoom / 100) * 1100}px`,
                minHeight: "1100px",
                border: "none",
                background: "#fff",
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
