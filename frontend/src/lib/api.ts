import type { Inspection, DashboardStats } from "@/types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export const api = {
  /* Inspections */
  async upload(file: File, vesselName?: string): Promise<{ inspection_id: string }> {
    const form = new FormData();
    form.append("file", file);
    if (vesselName) form.append("vessel_name", vesselName);
    return req("/api/inspect", { method: "POST", body: form });
  },

  async getInspection(id: string): Promise<Inspection> {
    return req(`/api/inspect/${id}`);
  },

  async listInspections(): Promise<Inspection[]> {
    return req("/api/inspections");
  },

  async deleteInspection(id: string): Promise<void> {
    await req(`/api/inspect/${id}`, { method: "DELETE" });
  },

  /* Stats */
  async getStats(): Promise<DashboardStats> {
    return req("/api/stats");
  },

  /* Reports */
  exportReportUrl(id: string): string {
    return `${BASE}/api/export/${id}`;
  },
};

/* ── Mock data for local dev (used when API is unavailable) ── */
export const MOCK_INSPECTIONS: Inspection[] = [
  {
    id: "insp-001",
    status: "completed",
    created_at: "2026-03-02T09:14:00Z",
    vessel_name: "MV Pacific Star",
    file_name: "hull_port_side.jpg",
    annotated_image_url: "/background.png",
    anomalies: [
      { id: "a1", type: "corrosion",     label: "Corrosion",     confidence: 0.94, severity: "high",     bbox: { x1: 120, y1: 80,  x2: 280, y2: 210 }, area_percentage: 12.4 },
      { id: "a2", type: "marine_growth", label: "Marine Growth", confidence: 0.88, severity: "medium",   bbox: { x1: 310, y1: 150, x2: 420, y2: 260 }, area_percentage: 7.1  },
      { id: "a3", type: "hull_debris",   label: "Hull Debris",   confidence: 0.76, severity: "low",      bbox: { x1: 50,  y1: 300, x2: 130, y2: 370 }, area_percentage: 3.2  },
    ],
    hull_coverage: 99,
    risk_score: 7.4,
  },
  {
    id: "insp-002",
    status: "completed",
    created_at: "2026-03-01T14:32:00Z",
    vessel_name: "SS Northern Light",
    file_name: "stern_view.mp4",
    anomalies: [
      { id: "b1", type: "dents_damage",  label: "Dents & Damage", confidence: 0.91, severity: "critical", bbox: { x1: 200, y1: 100, x2: 350, y2: 280 }, area_percentage: 18.7 },
      { id: "b2", type: "corrosion",     label: "Corrosion",      confidence: 0.85, severity: "high",     bbox: { x1: 60,  y1: 60,  x2: 180, y2: 140 }, area_percentage: 9.3  },
    ],
    hull_coverage: 97,
    risk_score: 8.9,
  },
  {
    id: "insp-003",
    status: "completed",
    created_at: "2026-02-28T11:05:00Z",
    vessel_name: "MV Coral Drift",
    file_name: "bow_inspection.jpg",
    anomalies: [
      { id: "c1", type: "marine_growth", label: "Marine Growth", confidence: 0.79, severity: "low", bbox: { x1: 90, y1: 120, x2: 200, y2: 230 }, area_percentage: 4.5 },
    ],
    hull_coverage: 100,
    risk_score: 2.1,
  },
  {
    id: "insp-004",
    status: "processing",
    created_at: "2026-03-02T10:55:00Z",
    vessel_name: "RV Deep Survey",
    file_name: "full_hull_scan.mp4",
    anomalies: [],
    hull_coverage: 0,
    risk_score: 0,
  },
];

export const MOCK_STATS: DashboardStats = {
  total_inspections: 42,
  high_risk_count: 7,
  total_anomalies: 118,
  avg_risk_score: 4.6,
};
