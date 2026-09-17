const { query, getConnection } = require("../config/db");
const { isValidBloodGroup } = require("../utils/validation");

function isNonNegativeInteger(value) {
    if (value === null || value === undefined || value === "") return false;
    const num = Number(value);
    return Number.isInteger(num) && num >= 0 && num <= 10000;
}

function isInteger(value) {
    if (value === null || value === undefined || value === "") return false;
    const num = Number(value);
    return Number.isInteger(num) && Math.abs(num) <= 1000;
}

// GET /api/stock
async function getStock(req, res) {
    try {
        const stock = await query("SELECT id, blood_group, units, updated_at FROM blood_stock ORDER BY id");
        res.json({ success: true, message: "Blood stock retrieved.", data: { stock } });
    } catch (err) {
        console.error("getStock error:", err.message);
        res.status(500).json({ success: false, message: "Could not retrieve blood stock." });
    }
}

// GET /api/stock/:bloodGroup
async function getStockByGroup(req, res) {
    const group = req.params.bloodGroup;

    if (!isValidBloodGroup(group)) {
        return res.status(400).json({ success: false, message: "Invalid blood group." });
    }

    try {
        const rows = await query("SELECT id, blood_group, units, updated_at FROM blood_stock WHERE blood_group = ?", [group]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: "Blood group not found." });
        res.json({ success: true, message: "Stock retrieved.", data: { stock: rows[0] } });
    } catch (err) {
        console.error("getStockByGroup error:", err.message);
        res.status(500).json({ success: false, message: "Could not retrieve stock." });
    }
}

// PUT /api/stock/:bloodGroup
// Transactionally overrides stock units with row-locking to prevent lost updates
async function setStock(req, res) {
    const group = req.params.bloodGroup;
    const { units } = req.body;

    if (!isValidBloodGroup(group)) {
        return res.status(400).json({ success: false, message: "Invalid blood group." });
    }
    if (!isNonNegativeInteger(units)) {
        return res.status(400).json({ success: false, message: "units must be a non-negative whole number (0 - 10000)." });
    }

    const conn = await getConnection();

    try {
        await conn.beginTransaction();

        const [rows] = await conn.execute(
            "SELECT id, blood_group, units FROM blood_stock WHERE blood_group = ? FOR UPDATE",
            [group]
        );

        if (rows.length === 0) {
            await conn.rollback();
            return res.status(404).json({ success: false, message: "Blood group not found." });
        }

        await conn.execute(
            "UPDATE blood_stock SET units = ? WHERE blood_group = ?",
            [Number(units), group]
        );

        await conn.commit();

        const [updatedRows] = await conn.execute(
            "SELECT id, blood_group, units, updated_at FROM blood_stock WHERE blood_group = ?",
            [group]
        );

        res.json({ success: true, message: "Stock updated successfully.", data: { stock: updatedRows[0] } });
    } catch (err) {
        await conn.rollback();
        console.error("setStock error:", err.message);
        res.status(500).json({ success: false, message: "Could not update stock due to a server error." });
    } finally {
        conn.release();
    }
}

// PATCH /api/stock/:bloodGroup/adjust
// Adjusts stock delta atomically within a transaction
async function adjustStock(req, res) {
    const group = req.params.bloodGroup;
    const { delta } = req.body;

    if (!isValidBloodGroup(group)) {
        return res.status(400).json({ success: false, message: "Invalid blood group." });
    }
    if (!isInteger(delta)) {
        return res.status(400).json({ success: false, message: "delta must be a whole number between -1000 and 1000." });
    }

    const conn = await getConnection();

    try {
        await conn.beginTransaction();

        const [rows] = await conn.execute(
            "SELECT id, blood_group, units FROM blood_stock WHERE blood_group = ? FOR UPDATE",
            [group]
        );

        if (rows.length === 0) {
            await conn.rollback();
            return res.status(404).json({ success: false, message: "Blood group not found." });
        }

        const current = rows[0].units;
        const newUnits = current + Number(delta);

        if (newUnits < 0) {
            await conn.rollback();
            return res.status(400).json({
                success: false,
                message: `Resulting stock cannot be negative. Current stock is ${current} units.`,
            });
        }

        if (newUnits > 10000) {
            await conn.rollback();
            return res.status(400).json({
                success: false,
                message: "Resulting stock exceeds maximum allowed bank capacity (10,000 units).",
            });
        }

        await conn.execute(
            "UPDATE blood_stock SET units = ? WHERE blood_group = ?",
            [newUnits, group]
        );

        await conn.commit();

        const [updatedRows] = await conn.execute(
            "SELECT id, blood_group, units, updated_at FROM blood_stock WHERE blood_group = ?",
            [group]
        );

        res.json({
            success: true,
            message: `Stock adjusted by ${Number(delta) > 0 ? "+" + delta : delta} units.`,
            data: { stock: updatedRows[0] },
        });
    } catch (err) {
        await conn.rollback();
        console.error("adjustStock error:", err.message);
        res.status(500).json({ success: false, message: "Could not adjust stock." });
    } finally {
        conn.release();
    }
}

module.exports = { getStock, getStockByGroup, setStock, adjustStock };

