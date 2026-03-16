# Run NautiCAI (Agentic backend + frontend)

## 1. Start the backend

From the **NautiCAI** folder (project root):

```powershell
cd "AgenticAI_Backend\NautiCAI AI\NautiCAI_Backend"

# Optional: virtual environment
python -m venv venv
.\venv\Scripts\Activate.ps1

pip install -r requirements.txt
python nauticai_api.py
```

The API runs at **http://localhost:8000**. Docs: **http://localhost:8000/docs**

**Model files** (see MODEL_FILES_SETUP.md):

- `biofouling_best.pt` in this folder
- `sam_checkpoints/sam_vit_b_01ec64.pth` in this folder

**Optional:** In `.env`, set `NAUTICAI_START_TELEGRAM_BOT=1` to start the Telegram bot with the backend (single process).

---

## 2. Frontend env (optional)

In **NautiCAI/frontend** create `.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## 3. Start the frontend

From **NautiCAI/frontend**:

```bash
npm run dev
```

Open **http://localhost:3000**. Use Inspect, Dashboard, Reports; sign up / log in for auth.

---

## 4. Telegram bot (optional)

- **Auto with backend:** Set `NAUTICAI_START_TELEGRAM_BOT=1` in backend `.env`; bot starts with the API.
- **Standalone:** In a second terminal, from the same backend folder: `python nauticai_telegram_bot.py`.

Set `TELEGRAM_BOT_TOKEN` in backend `.env`. User ID validation uses Neon (POSTGRES_DSN) and `GET /api/telegram/validate`.
