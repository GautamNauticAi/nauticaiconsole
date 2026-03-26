import type { AgenticInspectResponse, Inspection, NdtInputData } from "@/types";

export interface NdtComputedMetrics {
  initial_thickness_mm: number;
  estimated_loss_percent: number;
  estimated_loss_mm: number;
  estimated_final_thickness_mm: number;
  projected_12m_thickness_mm?: number;
}

export interface NdtInspectionRecord extends NdtInputData {
  vessel_id: string;
  computed?: NdtComputedMetrics;
  updated_at: string;
}

const STORAGE_KEY = "nauticai:ndtByVessel";

export function normalizeVesselId(value: string): string {
  return (value || "").trim().toLowerCase().replace(/\s+/g, "_");
}

function toNumber(value?: string): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function estimateThicknessLossPercent(
  _report: AgenticInspectResponse,
  _corrosionRateMmPy?: string
): number {
  // Demo-only constant until sensor-backed NDT logic is available.
  return 1.0;
}

export function computeNdtMetrics(
  input: NdtInputData,
  report: AgenticInspectResponse
): NdtComputedMetrics | undefined {
  const initial = toNumber(input.thickness_mm);
  if (initial == null || initial <= 0) return undefined;

  const lossPct = estimateThicknessLossPercent(report, input.corrosion_rate_mmpy);
  const lossMm = Number((initial * (lossPct / 100)).toFixed(2));
  const finalThickness = Number((initial - lossMm).toFixed(2));
  const corrosionRate = toNumber(input.corrosion_rate_mmpy);

  return {
    initial_thickness_mm: Number(initial.toFixed(2)),
    estimated_loss_percent: lossPct,
    estimated_loss_mm: lossMm,
    estimated_final_thickness_mm: finalThickness,
    projected_12m_thickness_mm:
      corrosionRate == null ? undefined : Number((finalThickness - corrosionRate).toFixed(2)),
  };
}

function readNdtStore(): Record<string, NdtInspectionRecord> {
  if (typeof window === "undefined") return {};
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, NdtInspectionRecord>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeNdtStore(data: Record<string, NdtInspectionRecord>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function saveNdtForVessel(
  vesselId: string,
  input: NdtInputData,
  report?: AgenticInspectResponse
): void {
  if (typeof window === "undefined") return;
  const key = normalizeVesselId(vesselId);
  if (!key) return;
  const current = readNdtStore();
  const record: NdtInspectionRecord = {
    vessel_id: vesselId,
    thickness_mm: input.thickness_mm?.trim() || "",
    corrosion_rate_mmpy: input.corrosion_rate_mmpy?.trim() || "",
    location_id: input.location_id?.trim() || "",
    computed: report ? computeNdtMetrics(input, report) : current[key]?.computed,
    updated_at: new Date().toISOString(),
  };
  current[key] = record;
  writeNdtStore(current);
}

export function getNdtForVessel(vesselId: string): NdtInspectionRecord | null {
  const key = normalizeVesselId(vesselId);
  if (!key) return null;
  return readNdtStore()[key] ?? null;
}

export function enrichInspectionsWithNdt(inspections: Inspection[]): Inspection[] {
  if (typeof window === "undefined") return inspections;
  const store = readNdtStore();
  return inspections.map((ins) => {
    const key = normalizeVesselId(ins.inspection_id ?? ins.id);
    const ndt = store[key];
    if (!ndt) return ins;
    return {
      ...ins,
      ndt_location_id: ndt.location_id ?? null,
      ndt_initial_thickness_mm: ndt.computed?.initial_thickness_mm ?? toNumber(ndt.thickness_mm),
      ndt_estimated_loss_percent: ndt.computed?.estimated_loss_percent ?? null,
      ndt_estimated_final_thickness_mm: ndt.computed?.estimated_final_thickness_mm ?? null,
    };
  }) as Inspection[];
}
