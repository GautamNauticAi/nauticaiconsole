import type {
  DetectResponse,
  Inspection,
  DashboardStats,
  AgenticInspectResponse,
  AgenticVessel,
} from "@/types";
import { exportInspectionPdf } from "./exportPdf";

// In browser on production (Vercel), use same-origin proxy to avoid CORS; localhost and server use backend URL
function getBase(): string {
  if (typeof window !== "undefined" && window.location.origin !== "http://localhost:3000") {
    return "/api/backend";
  }
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
}
const BASE = getBase();

function getAuthHeaders(): HeadersInit {
  const headers: Record<string, string> = {};
  if (typeof window !== "undefined") {
    const token = window.localStorage.getItem("nauticai:token");
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers || undefined);
  const auth = getAuthHeaders();
  if (auth && typeof auth === "object" && "Authorization" in auth) {
    headers.set("Authorization", (auth as Record<string, string>)["Authorization"]);
  }
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return (await res.json()) as T;
}

const INSPECTIONS_CACHE_TTL_MS = 60_000; // 60 seconds
let inspectionsCache: { data: Inspection[]; ts: number } | null = null;
let inspectionsInFlight: Promise<Inspection[]> | null = null;

export function invalidateInspectionsCache(): void {
  inspectionsCache = null;
}

/** Map Agentic vessel to Inspection for Dashboard/Reports */
function vesselToInspection(v: AgenticVessel): Inspection {
  return {
    id: v.vessel_id,
    inspection_id: v.vessel_id,
    status: "completed",
    created_at: v.last_inspection,
    file_name: null,
    vessel_name: v.vessel_id,
    detected_classes: null,
    highest_confidence: null,
    risk_level: v.requires_cleaning ? "HIGH" : "LOW",
    risk_score: v.requires_cleaning ? 8 : 3,
    imo_rating: v.imo_rating,
    requires_cleaning: v.requires_cleaning,
    image_count: v.image_count ?? 1,
    image_url: null,
    annotated_image_url: null,
  };
}

/** Map Agentic inspect response to Inspection for display */
export function agenticResponseToInspection(
  r: AgenticInspectResponse,
  fileName?: string | null
): Inspection {
  return {
    id: r.metadata.vessel_id,
    inspection_id: r.metadata.vessel_id,
    status: "completed",
    created_at: r.metadata.inspection_timestamp,
    file_name: fileName ?? null,
    vessel_name: r.metadata.vessel_id,
    detected_classes: null,
    highest_confidence: null,
    risk_level: r.compliance_result.requires_cleaning ? "HIGH" : "LOW",
    risk_score: r.compliance_result.requires_cleaning ? 8.5 : 2,
    inference_time: null,
    imo_rating: r.compliance_result.official_imo_rating,
    requires_cleaning: r.compliance_result.requires_cleaning,
    total_hull_coverage_percentage: r.ai_vision_metrics.total_hull_coverage_percentage,
    image_url: null,
    annotated_image_url: null,
  };
}

async function listInspectionsInternal(forceRefresh = false): Promise<Inspection[]> {
  const now = Date.now();
  if (!forceRefresh && inspectionsCache && now - inspectionsCache.ts < INSPECTIONS_CACHE_TTL_MS) {
    return inspectionsCache.data;
  }
  if (inspectionsInFlight && !forceRefresh) {
    return inspectionsInFlight;
  }
  const doFetch = async (): Promise<Inspection[]> => {
    try {
      const payload = await req<{ vessels: AgenticVessel[] }>("/api/vessels/all");
      const vessels = payload.vessels ?? [];
      const data = vessels.map(vesselToInspection);
      inspectionsCache = { data, ts: Date.now() };
      return data;
    } catch {
      if (inspectionsCache) return inspectionsCache.data;
      return [];
    } finally {
      inspectionsInFlight = null;
    }
  };
  inspectionsInFlight = doFetch();
  return inspectionsInFlight;
}

export const api = {
  /**
   * Run inspection via Agentic backend: POST /api/inspect with vessel_id + image.
   * Returns Agentic JSON (metadata, ai_vision_metrics, compliance_result).
   */
  async runAgenticInspection(
    vesselId: string,
    imageFile: File
  ): Promise<AgenticInspectResponse> {
    const form = new FormData();
    form.append("vessel_id", vesselId);
    form.append("image", imageFile);

    const res = await req<AgenticInspectResponse>("/api/inspect", {
      method: "POST",
      body: form,
    });
    invalidateInspectionsCache();
    return res;
  },

  /** Upload: uses Agentic POST /api/inspect. vesselId defaults to inspection_<timestamp>. imageIndex for batch (0, 1, 2, ...). */
  async upload(
    file: File,
    vesselName?: string,
    imageIndex?: number
  ): Promise<AgenticInspectResponse> {
    const vesselId = vesselName?.trim() || `inspection_${Date.now()}`;
    const form = new FormData();
    form.append("vessel_id", vesselId);
    form.append("image", file);
    if (imageIndex != null && imageIndex > 0) {
      form.append("image_index", String(imageIndex));
    }
    const res = await req<AgenticInspectResponse>("/api/inspect", {
      method: "POST",
      body: form,
    });
    invalidateInspectionsCache();
    return res;
  },

  async listInspections(forceRefresh = false): Promise<Inspection[]> {
    return listInspectionsInternal(forceRefresh);
  },

  /** Get latest report for a vessel (Agentic GET /api/vessel/{id}/latest-report). */
  async getInspection(vesselId: string): Promise<Inspection | undefined> {
    try {
      const data = await req<AgenticInspectResponse>(
        `/api/vessel/${encodeURIComponent(vesselId)}/latest-report`
      );
      return agenticResponseToInspection(data, null);
    } catch {
      return undefined;
    }
  },

  /** Get full Agentic report JSON for Results page (same shape as POST /api/inspect response). */
  async getAgenticReport(vesselId: string): Promise<AgenticInspectResponse | null> {
    try {
      return await req<AgenticInspectResponse>(
        `/api/vessel/${encodeURIComponent(vesselId)}/latest-report`
      );
    } catch {
      return null;
    }
  },

  /** Delete inspection (vessel) on backend; invalidates cache. */
  async deleteInspection(vesselId: string): Promise<void> {
    const path = `/api/vessel/${encodeURIComponent(vesselId)}`;
    const headers = getAuthHeaders() as Record<string, string>;
    const res = await fetch(`${BASE}${path}`, { method: "DELETE", headers });
    invalidateInspectionsCache();
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as { detail?: string })?.detail ?? `Delete failed: ${res.status}`);
    }
  },

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
      (i) => i.requires_cleaning === true || i.risk_level === "HIGH" || i.risk_level === "CRITICAL"
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
      high_risk_count
    );

    const riskScoreFor = (i: Inspection): number => {
      if (i.risk_score != null) return i.risk_score;
      if (i.requires_cleaning) return 8.5;
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
      inspections.reduce((sum, i) => sum + riskScoreFor(i), 0) / total_inspections;

    return {
      total_inspections,
      high_risk_count,
      total_anomalies,
      avg_risk_score: Number(avg_risk_score.toFixed(1)),
    };
  },

  exportReportUrl(vesselId: string): string {
    return `${BASE}/api/vessel/${encodeURIComponent(vesselId)}/pdf`;
  },

  /** URL for the annotated hull image (live preview). Use imageIndex for batch (0 = first, 1 = second, ...). */
  getAnnotatedImageUrl(vesselId: string, imageIndex?: number): string {
    const path = `${BASE}/api/vessel/${encodeURIComponent(vesselId)}/annotated-image`;
    if (imageIndex != null && imageIndex > 0) {
      return `${path}?index=${imageIndex}`;
    }
    return path;
  },

  /**
   * Fetch annotated image with auth and return a blob URL for <img src>. Caller should revoke the URL when done (e.g. in useEffect cleanup).
   */
  async fetchAnnotatedImageBlobUrl(vesselId: string, imageIndex?: number): Promise<string> {
    const path = imageIndex != null && imageIndex > 0
      ? `/api/vessel/${encodeURIComponent(vesselId)}/annotated-image?index=${imageIndex}`
      : `/api/vessel/${encodeURIComponent(vesselId)}/annotated-image`;
    const res = await fetch(`${BASE}${path}`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error(`Failed to load image: ${res.status}`);
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },

  /**
   * Download PDF from Agentic backend with auth (GET /api/vessel/{vessel_id}/pdf). Fetches with Bearer token and opens blob in new tab.
   */
  async downloadAgenticPdf(vesselId: string): Promise<void> {
    if (typeof window === "undefined") return;
    const path = `/api/vessel/${encodeURIComponent(vesselId)}/pdf`;
    const res = await fetch(`${BASE}${path}`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error(`Failed to download PDF: ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const filename = `${vesselId}_Audit_Report.pdf`;
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 200);
  },

  /** PDF export: for Agentic we use server PDF; fallback to client jsPDF if needed. */
  exportReportPdf(
    inspection: Inspection,
    _annotatedImage?: string | null
  ): void {
    const vesselId = inspection.inspection_id ?? inspection.id;
    if (vesselId) {
      this.downloadAgenticPdf(vesselId);
    } else {
      exportInspectionPdf(inspection, null);
    }
  },

  /** Build Inspection from Agentic response (for Results page). */
  inspectionFromDetectResponse(_detect: DetectResponse): Inspection {
    return agenticResponseToInspection(
      _detect as unknown as AgenticInspectResponse,
      null
    );
  },

  /** Current user (id, email, username). Use for showing username in nav/Dashboard and for Telegram bot. */
  async getCurrentUser(): Promise<{ user: { id: number; email: string; username?: string | null } }> {
    return req("/auth/me");
  },
};

/** Auth: Agentic backend has no auth; these will 404. Kept for compatibility. */
async function authReq<T>(
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  const url = `${getBase()}${path}`;
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
        : res.status === 404
          ? "Auth not available on this backend."
          : "Authentication failed";
    throw new Error(msg);
  }
  return data as T;
}

export async function authSignup(email: string, password: string, username?: string) {
  return authReq<{ token: string; user: { id: number; email: string; username?: string | null; telegram_user_id?: string | null } }>(
    "/auth/signup",
    { email, password, username: username ?? "" }
  );
}

export async function authLogin(email: string, password: string) {
  return authReq<{ token: string; user: { id: number; email: string; username?: string | null; telegram_user_id?: string | null } }>(
    "/auth/login",
    { email, password }
  );
}

export async function authForgotPassword(email: string): Promise<void> {
  await authReq<{ ok: boolean }>("/auth/forgot-password", { email });
}

export async function authResetPassword(
  token: string,
  newPassword: string
): Promise<void> {
  await authReq<{ ok: boolean }>("/auth/reset-password", {
    token,
    new_password: newPassword,
  });
}
