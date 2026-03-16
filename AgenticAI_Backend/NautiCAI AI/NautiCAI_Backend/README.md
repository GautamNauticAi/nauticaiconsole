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

## Running the backend (API + optional Telegram bot)

### Start API only
```bash
python nauticai_api.py
```

### Start API and Telegram bot together (single process to run)
Set `NAUTICAI_START_TELEGRAM_BOT=1` so the backend starts the bot automatically. One terminal = API + bot; stop both with Ctrl+C.

**Windows (PowerShell):**
```powershell
$env:NAUTICAI_START_TELEGRAM_BOT="1"; python nauticai_api.py
```

**Linux/macOS:**
```bash
NAUTICAI_START_TELEGRAM_BOT=1 python nauticai_api.py
```

Or add to your `.env`: `NAUTICAI_START_TELEGRAM_BOT=1` (and ensure the app loads `.env` before this check).

---

## Running the Telegram Bot 24/7 (standalone)

If you prefer to run the bot in a separate terminal or server:

### Step 1: Add your Telegram Token
Open `nauticai_telegram_bot.py` or set in `.env`: `TELEGRAM_BOT_TOKEN=your_token`

### Step 2: Run the bot
```bash
python nauticai_telegram_bot.py
```

### Step 3: Keep it running 24/7 on the server
```bash
nohup python nauticai_telegram_bot.py &
```
