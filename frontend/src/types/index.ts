export type AnomalyType =
  | "corrosion"
  | "marine_growth"
  | "hull_debris"
  | "dents_damage"
  | "clean";

export type Severity = "low" | "medium" | "high" | "critical";
export type InspectionStatus = "pending" | "processing" | "completed" | "failed";

export interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Anomaly {
  id: string;
  type: AnomalyType;
  label: string;
  confidence: number;
  severity: Severity;
  bbox: BoundingBox;
  area_percentage: number;
}

export interface Inspection {
  id: string;
  status: InspectionStatus;
  created_at: string;
  vessel_name?: string;
  file_name?: string;
  image_url?: string;
  annotated_image_url?: string;
  anomalies: Anomaly[];
  hull_coverage: number;
  risk_score: number;
  notes?: string;
}

export interface DashboardStats {
  total_inspections: number;
  high_risk_count: number;
  total_anomalies: number;
  avg_risk_score: number;
}
