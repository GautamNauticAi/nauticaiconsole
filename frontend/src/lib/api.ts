import type { DetectResponse, Inspection, DashboardStats } from "@/types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return (await res.json()) as T;
}

async function listInspectionsInternal(): Promise<Inspection[]> {
  try {
    const payload = await req<{ inspections: Inspection[] }>("/inspections");
    return payload.inspections ?? [];
  } catch {
    // Fallback to mock data if API is not reachable
    return MOCK_INSPECTIONS;
  }
}

export const api = {
  /* Detection / upload */
  async upload(file: File, vesselName?: string): Promise<DetectResponse> {
    const form = new FormData();
    form.append("file", file);
    if (vesselName) form.append("vessel_name", vesselName);
    return req<DetectResponse>("/detect", { method: "POST", body: form });
  },

  /* Inspections list + detail (from Supabase via FastAPI) */
  async listInspections(): Promise<Inspection[]> {
    return listInspectionsInternal();
  },

  async getInspection(inspectionId: string): Promise<Inspection | undefined> {
    const inspections = await listInspectionsInternal();
    return inspections.find((i) => i.inspection_id === inspectionId);
  },

  /* Stats derived from inspections list */
  async getStats(): Promise<DashboardStats> {
    const inspections = await listInspectionsInternal();
    if (!inspections.length) {
      return MOCK_STATS;
    }

    const total_inspections = inspections.length;
    const high_risk_count = inspections.filter(
      (i) => i.risk_level === "HIGH" || i.risk_level === "CRITICAL"
    ).length;

    const total_anomalies = inspections.reduce(
      (sum, i) => sum + (i.detected_classes?.length ?? 0),
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
    // For now this points to the backend inspection JSON (can later be swapped to a PDF endpoint)
    return `${BASE}/inspections?inspection_id=${encodeURIComponent(
      inspectionId
    )}`;
  },
};

/* ── Mock data for local dev (used when API is unavailable) ── */
export const MOCK_INSPECTIONS: Inspection[] = [
  {
    id: "row-001",
    inspection_id: "insp-001",
    status: "completed",
    created_at: "2026-03-02T09:14:00Z",
    file_name: "hull_port_side.jpg",
    detected_classes: ["corrosion", "marine growth", "hull debris"],
    file_name: "hull_port_side.jpg",
    highest_confidence: 0.94,
    risk_level: "HIGH",
    inference_time: 0.42,
    precision: 0.886,
    recall: 0.844,
    map50: 0.882,
    map5095: 0.782,
    image_url: null,
    annotated_image_url: null,
  },
  {
    id: "row-002",
    inspection_id: "insp-002",
    status: "completed",
    created_at: "2026-03-01T14:32:00Z",
    file_name: "stern_view.mp4",
    detected_classes: ["dents_damage", "corrosion"],
    highest_confidence: 0.91,
    risk_level: "HIGH",
    inference_time: 0.55,
    precision: 0.886,
    recall: 0.844,
    map50: 0.882,
    map5095: 0.782,
    image_url: null,
    annotated_image_url: null,
  },
  {
    id: "row-003",
    inspection_id: "insp-003",
    status: "completed",
    created_at: "2026-02-28T11:05:00Z",
    file_name: "bow_inspection.jpg",
    detected_classes: ["marine_growth"],
    highest_confidence: 0.79,
    risk_level: "LOW",
    inference_time: 0.38,
    precision: 0.886,
    recall: 0.844,
    map50: 0.882,
    map5095: 0.782,
    image_url: null,
    annotated_image_url: null,
  },
  {
    id: "row-004",
    inspection_id: "insp-004",
    status: "processing",
    created_at: "2026-03-02T10:55:00Z",
    file_name: "full_hull_scan.mp4",
    detected_classes: [],
    highest_confidence: 0,
    risk_level: "SAFE",
    inference_time: 0,
    precision: 0.886,
    recall: 0.844,
    map50: 0.882,
    map5095: 0.782,
    image_url: null,
    annotated_image_url: null,
  },
];

export const MOCK_STATS: DashboardStats = {
  total_inspections: 42,
  high_risk_count: 7,
  total_anomalies: 118,
  avg_risk_score: 4.6,
};
