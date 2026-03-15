import type { DetectResponse, Inspection, DashboardStats } from "@/types";
import { exportInspectionPdf } from "./exportPdf";

// In browser on production (Vercel), use same-origin proxy to avoid CORS; localhost and server use backend URL
function getBase(): string {
  if (typeof window !== "undefined" && window.location.origin !== "http://localhost:3000") {
    return "/api/backend";
  }
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
}
const BASE = getBase();

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers || undefined);

  if (typeof window !== "undefined") {
    const token = window.localStorage.getItem("nauticai:token");
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return (await res.json()) as T;
}

const INSPECTIONS_CACHE_TTL_MS = 20_000; // 20 seconds
let inspectionsCache: { data: Inspection[]; ts: number } | null = null;

export function invalidateInspectionsCache(): void {
  inspectionsCache = null;
}

async function listInspectionsInternal(forceRefresh = false): Promise<Inspection[]> {
  const now = Date.now();
  if (!forceRefresh && inspectionsCache && now - inspectionsCache.ts < INSPECTIONS_CACHE_TTL_MS) {
    return inspectionsCache.data;
  }
  try {
    const payload = await req<{ inspections: Inspection[] }>("/inspections");
    const data = payload.inspections ?? [];
    inspectionsCache = { data, ts: now };
    return data;
  } catch {
    if (inspectionsCache) return inspectionsCache.data;
    return [];
  }
}

export const api = {
  /* Detection / upload */
  async upload(file: File, vesselName?: string): Promise<DetectResponse> {
    const form = new FormData();
    form.append("file", file);
    if (vesselName) form.append("vessel_name", vesselName);
    const res = await req<DetectResponse>("/detect", { method: "POST", body: form });
    invalidateInspectionsCache();
    return res;
  },

  /* Inspections list + detail (from Supabase via FastAPI). Cached for 20s for fast Dashboard/Reports navigation. */
  async listInspections(forceRefresh = false): Promise<Inspection[]> {
    return listInspectionsInternal(forceRefresh);
  },

  async getInspection(inspectionId: string): Promise<Inspection | undefined> {
    const inspections = await listInspectionsInternal();
    return inspections.find((i) => i.inspection_id === inspectionId);
  },

  /** Delete an inspection by its database id. */
  async deleteInspection(id: string): Promise<void> {
    const headers: HeadersInit = {};
    if (typeof window !== "undefined") {
      const token = window.localStorage.getItem("nauticai:token");
      if (token) headers["Authorization"] = `Bearer ${token}`;
    }
    const res = await fetch(`${getBase()}/inspections/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const msg = typeof data?.detail === "string" ? data.detail : "Failed to delete";
      throw new Error(msg);
    }
    invalidateInspectionsCache();
  },

  /* Stats derived from inspections list */
  async getStats(): Promise<DashboardStats> {
    const inspections = await listInspectionsInternal();
    if (!inspections.length) {
      return {
        total_inspections: 0,
        high_risk_count: 0,
        total_anomalies: 0,
        avg_risk_score: 0,
      };
    }

    const total_inspections = inspections.length;
    const high_risk_count = inspections.filter(
      (i) => i.risk_level === "HIGH" || i.risk_level === "CRITICAL"
    ).length;

    const classCount = (i: Inspection): number => {
      const c = i.detected_classes;
      if (Array.isArray(c)) return c.length;
      if (typeof c === "string") {
        try {
          const arr = JSON.parse(c) as unknown;
          return Array.isArray(arr) ? arr.length : 0;
        } catch {
          return 0;
        }
      }
      return 0;
    };
    const total_anomalies = inspections.reduce(
      (sum, i) => sum + classCount(i),
      0
    );

    // Approximate risk score 0–10 from risk_level if numeric field is not stored
    const riskScoreFor = (i: Inspection): number => {
      switch (i.risk_level) {
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
    };

    const avg_risk_score =
      inspections.reduce((sum, i) => sum + riskScoreFor(i), 0) /
      total_inspections;

    return {
      total_inspections,
      high_risk_count,
      total_anomalies,
      avg_risk_score: Number(avg_risk_score.toFixed(1)),
    };
  },

  /* Reports */
  exportReportUrl(inspectionId: string): string {
    return `${BASE}/inspections?inspection_id=${encodeURIComponent(
      inspectionId
    )}`;
  },

  /** Generate and download a clean PDF report. Pass optional annotated image (e.g. from live detection) to include it. */
  exportReportPdf(
    inspection: Inspection,
    annotatedImage?: string | null
  ): void {
    exportInspectionPdf(inspection, annotatedImage);
  },

  /** Build a minimal Inspection from a live DetectResponse for PDF export. */
  inspectionFromDetectResponse(detect: DetectResponse): Inspection {
    return {
      id: detect.inspection_id,
      inspection_id: detect.inspection_id,
      status: "completed",
      created_at: detect.timestamp,
      file_name: detect.file_name ?? null,
      vessel_name: null,
      detected_classes: detect.detections.map((d) => d.class_name),
      anomalies: null,
      highest_confidence: detect.summary.max_confidence,
      risk_level: detect.summary.risk_level,
      risk_score: undefined,
      inference_time: detect.summary.inference_time_ms / 1000,
      precision: detect.model_metrics.precision,
      recall: detect.model_metrics.recall,
      map50: detect.model_metrics.map50,
      map5095: detect.model_metrics.map5095,
      image_url: null,
      annotated_image_url: null,
    };
  },
};

/** Auth request: parses error body so user sees backend message (e.g. "Invalid email or password"). */
async function authReq<T>(
  path: string,
  body: { email: string; password?: string; [k: string]: unknown }
): Promise<T> {
  const url = `${getBase()}${path}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg =
        typeof data?.detail === "string"
          ? data.detail
          : Array.isArray(data?.detail)
            ? data.detail[0]?.msg ?? "Invalid request"
            : res.status === 401
              ? "Invalid email or password"
              : res.status === 500
                ? "Server error. Please try again."
                : "Authentication failed";
      throw new Error(msg);
    }
    return data as T;
  } catch (err) {
    if (err instanceof Error) {
      if (err.message.startsWith("Invalid") || err.message.includes("Auth") || err.message.includes("Server") || err.message.includes("required")) throw err;
      throw new Error("Cannot reach server. Check your connection and that the backend is running.");
    }
    throw new Error("Authentication failed");
  }
}

export async function authSignup(email: string, password: string) {
  return authReq<{ token: string; user: { id: number; email: string } }>(
    "/auth/signup",
    { email, password }
  );
}

export async function authLogin(email: string, password: string) {
  return authReq<{ token: string; user: { id: number; email: string } }>(
    "/auth/login",
    { email, password }
  );
}

export async function authForgotPassword(email: string): Promise<void> {
  await authReq<{ ok: boolean }>("/auth/forgot-password", { email });
}

export async function authResetPassword(token: string, newPassword: string): Promise<void> {
  await authReq<{ ok: boolean }>("/auth/reset-password", { token, new_password: newPassword });
}

