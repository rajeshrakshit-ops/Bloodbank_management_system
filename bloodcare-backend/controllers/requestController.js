const { query, getConnection } = require("../config/db");
const {
    VALID_BLOOD_GROUPS,
    VALID_REQUEST_STATUSES,
    isValidId,
    isValidEmail,
    isValidPhone,
    isValidBloodGroup,
    isValidAge,
    isValidUnits,
} = require("../utils/validation");

// POST /api/requests
async function createRequest(req, res) {
    const { name, age, bloodGroup, units, hospital, phone, email, reason } = req.body;

    const trimmedName = String(name || "").trim();
    const trimmedHospital = String(hospital || "").trim();
    const trimmedPhone = String(phone || "").trim();
    const trimmedEmail = String(email || "").trim().toLowerCase();
    const trimmedReason = String(reason || "").trim();

    if (!trimmedName || !age || !bloodGroup || !units || !trimmedHospital || !trimmedPhone || !trimmedEmail || !trimmedReason) {
        return res.status(400).json({ success: false, message: "Please fill in all the details." });
    }

    if (!isValidBloodGroup(bloodGroup)) {
        return res.status(400).json({ success: false, message: "Invalid blood group specified." });
    }

    if (!isValidAge(age)) {
        return res.status(400).json({ success: false, message: "Age must be a positive whole number between 1 and 120." });
    }

    if (!isValidUnits(units, 20)) {
        return res.status(400).json({ success: false, message: "Requested units must be a whole number between 1 and 20." });
    }

    if (!isValidEmail(trimmedEmail)) {
        return res.status(400).json({ success: false, message: "Please provide a valid email address." });
    }

    if (!isValidPhone(trimmedPhone)) {
        return res.status(400).json({ success: false, message: "Please provide a valid phone number (7-15 digits)." });
    }

    try {
        const requesterId = req.user ? req.user.id : null;

        const result = await query(
            `INSERT INTO blood_requests
             (requester_id, requester_name, blood_group, units, hospital, phone, email, reason)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [requesterId, trimmedName, bloodGroup, Number(units), trimmedHospital, trimmedPhone, trimmedEmail, trimmedReason]
        );

        const rows = await query("SELECT * FROM blood_requests WHERE id = ?", [result.insertId]);
        res.status(201).json({
            success: true,
            message: "Blood request submitted successfully!",
            data: { request: rows[0] },
        });
    } catch (err) {
        console.error("createRequest error:", err.message);
        res.status(500).json({ success: false, message: "Could not submit blood request." });
    }
}

// GET /api/requests
async function getRequests(req, res) {
    const { status, bloodGroup } = req.query;
    let sql = "SELECT * FROM blood_requests WHERE 1=1";
    const params = [];

    if (status) {
        if (!VALID_REQUEST_STATUSES.includes(status.toLowerCase())) {
            return res.status(400).json({ success: false, message: "Invalid status query filter." });
        }
        sql += " AND status = ?";
        params.push(status.toLowerCase());
    }
    if (bloodGroup) {
        if (!isValidBloodGroup(bloodGroup)) {
            return res.status(400).json({ success: false, message: "Invalid blood group filter." });
        }
        sql += " AND blood_group = ?";
        params.push(bloodGroup);
    }

    sql += " ORDER BY created_at DESC";

    try {
        const requests = await query(sql, params);
        res.json({ success: true, message: "Requests retrieved.", data: { count: requests.length, requests } });
    } catch (err) {
        console.error("getRequests error:", err.message);
        res.status(500).json({ success: false, message: "Could not retrieve requests." });
    }
}

// GET /api/requests/mine
async function getMyRequests(req, res) {
    try {
        const requests = await query(
            "SELECT * FROM blood_requests WHERE requester_id = ? ORDER BY created_at DESC",
            [req.user.id]
        );
        res.json({ success: true, message: "Your requests retrieved.", data: { count: requests.length, requests } });
    } catch (err) {
        console.error("getMyRequests error:", err.message);
        res.status(500).json({ success: false, message: "Could not retrieve your requests." });
    }
}

// GET /api/requests/:id
async function getRequestById(req, res) {
    if (!isValidId(req.params.id)) {
        return res.status(400).json({ success: false, message: "Invalid request ID." });
    }

    try {
        const rows = await query("SELECT * FROM blood_requests WHERE id = ?", [req.params.id]);
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: "Request not found." });
        }

        const request = rows[0];
        const isStaff = ["admin", "employee"].includes(req.user.role);
        const isOwner = req.user.role === "requester" && request.requester_id === req.user.id;

        if (!isStaff && !isOwner) {
            return res.status(403).json({ success: false, message: "Forbidden. You cannot view this request." });
        }

        res.json({ success: true, message: "Request retrieved.", data: { request } });
    } catch (err) {
        console.error("getRequestById error:", err.message);
        res.status(500).json({ success: false, message: "Could not retrieve request." });
    }
}

// PATCH /api/requests/:id/status
// Enforces proper state machine transitions and prevents direct fulfillment
async function updateRequestStatus(req, res) {
    if (!isValidId(req.params.id)) {
        return res.status(400).json({ success: false, message: "Invalid request ID." });
    }

    const nextStatus = String(req.body.status || "").toLowerCase().trim();

    if (!VALID_REQUEST_STATUSES.includes(nextStatus)) {
        return res.status(400).json({
            success: false,
            message: `status must be one of: ${VALID_REQUEST_STATUSES.join(", ")}`,
        });
    }

    // STRICT BUSINESS RULE: Direct transition to 'fulfilled' via this endpoint is prohibited
    if (nextStatus === "fulfilled") {
        return res.status(400).json({
            success: false,
            message: "Directly setting status to 'fulfilled' is prohibited. Fulfill the request through POST /api/requests/:id/fulfill so that blood inventory is verified and deducted atomically.",
        });
    }

    try {
        const existing = await query("SELECT * FROM blood_requests WHERE id = ?", [req.params.id]);
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: "Request not found." });
        }

        const current = existing[0];

        // STRICT BUSINESS RULE: A fulfilled request cannot be reopened or casually modified
        if (current.status === "fulfilled") {
            return res.status(400).json({
                success: false,
                message: "This request has already been fulfilled and inventory was deducted. Its status cannot be altered.",
            });
        }

        // Validate allowed state transitions
        const allowedTransitions = {
            pending: ["approved", "rejected"],
            approved: ["rejected", "pending"],
            rejected: ["pending", "approved"],
        };

        if (!allowedTransitions[current.status] || !allowedTransitions[current.status].includes(nextStatus)) {
            return res.status(400).json({
                success: false,
                message: `Invalid state transition from '${current.status}' to '${nextStatus}'.`,
            });
        }

        await query("UPDATE blood_requests SET status = ? WHERE id = ?", [nextStatus, req.params.id]);

        const [updated] = await query("SELECT * FROM blood_requests WHERE id = ?", [req.params.id]);
        res.json({ success: true, message: `Request status updated to '${nextStatus}'.`, data: { request: updated } });
    } catch (err) {
        console.error("updateRequestStatus error:", err.message);
        res.status(500).json({ success: false, message: "Could not update request status." });
    }
}

// POST /api/requests/:id/fulfill
// Atomic fulfillment transaction with row-level locks
async function fulfillRequest(req, res) {
    if (!isValidId(req.params.id)) {
        return res.status(400).json({ success: false, message: "Invalid request ID." });
    }

    const conn = await getConnection();

    try {
        await conn.beginTransaction();

        // 1. Lock the request row
        const [requestRows] = await conn.execute(
            "SELECT * FROM blood_requests WHERE id = ? FOR UPDATE",
            [req.params.id]
        );
        if (requestRows.length === 0) {
            await conn.rollback();
            return res.status(404).json({ success: false, message: "Request not found." });
        }

        const request = requestRows[0];

        if (request.status === "fulfilled") {
            await conn.rollback();
            return res.status(400).json({ success: false, message: "Request is already fulfilled." });
        }

        if (request.status !== "approved") {
            await conn.rollback();
            return res.status(400).json({
                success: false,
                message: `Only an approved request can be fulfilled. Current status is '${request.status}'.`,
            });
        }

        // 2. Lock the matching blood stock row
        const [stockRows] = await conn.execute(
            "SELECT * FROM blood_stock WHERE blood_group = ? FOR UPDATE",
            [request.blood_group]
        );

        if (stockRows.length === 0) {
            await conn.rollback();
            return res.status(404).json({ success: false, message: "Blood group stock record not found." });
        }

        const stock = stockRows[0];

        // 3. Verify stock is sufficient
        if (stock.units < request.units) {
            await conn.rollback();
            return res.status(400).json({
                success: false,
                message: `Insufficient blood stock for ${request.blood_group}. Available: ${stock.units} units, requested: ${request.units} units.`,
            });
        }

        // 4. Atomic inventory deduction
        const [deductResult] = await conn.execute(
            "UPDATE blood_stock SET units = units - ? WHERE blood_group = ? AND units >= ?",
            [request.units, request.blood_group, request.units]
        );

        if (deductResult.affectedRows === 0) {
            await conn.rollback();
            return res.status(400).json({
                success: false,
                message: "Stock deduction conflict detected. Please try again.",
            });
        }

        // 5. Update request status to fulfilled
        await conn.execute(
            "UPDATE blood_requests SET status = 'fulfilled' WHERE id = ?",
            [request.id]
        );

        await conn.commit();

        const [updatedRows] = await conn.execute(
            "SELECT * FROM blood_requests WHERE id = ?",
            [request.id]
        );

        res.json({
            success: true,
            message: `Request fulfilled successfully! ${request.units} units deducted from ${request.blood_group} stock.`,
            data: { request: updatedRows[0] },
        });
    } catch (err) {
        await conn.rollback();
        console.error("fulfillRequest error:", err.message);
        res.status(500).json({ success: false, message: "Could not fulfill request due to a server error." });
    } finally {
        conn.release();
    }
}

// DELETE /api/requests/:id
async function deleteRequest(req, res) {
    if (!isValidId(req.params.id)) {
        return res.status(400).json({ success: false, message: "Invalid request ID." });
    }

    try {
        const result = await query("DELETE FROM blood_requests WHERE id = ?", [req.params.id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: "Request not found." });
        }
        res.json({ success: true, message: "Request deleted.", data: null });
    } catch (err) {
        console.error("deleteRequest error:", err.message);
        res.status(500).json({ success: false, message: "Could not delete request." });
    }
}

module.exports = {
    createRequest,
    getRequests,
    getMyRequests,
    getRequestById,
    updateRequestStatus,
    fulfillRequest,
    deleteRequest,
};
