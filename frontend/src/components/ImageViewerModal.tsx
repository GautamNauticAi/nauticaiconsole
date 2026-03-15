"use client";

import { useState, useCallback, useEffect } from "react";

const ZOOM_STEP = 25;
const ZOOM_MIN = 50;
const ZOOM_MAX = 200;

const btnStyle = {
  width: 36,
  height: 36,
  display: "flex" as const,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  background: "#334155",
  border: "1px solid #475569",
  borderRadius: 8,
  color: "#e2e8f0",
  cursor: "pointer" as const,
  flexShrink: 0,
};

export function ImageViewerModal({
  images,
  initialIndex = 0,
  title = "Image",
  onClose,
}: {
  images: string[];
  initialIndex?: number;
  title?: string;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(Math.min(initialIndex, Math.max(0, images.length - 1)));
  const [zoom, setZoom] = useState(100);

  const hasMultiple = images.length > 1;
  const currentSrc = images[index] ?? null;

  useEffect(() => {
    const i = Math.min(initialIndex, Math.max(0, images.length - 1));
    setIndex(i);
  }, [initialIndex, images.length]);

  const goPrev = useCallback(() => {
    setIndex((i) => (i <= 0 ? images.length - 1 : i - 1));
    setZoom(100);
  }, [images.length]);

  const goNext = useCallback(() => {
    setIndex((i) => (i >= images.length - 1 ? 0 : i + 1));
    setZoom(100);
  }, [images.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (!hasMultiple) return;
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, hasMultiple, goPrev, goNext]);

  if (images.length === 0) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${title} viewer`}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.82)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "#1e293b",
          border: "1px solid #334155",
          borderRadius: 12,
          maxWidth: "96vw",
          maxHeight: "96vh",
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
            padding: "10px 14px",
            borderBottom: "1px solid #334155",
            gap: 12,
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8" }}>
            {title} {hasMultiple ? `${index + 1} / ${images.length}` : ""}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP))}
              disabled={zoom <= ZOOM_MIN}
              style={{ ...btnStyle, opacity: zoom <= ZOOM_MIN ? 0.5 : 1 }}
              aria-label="Zoom out"
            >
              −
            </button>
            <span style={{ fontSize: 12, color: "#94a3b8", minWidth: 36, textAlign: "center" }}>
              {zoom}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP))}
              disabled={zoom >= ZOOM_MAX}
              style={{ ...btnStyle, opacity: zoom >= ZOOM_MAX ? 0.5 : 1 }}
              aria-label="Zoom in"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => setZoom(100)}
              style={{ ...btnStyle, padding: "0 10px", width: "auto" }}
            >
              Reset
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{ ...btnStyle, background: "#475569", borderColor: "#64748b" }}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Image area with prev/next */}
        <div
          style={{
            flex: 1,
            minHeight: 280,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {hasMultiple && (
            <button
              type="button"
              onClick={goPrev}
              aria-label="Previous image"
              style={{
                ...btnStyle,
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                zIndex: 2,
              }}
            >
              ‹
            </button>
          )}

          <div
            style={{
              overflow: "auto",
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 24,
              maxHeight: "80vh",
              minHeight: 200,
            }}
          >
            {currentSrc && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={currentSrc}
                alt={`${title} ${index + 1}`}
                style={{
                  maxWidth: "none",
                  width: `${zoom}%`,
                  height: "auto",
                  display: "block",
                  borderRadius: 8,
                  objectFit: "contain",
                }}
                draggable={false}
              />
            )}
          </div>

          {hasMultiple && (
            <button
              type="button"
              onClick={goNext}
              aria-label="Next image"
              style={{
                ...btnStyle,
                position: "absolute",
                right: 12,
                top: "50%",
                transform: "translateY(-50%)",
                zIndex: 2,
              }}
            >
              ›
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
