# NautiCAI API - paste your complete code below
# ==========================================
# NautiCAI Backend API Server
# Version: 1.0.0
# Description: FastAPI server that exposes
# the NautiCAI Multi-Agent pipeline as REST
# API endpoints for the UI Dashboard.
# ==========================================

import os
import sys
import json
import shutil
from datetime import datetime
from fpdf import FPDF
import uvicorn
from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

# Add vision pipeline to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import nauticai_hull_inspection as vision_pipeline

# ==========================================
# INITIALIZE FASTAPI APP
# ==========================================
app = FastAPI(
    title="NautiCAI Backend API",
    description="Automated Maritime Hull Inspection System",
    version="1.0.0"
)

# Allow Gautam's UI to connect from any origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# LOAD AI MODELS ON STARTUP
# ==========================================
@app.on_event("startup")
async def load_models():
    print("[NautiCAI] Loading AI models...")
    vision_pipeline.load_models(
        yolo_path=os.path.join(
            os.path.dirname(__file__),
            "biofouling_best.pt"
        ),
        sam_path=os.path.join(
            os.path.dirname(__file__),
            "sam_checkpoints",
            "sam_vit_b_01ec64.pth"
        )
    )
    print("[NautiCAI] AI models loaded successfully!")

# ==========================================
# IMO BUSINESS LOGIC
# ==========================================
def calculate_imo_rating(coverage_percent):
    if coverage_percent == 0:
        return "FR-0 (Clean)", "No action required.", False
    elif coverage_percent < 5:
        return "FR-2 (Light Macrofouling)", "Monitor vessel condition regularly.", False
    elif 5 <= coverage_percent <= 20:
        return "FR-3 (Medium Macrofouling)", "ACTION REQUIRED: Schedule cleaning soon.", True
    else:
        return "FR-4 (Heavy Macrofouling - Critical!)", "URGENT: Immediate dry-dock cleaning required!", True

# ==========================================
# PDF GENERATOR
# ==========================================
class NautiCAIPDF(FPDF):
    def header(self):
        self.set_fill_color(0, 31, 63)
        self.rect(0, 0, 210, 40, 'F')
        self.set_font('Arial', 'B', 24)
        self.set_text_color(255, 255, 255)
        self.set_xy(10, 8)
        self.cell(0, 10, 'NautiCAI', 0, 1, 'L')
        self.set_font('Arial', 'I', 11)
        self.set_text_color(100, 200, 255)
        self.set_xy(10, 20)
        self.cell(0, 8, 'Professional Maritime Hull Inspection Service', 0, 1, 'L')
        self.set_font('Arial', 'B', 11)
        self.set_text_color(255, 255, 255)
        self.set_xy(120, 14)
        self.cell(80, 8, 'OFFICIAL HULL INSPECTION REPORT', 0, 1, 'R')
        self.set_fill_color(0, 188, 188)
        self.rect(0, 40, 210, 2, 'F')
        self.ln(20)

    def footer(self):
        self.set_y(-20)
        self.set_fill_color(0, 31, 63)
        self.rect(0, 277, 210, 20, 'F')
        self.set_font('Arial', 'I', 8)
        self.set_text_color(200, 200, 200)
        self.set_xy(10, 280)
        self.cell(0, 8,
            'NautiCAI Hull Inspection Services | '
            'IMO Biofouling Guidelines Compliant | '
            f'Page {self.page_no()}',
            0, 0, 'C')

    def section_title(self, title):
        self.set_fill_color(0, 51, 102)
        self.set_text_color(255, 255, 255)
        self.set_font('Arial', 'B', 12)
        self.cell(0, 10, f'  {title}', 0, 1, 'L', fill=True)
        self.ln(3)

    def info_row(self, label, value, highlight=False):
        if highlight:
            self.set_fill_color(240, 248, 255)
        else:
            self.set_fill_color(255, 255, 255)
        self.set_text_color(80, 80, 80)
        self.set_font('Arial', 'B', 11)
        self.cell(80, 9, f'  {label}:', 0, 0, 'L', fill=True)
        self.set_text_color(0, 0, 0)
        self.set_font('Arial', '', 11)
        self.cell(110, 9, str(value), 0, 1, 'L', fill=True)
        self.set_draw_color(220, 220, 220)
        self.line(10, self.get_y(), 200, self.get_y())

    def rating_badge(self, rating, requires_cleaning):
        self.ln(5)
        if requires_cleaning:
            self.set_fill_color(220, 20, 60)
            status_text = "!! IMMEDIATE CLEANING REQUIRED !!"
            status_color = (220, 20, 60)
        else:
            self.set_fill_color(34, 139, 34)
            status_text = "VESSEL CONDITION IS ACCEPTABLE"
            status_color = (34, 139, 34)
        self.set_text_color(255, 255, 255)
        self.set_font('Arial', 'B', 18)
        self.cell(0, 16, f'  {rating}  ', 0, 1, 'C', fill=True)
        self.set_font('Arial', 'B', 13)
        self.set_text_color(*status_color)
        self.cell(0, 10, status_text, 0, 1, 'C')
        self.ln(5)

def create_pdf(vessel_id, report_payload, output_folder):
    timestamp   = report_payload["metadata"]["inspection_timestamp"]
    coverage    = report_payload["ai_vision_metrics"]["total_hull_coverage_percentage"]
    severity    = report_payload["ai_vision_metrics"]["severity"]
    detections  = report_payload["ai_vision_metrics"]["total_detections"]
    rating      = report_payload["compliance_result"]["official_imo_rating"]
    action      = report_payload["compliance_result"]["recommended_action"]
    requires_cleaning = report_payload["compliance_result"]["requires_cleaning"]
    report_id   = f"NautiCAI-{datetime.now().strftime('%Y-%m-%d')}-001"

    pdf = NautiCAIPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()

    pdf.section_title("1. VESSEL INSPECTION DETAILS")
    pdf.info_row("Vessel ID", vessel_id, highlight=True)
    pdf.info_row("Inspection Date", timestamp)
    pdf.info_row("Report Number", report_id, highlight=True)
    pdf.info_row("Inspection Type", "Automated Underwater Hull Assessment")
    pdf.info_row("Report Status", "COMPLETED - Audit Trail Generated")
    pdf.ln(8)

    pdf.section_title("2. HULL CONDITION FINDINGS")
    pdf.info_row("Inspection Method", "Automated Underwater Inspection", highlight=True)
    pdf.info_row("Total Hull Coverage", f"{coverage}%")
    pdf.info_row("Overall Condition", severity, highlight=True)
    pdf.info_row("Fouling Areas Identified", str(detections))
    pdf.ln(8)

    pdf.section_title("3. OFFICIAL COMPLIANCE RATING")
    pdf.rating_badge(rating, requires_cleaning)

    if requires_cleaning:
        pdf.set_fill_color(255, 240, 240)
        pdf.set_draw_color(220, 20, 60)
    else:
        pdf.set_fill_color(240, 255, 240)
        pdf.set_draw_color(34, 139, 34)
    pdf.set_font('Arial', 'B', 11)
    pdf.set_text_color(50, 50, 50)
    pdf.multi_cell(0, 8, f'  Required Action: {action}', 1, 'L', fill=True)
    pdf.ln(8)

    pdf.section_title("4. COMPLIANCE DECLARATION")
    pdf.set_font('Arial', 'I', 10)
    pdf.set_text_color(80, 80, 80)
    pdf.multi_cell(0, 7,
        '  This report was issued in accordance with IMO Biofouling '
        'Guidelines Resolution MEPC.207(62). All findings are fully '
        'repeatable and auditable.',
        0, 'L')

    pdf_path = os.path.join(output_folder, f"{vessel_id}_Audit_Report.pdf")
    pdf.output(pdf_path)
    return pdf_path

# ==========================================
# API ENDPOINTS
# ==========================================

# Root endpoint
@app.get("/")
async def root():
    return {
        "system": "NautiCAI Backend API",
        "version": "1.0.0",
        "status": "online",
        "message": "NautiCAI Automated Hull Inspection System is running."
    }

# Health check
@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }

# Main inspection endpoint
# Gautam's UI will call this with an uploaded image
@app.post("/api/inspect")
async def run_inspection(
    vessel_id: str = Form(..., description="Vessel identifier"),
    image: UploadFile = File(...)
):
    """
    Main inspection endpoint.
    Accepts a vessel ID and hull image.
    Returns full inspection JSON report.
    """
    try:
        # 1. Save uploaded image temporarily
        temp_folder = "temp_uploads"
        os.makedirs(temp_folder, exist_ok=True)
        temp_image_path = os.path.join(temp_folder, image.filename)
        
        with open(temp_image_path, "wb") as buffer:
            shutil.copyfileobj(image.file, buffer)
        
        # 2. Run vision pipeline on uploaded image
        vision_report = vision_pipeline.process_image(temp_image_path)
        
        coverage   = vision_report["coverage_percent"]
        severity   = vision_report["severity"]
        detections = vision_report["detections"]
        
        # 3. Apply IMO Business Logic
        imo_rating, action, requires_cleaning = calculate_imo_rating(coverage)
        
        # 4. Build JSON report
        report_payload = {
            "metadata": {
                "vessel_id": vessel_id,
                "inspection_timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "system_status": "COMPLETED"
            },
            "ai_vision_metrics": {
                "total_hull_coverage_percentage": coverage,
                "severity": severity,
                "total_detections": len(detections)
            },
            "compliance_result": {
                "official_imo_rating": imo_rating,
                "recommended_action": action,
                "requires_cleaning": requires_cleaning
            }
        }
        
        # 5. Save JSON report
        reports_folder = "reports"
        os.makedirs(reports_folder, exist_ok=True)
        json_path = os.path.join(reports_folder, f"{vessel_id}_inspection_data.json")
        with open(json_path, "w") as f:
            json.dump(report_payload, f, indent=4)
        
        # 6. Generate PDF report
        create_pdf(vessel_id, report_payload, reports_folder)
        
        # 7. Clean up temp file
        os.remove(temp_image_path)
        
        return JSONResponse(content=report_payload)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Get latest JSON report for a vessel
@app.get("/api/vessel/{vessel_id}/latest-report")
async def get_latest_report(vessel_id: str):
    """
    Returns the latest inspection JSON for a vessel.
    Gautam's UI calls this to get data for the dashboard.
    """
    try:
        json_path = os.path.join("reports", f"{vessel_id}_inspection_data.json")
        with open(json_path, "r") as f:
            data = json.load(f)
        return JSONResponse(content=data)
    except FileNotFoundError:
        raise HTTPException(
            status_code=404,
            detail=f"No inspection report found for vessel {vessel_id}"
        )

# Download PDF report for a vessel
@app.get("/api/vessel/{vessel_id}/pdf")
async def download_pdf(vessel_id: str):
    """
    Returns the PDF report for a vessel.
    Gautam's UI calls this to download the PDF.
    """
    pdf_path = os.path.join("reports", f"{vessel_id}_Audit_Report.pdf")
    if os.path.exists(pdf_path):
        return FileResponse(
            path=pdf_path,
            filename=f"{vessel_id}_Audit_Report.pdf",
            media_type="application/pdf"
        )
    raise HTTPException(
        status_code=404,
        detail=f"No PDF report found for vessel {vessel_id}"
    )

# Get list of all inspected vessels
@app.get("/api/vessels/all")
async def get_all_vessels():
    """
    Returns a list of all vessels that have been inspected.
    Gautam's UI calls this to populate the vessel list.
    """
    reports_folder = "reports"
    vessels = []
    if os.path.exists(reports_folder):
        for file in os.listdir(reports_folder):
            if file.endswith("_inspection_data.json"):
                vessel_id = file.replace("_inspection_data.json", "")
                with open(os.path.join(reports_folder, file), "r") as f:
                    data = json.load(f)
                vessels.append({
                    "vessel_id": vessel_id,
                    "last_inspection": data["metadata"]["inspection_timestamp"],
                    "imo_rating": data["compliance_result"]["official_imo_rating"],
                    "requires_cleaning": data["compliance_result"]["requires_cleaning"]
                })
    return JSONResponse(content={"vessels": vessels})

# ==========================================
# RUN THE SERVER
# ==========================================
if __name__ == "__main__":
    uvicorn.run(
        "nauticai_api:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )