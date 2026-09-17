const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { query } = require("../config/db");

function signToken(user) {
    return jwt.sign(
        { id: user.id, email: user.email, role: user.role, name: user.name },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );
}

function sanitizeUser(user) {
    const { password_hash, ...safe } = user;
    return safe;
}

const { isValidEmail } = require("../utils/validation");

async function register(req, res) {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const role = String(req.body.role || "").toLowerCase();

    if (!name || !email || !password || !role) {
        return res.status(400).json({ success: false, message: "name, email, password and role are required." });
    }
    if (!isValidEmail(email)) {
        return res.status(400).json({ success: false, message: "Please provide a valid email address." });
    }
    if (!["donor", "requester"].includes(role)) {
        return res.status(400).json({ success: false, message: "role must be donor or requester." });
    }
    if (password.length < 6) {
        return res.status(400).json({ success: false, message: "Password must be at least 6 characters." });
    }

    try {
        const existing = await query("SELECT id FROM users WHERE email = ?", [email]);
        if (existing.length) {
            return res.status(409).json({ success: false, message: "An account with this email already exists." });
        }

        // Async non-blocking bcrypt hash
        const hashed = await bcrypt.hash(password, 10);
        const result = await query(
            "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)",
            [name, email, hashed, role]
        );

        const rows = await query("SELECT * FROM users WHERE id = ?", [result.insertId]);
        const user = sanitizeUser(rows[0]);
        const token = signToken(user);

        res.status(201).json({
            success: true,
            message: "Registration successful.",
            data: { token, user },
        });
    } catch (err) {
        console.error("register error:", err.message);
        res.status(500).json({ success: false, message: "Could not complete registration." });
    }
}

async function login(req, res) {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const role = String(req.body.role || "").trim().toLowerCase();

    if (!email || !password || !role) {
        return res.status(400).json({ success: false, message: "email, password and role are required." });
    }
    if (!isValidEmail(email)) {
        return res.status(400).json({ success: false, message: "Please provide a valid email address." });
    }

    try {
        const rows = await query("SELECT * FROM users WHERE email = ? AND role = ?", [email, role]);
        if (!rows.length) {
            return res.status(401).json({ success: false, message: "Invalid email, password, or role." });
        }

        const user = rows[0];
        if (!user.is_active) {
            return res.status(403).json({ success: false, message: "This account has been deactivated." });
        }

        // Async non-blocking bcrypt compare
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            return res.status(401).json({ success: false, message: "Invalid email, password, or role." });
        }

        const safeUser = sanitizeUser(user);
        const token = signToken(safeUser);

        res.json({
            success: true,
            message: "Login successful.",
            data: { token, user: safeUser },
        });
    } catch (err) {
        console.error("login error:", err.message);
        res.status(500).json({ success: false, message: "Login failed. Please try again." });
    }
}

async function me(req, res) {
    try {
        const rows = await query("SELECT * FROM users WHERE id = ?", [req.user.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: "User not found." });

        res.json({
            success: true,
            message: "Current user.",
            data: { user: sanitizeUser(rows[0]) },
        });
    } catch (err) {
        console.error("me error:", err.message);
        res.status(500).json({ success: false, message: "Could not fetch current user." });
    }
}

module.exports = { register, login, me };
