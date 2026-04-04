# ==========================================
# NautiCAI Telegram Bot
# Run this file to keep the bot alive 24/7
# ==========================================
import io
import os
import sys
import time
import json
import urllib.request
import urllib.parse
import urllib.error
from pathlib import Path
try:
    from dotenv import dotenv_values

    _dir = Path(__file__).resolve().parent
    _root_env = _dir.parent.parent.parent / ".env"  # NautiCAI repo root
    _local_env = _dir / ".env"
    # Merge non-empty values only: empty TELEGRAM_BOT_TOKEN= in backend .env must not
    # wipe a token set in NautiCAI/.env (load_dotenv default merge cannot do that).
    _merged = {}
    for _path in (_root_env, _local_env):
        if _path.is_file():
            for _k, _v in dotenv_values(_path).items():
                if _v is not None and str(_v).strip() != "":
                    _merged[_k] = str(_v).strip()
    for _k, _v in _merged.items():
        os.environ[_k] = _v
except ImportError:
    pass
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.error import Conflict, NetworkError
from telegram.ext import (
    Application,
    CommandHandler,
    CallbackQueryHandler,
    MessageHandler,
    filters,
    ContextTypes
)

# ==========================================
# TELEGRAM TOKEN (from .env or environment only — never commit tokens)
# ==========================================
TELEGRAM_BOT_TOKEN = (os.environ.get("TELEGRAM_BOT_TOKEN") or "").strip()
if not TELEGRAM_BOT_TOKEN:
    print("[NautiCAI Bot] TELEGRAM_BOT_TOKEN is not set.")
    print("  Add to AgenticAI_Backend/.../NautiCAI_Backend/.env or NautiCAI/.env:")
    print('  TELEGRAM_BOT_TOKEN="123456:ABC-DEF..."')

# API base URL for validating username (same server as nauticai_api)
TELEGRAM_VALIDATE_URL = (os.environ.get("TELEGRAM_VALIDATE_URL") or os.environ.get("NEXT_PUBLIC_API_URL") or "http://localhost:8000").rstrip("/")
STATE_WAITING_USERNAME = "waiting_username"

# ==========================================
# TELEGRAM BOT MENU
# ==========================================
def build_main_menu():
    keyboard = [
        [InlineKeyboardButton("View IMO Rating Scale", callback_data="view_rating")],
        [InlineKeyboardButton("Download Latest Report", callback_data="download_pdf")],
        [InlineKeyboardButton("About NautiCAI", callback_data="about")]
    ]
    return InlineKeyboardMarkup(keyboard)

def validate_username(username: str):
    """Call API to validate username. Returns (found: bool, display_name: str or None)."""
    try:
        url = f"{TELEGRAM_VALIDATE_URL}/api/telegram/validate?username={urllib.parse.quote(username)}"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=8) as r:
            data = json.loads(r.read().decode())
        if data.get("found"):
            return True, data.get("username") or "User"
        return False, None
    except Exception as e:
        print(f"[NautiCAI Bot] Validate error: {e}")
        return False, None


async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data.pop("username", None)
    context.user_data.pop("entered_username", None)
    context.user_data["state"] = STATE_WAITING_USERNAME
    await update.message.reply_text(
        "*Welcome to NautiCAI Enterprise System*\n\n"
        "Professional Automated Hull Inspection Service.\n\n"
        "Please enter your *username* to continue.\n"
        "(You chose this when you signed up; it is also shown in the web app top bar when logged in.)",
        parse_mode="Markdown",
    )

async def handle_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """When user sends a message and we're waiting for username, validate and show menu or error."""
    if context.user_data.get("state") != STATE_WAITING_USERNAME:
        return
    entered = (update.message.text or "").strip()
    if not entered:
        await update.message.reply_text("Please enter your username (or send /start to try again).")
        return
    found, display_name = validate_username(entered)
    context.user_data.pop("state", None)
    if found:
        context.user_data["username"] = display_name
        context.user_data["entered_username"] = entered  # raw username for API (latest-pdf, latest-report)
        await update.message.reply_text(
            f"Hi *{display_name}*, below are the options:",
            parse_mode="Markdown",
            reply_markup=build_main_menu(),
        )
    else:
        await update.message.reply_text(
            "No user found.\n\n"
            "Check your username (the one you chose at signup, or see it in the web app top bar when logged in).\n"
            "Send /start to try again.",
        )


async def button_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    if not context.user_data.get("username"):
        await query.edit_message_text("Please send /start and enter your username first.")
        return

    if query.data == "view_rating":
        rating_info = (
            "*Official IMO Biofouling Rating Scale*\n"
            "━━━━━━━━━━━━━━━━━━━━━━\n"
            "*FR-0 - Clean*\n"
            "No visible fouling. Hull is smooth.\n\n"
            "*FR-1 - Microfouling*\n"
            "Slime layer only. No drag impact.\n\n"
            "*FR-2 - Light Macrofouling*\n"
            "Minor fouling covering less than 5%.\n\n"
            "*FR-3 - Medium Macrofouling*\n"
            "Fouling covering 5% to 20%. Significant drag.\n\n"
            "*FR-4 - Heavy Macrofouling*\n"
            "Fouling covering over 20%. Critical impact.\n"
            "━━━━━━━━━━━━━━━━━━━━━━"
        )
        await query.edit_message_text(
            rating_info,
            parse_mode='Markdown',
            reply_markup=build_main_menu()
        )

    elif query.data == "download_pdf":
        un = context.user_data.get("entered_username")
        if not un:
            await query.edit_message_text("Please send /start and enter your username first.", reply_markup=build_main_menu())
            return
        await query.edit_message_text("*Preparing your latest inspection report...*", parse_mode="Markdown")
        try:
            url = f"{TELEGRAM_VALIDATE_URL}/api/telegram/latest-pdf?username={urllib.parse.quote(un)}"
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=15) as r:
                pdf_bytes = r.read()
                cd = r.headers.get("Content-Disposition")
                filename = "Inspection_Report.pdf"
                if cd and "filename=" in cd:
                    filename = cd.split("filename=")[-1].strip('"\'')
                await context.bot.send_document(
                    chat_id=query.message.chat_id,
                    document=io.BytesIO(pdf_bytes),
                    filename=filename,
                    caption=(
                        "Official NautiCAI Hull Inspection Report\n"
                        "IMO Biofouling Guidelines Compliant"
                    ),
                )
            await context.bot.send_message(
                chat_id=query.message.chat_id,
                text="PDF delivered. What would you like to do next?",
                reply_markup=build_main_menu(),
            )
        except urllib.error.HTTPError as e:
            if e.code == 404:
                await context.bot.send_message(
                    chat_id=query.message.chat_id,
                    text="No inspections yet. Run an inspection in the NautiCAI web app first; then your latest report will be available here.",
                    reply_markup=build_main_menu(),
                )
            else:
                await context.bot.send_message(
                    chat_id=query.message.chat_id,
                    text="Could not fetch the report. Please try again.",
                    reply_markup=build_main_menu(),
                )
        except Exception as ex:
            print(f"[NautiCAI Bot] download_pdf error: {ex}")
            await context.bot.send_message(
                chat_id=query.message.chat_id,
                text="Could not fetch the report. Please try again.",
                reply_markup=build_main_menu(),
            )

    elif query.data == "about":
        about_text = (
            "*About NautiCAI*\n"
            "━━━━━━━━━━━━━━━━━━━━━━\n"
            "NautiCAI is an enterprise maritime platform "
            "that automates underwater hull inspections.\n\n"
            "*Key Benefits:*\n"
            "- Instant audit-ready reports\n"
            "- Official IMO compliance ratings\n"
            "- Real-time hull condition monitoring\n"
            "- Significant fuel savings\n"
            "━━━━━━━━━━━━━━━━━━━━━━"
        )
        await query.edit_message_text(
            about_text,
            parse_mode='Markdown',
            reply_markup=build_main_menu()
        )

# ==========================================
# ERROR HANDLER (Conflict exit; NetworkError log and retry; others re-raise)
# ==========================================
_last_network_log: float = 0
NETWORK_LOG_INTERVAL = 60  # seconds

async def _error_handler(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    err = context.error
    if isinstance(err, Conflict):
        print(
            "\n[NautiCAI Bot] CONFLICT: Another process is already running this bot (same token).\n"
            "  → Run only ONE of: (a) this script in a terminal, or (b) backend with NAUTICAI_START_TELEGRAM_BOT=1.\n"
            "  → To use two terminals (backend + bot), set NAUTICAI_START_TELEGRAM_BOT=0 in backend .env and restart the backend.\n"
        )
        sys.exit(1)
    if isinstance(err, NetworkError):
        global _last_network_log
        now = time.time()
        if now - _last_network_log >= NETWORK_LOG_INTERVAL:
            print(f"[NautiCAI Bot] Network error (Telegram API unreachable). Retrying... ({err!s})")
            _last_network_log = now
        # Do not re-raise: let the library retry polling
        return
    raise err


# ==========================================
# CLOUD RUN: listen on PORT for health checks (required by Cloud Run)
# ==========================================
def _start_health_server():
    port = int(os.environ.get("PORT", "8080"))
    try:
        import threading
        from http.server import HTTPServer, BaseHTTPRequestHandler

        class _HealthHandler(BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(200)
                self.send_header("Content-Type", "text/plain")
                self.end_headers()
                self.wfile.write(b"ok")
            def log_message(self, *args):
                pass

        server = HTTPServer(("0.0.0.0", port), _HealthHandler)
        server.socket.setsockopt(__import__("socket").SOL_SOCKET, __import__("socket").SO_REUSEADDR, 1)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        # Give the thread time to bind so Cloud Run's startup probe succeeds
        import time
        time.sleep(1)
        print(f"[NautiCAI Bot] Health server listening on 0.0.0.0:{port}")
    except Exception as e:
        print(f"[NautiCAI Bot] Health server failed: {e}")
        raise


# ==========================================
# START THE BOT
# ==========================================
def _can_reach_telegram_api() -> bool:
    """Fail fast with a clear message if DNS/network blocks api.telegram.org (common on Windows: 11001)."""
    import socket

    host, port = "api.telegram.org", 443
    try:
        socket.create_connection((host, port), timeout=8)
        return True
    except OSError as e:
        print(
            "[NautiCAI Bot] Cannot reach api.telegram.org:443 — bot needs the public internet.\n"
            "  Common causes: Wi‑Fi off, VPN/DNS issue, corporate firewall, or typo in proxy env vars.\n"
            "  Windows error 11001 = getaddrinfo failed (hostname could not be resolved).\n"
            f"  Detail: {e}"
        )
        return False


def main():
    # Start health server first so Cloud Run startup probe passes (must listen on PORT)
    _start_health_server()
    if not TELEGRAM_BOT_TOKEN:
        print("[NautiCAI Bot] Cannot start: TELEGRAM_BOT_TOKEN is not set (see messages above).")
        return
    if not _can_reach_telegram_api():
        print("[NautiCAI Bot] Fix network/DNS, then run again.")
        return
    print("[NautiCAI Bot] Starting Telegram Bot...")
    app = Application.builder().token(TELEGRAM_BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", start_command))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_text))
    app.add_handler(CallbackQueryHandler(button_handler))
    app.add_error_handler(_error_handler)
    print("[NautiCAI Bot] Bot is LIVE and running 24/7!")
    app.run_polling()

if __name__ == "__main__":
    main()
