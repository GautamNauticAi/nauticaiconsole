-- Run this ONCE in Neon SQL Editor (neondb). One click "Run".
-- 1) Telegram User ID for bot login
-- 2) Per-user inspections for web app + Telegram PDF/Report

-- ----- 1. Telegram User ID (users table) -----
ALTER TABLE users
ADD COLUMN IF NOT EXISTS telegram_user_id VARCHAR(64) UNIQUE;

UPDATE users SET telegram_user_id = REPLACE(gen_random_uuid()::text, '-', '') WHERE telegram_user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_telegram_user_id ON users(telegram_user_id);

-- ----- 2. Agentic inspections (per-user vessels + Telegram latest PDF/Report) -----
CREATE TABLE IF NOT EXISTS agentic_inspections (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vessel_id VARCHAR(255) NOT NULL,
  inspection_timestamp TIMESTAMPTZ NOT NULL,
  image_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agentic_inspections_user_id ON agentic_inspections(user_id);
CREATE INDEX IF NOT EXISTS idx_agentic_inspections_user_vessel ON agentic_inspections(user_id, vessel_id);
CREATE INDEX IF NOT EXISTS idx_agentic_inspections_user_timestamp ON agentic_inspections(user_id, inspection_timestamp DESC);

-- ----- 3. Unique username (for Telegram and display) -----
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(64) UNIQUE;
UPDATE users SET username = 'user_' || id WHERE username IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
