# NautiCAI Backend API

## Overview
NautiCAI is an automated maritime hull inspection system that uses
AI vision models to detect biofouling and generate official IMO
compliance reports.

## Project Structure

```
NautiCAI_Backend/
├── nauticai_api.py              # Main FastAPI server
├── nauticai_hull_inspection.py  # AI Vision Pipeline
├── biofouling_best.pt            # YOLO model weights
├── sam_checkpoints/
│   └── sam_vit_b_01ec64.pth     # SAM model weights
├── requirements.txt              # Dependencies
└── README.md                     # This file
```

## Installation

### Step 1: Install Dependencies
```bash
pip install -r requirements.txt
```
