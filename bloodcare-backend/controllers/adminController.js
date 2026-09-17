const { pool, query } = require("../config/db");
const { isValidId, isValidRole } = require("../utils/validation");

// GET /api/admin/stats
// Retrieves high-level dashboard metrics concurrently using Promise.all
async function getStats(req, res) {
    try {
        const [
            [[donorCount]],
            [[stockTotal]],
            [[requestCount]],
            [[pendingCount]],
        ] = await Promise.all([
            pool.execute("SELECT COUNT(*) AS totalDonors FROM donors"),
            pool.execute("SELECT COALESCE(SUM(units), 0) AS totalUnits FROM blood_stock"),
            pool.execute("SELECT COUNT(*) AS totalRequests FROM blood_requests"),
            pool.execute("SELECT COUNT(*) AS pendingRequests FROM blood_requests WHERE status = 'pending'"),
        ]);

        res.json({
            success: true,
            message: "Dashboard statistics retrieved.",
            data: {
                totalDonors: Number(donorCount.totalDonors),
                totalUnits: Number(stockTotal.totalUnits),
                totalRequests: Number(requestCount.totalRequests),
                pendingRequests: Number(pendingCount.pendingRequests),
            },
        });
    } catch (err) {
        console.error("getStats error:", err.message);
        res.status(500).json({ success: false, message: "Could not retrieve dashboard statistics." });
    }
}

// GET /api/admin/users
// Admin-only user directory (never exposes password hashes)
async function getUsers(req, res) {
    try {
        const users = await query(
            "SELECT id, name, email, role, is_active, created_at, updated_at FROM users ORDER BY id DESC"
        );
        res.json({
            success: true,
            message: "Users retrieved successfully.",
            data: { count: users.length, users },
        });
    } catch (err) {
        console.error("getUsers error:", err.message);
        res.status(500).json({ success: false, message: "Could not retrieve users." });
    }
}

// PATCH /api/admin/users/:id/status
// Admin can activate or deactivate user accounts. Prevents self-deactivation.
async function toggleUserStatus(req, res) {
    const targetId = req.params.id;

    if (!isValidId(targetId)) {
        return res.status(400).json({ success: false, message: "Invalid user ID." });
    }

    // Safety rule: Prevent admin from deactivating their own account
    if (req.user.id === Number(targetId)) {
        return res.status(400).json({
            success: false,
            message: "Administrators cannot deactivate their own account.",
        });
    }

    try {
        const rows = await query("SELECT id, name, email, role, is_active FROM users WHERE id = ?", [targetId]);
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        const user = rows[0];
        const newStatus = user.is_active ? 0 : 1;

        await query("UPDATE users SET is_active = ? WHERE id = ?", [newStatus, targetId]);

        const [updated] = await query(
            "SELECT id, name, email, role, is_active, updated_at FROM users WHERE id = ?",
            [targetId]
        );

        res.json({
            success: true,
            message: `User account has been ${newStatus === 1 ? "activated" : "deactivated"}.`,
            data: { user: updated },
        });
    } catch (err) {
        console.error("toggleUserStatus error:", err.message);
        res.status(500).json({ success: false, message: "Could not toggle user status." });
    }
}

// PATCH /api/admin/users/:id/role
// Admin can change user roles (e.g. promote donor to employee). Prevents self-demotion.
async function changeUserRole(req, res) {
    const targetId = req.params.id;
    const { role } = req.body;

    if (!isValidId(targetId)) {
        return res.status(400).json({ success: false, message: "Invalid user ID." });
    }

    const newRole = String(role || "").toLowerCase().trim();

    if (!isValidRole(newRole)) {
        return res.status(400).json({
            success: false,
            message: "role must be one of: admin, employee, donor, requester.",
        });
    }

    // Safety rule: Prevent admin from altering their own role
    if (req.user.id === Number(targetId)) {
        return res.status(400).json({
            success: false,
            message: "Administrators cannot alter their own role.",
        });
    }

    try {
        const rows = await query("SELECT id, role FROM users WHERE id = ?", [targetId]);
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        await query("UPDATE users SET role = ? WHERE id = ?", [newRole, targetId]);

        const [updated] = await query(
            "SELECT id, name, email, role, is_active, updated_at FROM users WHERE id = ?",
            [targetId]
        );

        res.json({
            success: true,
            message: `User role changed to ${newRole}.`,
            data: { user: updated },
        });
    } catch (err) {
        console.error("changeUserRole error:", err.message);
        res.status(500).json({ success: false, message: "Could not change user role." });
    }
}

module.exports = {
    getStats,
    getUsers,
    toggleUserStatus,
    changeUserRole,
};

