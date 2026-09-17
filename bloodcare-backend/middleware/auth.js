const jwt = require("jsonwebtoken");
const { query } = require("../config/db");

/**
 * Hardened authentication middleware:
 * 1. Verifies JWT signature and expiry.
 * 2. Validates against the live database that the user exists.
 * 3. Confirms user account is active (is_active = 1).
 * 4. Attaches live database user (with authoritative role) to req.user.
 */
async function protect(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            success: false,
            message: "Not authorized. No token provided.",
        });
    }

    const token = authHeader.split(" ")[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Verify live user status in database
        const rows = await query(
            "SELECT id, name, email, role, is_active FROM users WHERE id = ?",
            [decoded.id]
        );

        if (!rows.length) {
            return res.status(401).json({
                success: false,
                message: "User account no longer exists.",
            });
        }

        const user = rows[0];

        if (!user.is_active) {
            return res.status(403).json({
                success: false,
                message: "This account has been deactivated. Please contact an administrator.",
            });
        }

        req.user = user;
        next();
    } catch (err) {
        return res.status(401).json({
            success: false,
            message: "Not authorized. Invalid or expired token.",
        });
    }
}

/**
 * Optional authentication:
 * If a valid Bearer token is passed, verifies user in database and attaches req.user.
 * If no token is provided, execution proceeds with req.user = null.
 */
async function optionalProtect(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        req.user = null;
        return next();
    }

    const token = authHeader.split(" ")[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const rows = await query(
            "SELECT id, name, email, role, is_active FROM users WHERE id = ?",
            [decoded.id]
        );

        if (rows.length && rows[0].is_active) {
            req.user = rows[0];
        } else {
            req.user = null;
        }
    } catch {
        req.user = null;
    }

    next();
}

/**
 * Restricts route access to specified roles (e.g. authorize('admin', 'employee'))
 * Role is strictly checked from server-side req.user populated from database.
 */
function authorize(...roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: "Forbidden. Insufficient permissions.",
            });
        }
        next();
    };
}

module.exports = { protect, optionalProtect, authorize };