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

/**
 * Row returned from the FastAPI + Supabase /inspections endpoint.
 * Mirrors the columns returned by the backend (nauticai_api.py).
 */
export interface Inspection {
  id: string; // Supabase row id (uuid)
  inspection_id: string;
  status: InspectionStatus | string;
  created_at: string;
  file_name?: string | null;
  vessel_name?: string | null;
  detected_classes?: string[] | null;
  anomalies?: Anomaly[] | null;
  highest_confidence?: number | null;
  risk_level?: string | null;
  risk_score?: number | null;
  inference_time?: number | null;
  precision?: number | null;
  recall?: number | null;
  map50?: number | null;
  map5095?: number | null;
  image_url?: string | null;
  annotated_image_url?: string | null;
  /** From Agentic: IMO rating (e.g. FR-2, FR-4) */
  imo_rating?: string | null;
  /** From Agentic: cleaning required */
  requires_cleaning?: boolean | null;
  /** From Agentic: hull coverage % */
  total_hull_coverage_percentage?: number | null;
  /** From Agentic: number of images in this inspection (1 = single). */
  image_count?: number | null;
}

export interface DashboardStats {
  total_inspections: number;
  high_risk_count: number;
  total_anomalies: number;
  avg_risk_score: number;
}

export interface SpeciesPrediction {
  class_name: string;
  confidence: number;
}

export interface DetectionBox {
  class_name: string;
  confidence: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Species identified within this detection (e.g. for biofouling: Barnacles, Algae). */
  species?: SpeciesPrediction[];
}

export interface DetectionSummary {
  total: number;
  risk_level: string;
  avg_confidence: number;
  max_confidence: number;
  inference_time_ms: number;
}

export interface ModelMetrics {
  precision: number;
  recall: number;
  map50: number;
  map5095: number;
}

export interface DetectResponse {
  inspection_id: string;
  /** Original filename from upload; present when returned by /detect */
  file_name?: string | null;
  detections: DetectionBox[];
  annotated_image: string; // base64 data URI
  summary: DetectionSummary;
  model_metrics: ModelMetrics;
  timestamp: string;
}

/** Response from Agentic backend POST /api/inspect */
export interface AgenticInspectResponse {
  metadata: {
    vessel_id: string;
    inspection_timestamp: string;
    system_status: string;
  };
  ai_vision_metrics: {
    total_hull_coverage_percentage: number;
    severity: string;
    total_detections: number;
  };
  compliance_result: {
    official_imo_rating: string;
    recommended_action: string;
    requires_cleaning: boolean;
  };
}

/** Vessel row from Agentic GET /api/vessels/all */
export interface AgenticVessel {
  vessel_id: string;
  last_inspection: string;
  imo_rating: string;
  requires_cleaning: boolean;
  /** Number of images in this inspection (1 = single, 2+ = multi-image). */
  image_count?: number;
}
