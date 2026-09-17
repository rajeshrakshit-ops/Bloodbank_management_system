-- ============================================================
-- BloodCare — Seed Data
-- Run this AFTER schema.sql, once, to set up initial data.
--
-- Safe to re-run: uses INSERT IGNORE, so it will not overwrite
-- or duplicate rows that already exist (e.g. if an admin has
-- since adjusted stock levels, re-running this will NOT reset
-- them back to these starting values).
-- ============================================================

USE bloodcare;

-- ------------------------------------------------------------
-- Initial blood stock (matches the numbers already shown in
-- the existing frontend, so the UI looks the same on first run)
-- ------------------------------------------------------------
INSERT IGNORE INTO blood_stock (blood_group, units) VALUES
    ('A+', 12),
    ('A-', 8),
    ('B+', 15),
    ('B-', 6),
    ('O+', 20),
    ('O-', 5),
    ('AB+', 9),
    ('AB-', 4);

-- ------------------------------------------------------------
-- Development admin account
--
-- Email:    admin@bloodcare.com
-- Password: admin123          <-- PLAINTEXT, FOR LOCAL DEV ONLY
--
-- The password below is NOT stored in plaintext — it is a
-- pre-computed bcrypt hash (cost factor 12) of "admin123".
-- bcrypt hashes are salted, so this exact string will only ever
-- verify against the password "admin123" — it cannot be reversed
-- to reveal it, and it will verify correctly using bcrypt/bcryptjs
-- compare() in Node exactly like any hash generated at runtime.
--
-- IMPORTANT: change this password immediately if this project is
-- ever deployed anywhere beyond local/academic development.
-- ------------------------------------------------------------
INSERT IGNORE INTO users (name, email, password_hash, role, is_active) VALUES
    (
        'Administrator',
        'admin@bloodcare.com',
        '$2b$12$NRfFsRmH2WC.74auK.mpBu5cix/6r6yJ945IYDfnANaVwyWrW2L5a',
        'admin',
        1
    );
