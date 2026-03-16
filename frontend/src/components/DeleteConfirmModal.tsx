"use client";

import React, { useState } from "react";

export function DeleteConfirmModal({
  open,
  onClose,
  title = "Remove inspection?",
  message = "This cannot be undone.",
  vesselLabel,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
  vesselLabel?: string;
  onConfirm: () => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleClose = () => {
    if (loading) return;
    setError(null);
    onClose();
  };

  const handleConfirm = async () => {
    setError(null);
    setLoading(true);
    try {
      await onConfirm();
      handleClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-modal-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)",
      }}
      onClick={handleClose}
    >
      <div
        style={{
          background: "linear-gradient(180deg, #1e293b 0%, #0f172a 100%)",
          borderRadius: 16,
          border: "1px solid rgba(71,85,105,0.6)",
          boxShadow: "0 24px 48px rgba(0,0,0,0.4)",
          maxWidth: 420,
          width: "100%",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with close button */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 20px 12px",
          }}
        >
          <h2
            id="delete-modal-title"
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 700,
              color: "#f1f5f9",
            }}
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            aria-label="Close"
            style={{
              width: 36,
              height: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(51,65,85,0.8)",
              border: "1px solid #475569",
              borderRadius: 10,
              color: "#94a3b8",
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: 18,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: "0 20px 20px" }}>
          {vesselLabel && (
            <p
              style={{
                margin: "0 0 8px",
                fontSize: 14,
                color: "#94a3b8",
              }}
            >
              {vesselLabel}
            </p>
          )}
          <p
            style={{
              margin: 0,
              fontSize: 14,
              color: "#cbd5e1",
              lineHeight: 1.5,
            }}
          >
            {message}
          </p>
          {error && (
            <p
              role="alert"
              style={{
                marginTop: 12,
                padding: "10px 12px",
                background: "rgba(239,68,68,0.15)",
                border: "1px solid rgba(239,68,68,0.4)",
                borderRadius: 8,
                fontSize: 13,
                color: "#fca5a5",
              }}
            >
              {error}
            </p>
          )}
          <div
            style={{
              marginTop: 24,
              display: "flex",
              gap: 12,
              justifyContent: "flex-end",
            }}
          >
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              style={{
                padding: "10px 20px",
                fontSize: 14,
                fontWeight: 600,
                color: "#e2e8f0",
                background: "#334155",
                border: "1px solid #475569",
                borderRadius: 10,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={loading}
              style={{
                padding: "10px 20px",
                fontSize: 14,
                fontWeight: 600,
                color: "#fff",
                background: loading ? "#64748b" : "#dc2626",
                border: "none",
                borderRadius: 10,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Removing…" : "Remove"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
