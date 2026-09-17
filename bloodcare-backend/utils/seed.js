require("dotenv").config();
const bcrypt = require("bcryptjs");
const { query } = require("../config/db");

// Ensures the default admin account exists. Safe to call every startup —
// does nothing if the account is already there. This is a small safety
// net on top of database/seed.sql (which already inserts this account
// when you run it manually); it does not replace running seed.sql.
async function seedAdmin() {
    const email = process.env.ADMIN_EMAIL || "admin@bloodcare.com";
    const password = process.env.ADMIN_PASSWORD || "admin123";

    try {
        const existing = await query("SELECT id FROM users WHERE email = ?", [email]);

        if (existing.length > 0) {
            console.log(`Admin account already exists: ${email}`);
            return;
        }

        const hashed = bcrypt.hashSync(password, 10);

        await query(
            "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')",
            ["Administrator", email, hashed]
        );

        console.log(`Seeded admin account -> email: ${email}, password: ${password}`);
    } catch (err) {
        // Don't crash the server if seeding fails (e.g. MySQL not reachable yet) —
        // just log it clearly so it's obvious in the terminal.
        console.error("Admin seed check failed:", err.message);
    }
}

module.exports = { seedAdmin };