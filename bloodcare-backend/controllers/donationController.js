const { query, getConnection } = require("../config/db");
const {
    isValidId,
    isValidUnits,
    isValidDonationDate,
} = require("../utils/validation");

// Application business rule: configurable minimum days required between blood donations (default 56 days)
const DONATION_INTERVAL_DAYS = process.env.DONATION_INTERVAL_DAYS
    ? Number(process.env.DONATION_INTERVAL_DAYS)
    : 56;

// POST /api/donations
async function recordDonation(req, res) {
    const { donorId, units, donationDate } = req.body;

    if (!isValidId(donorId)) {
        return res.status(400).json({
            success: false,
            message: "A valid donorId (positive whole number) is required.",
        });
    }

    if (!isValidUnits(units, 5)) {
        return res.status(400).json({
            success: false,
            message: "Units donated must be a positive whole number between 1 and 5.",
        });
    }

    let date = donationDate ? String(donationDate).trim() : new Date().toISOString().slice(0, 10);

    if (donationDate && !isValidDonationDate(date)) {
        return res.status(400).json({
            success: false,
            message: "Invalid donation date. Date must be in YYYY-MM-DD format and cannot be in the future.",
        });
    }

    const conn = await getConnection();

    try {
        await conn.beginTransaction();

        // 1. Lock and verify donor
        const [donorRows] = await conn.execute(
            "SELECT * FROM donors WHERE id = ? FOR UPDATE",
            [donorId]
        );

        if (donorRows.length === 0) {
            await conn.rollback();
            return res.status(404).json({ success: false, message: "Donor not found." });
        }

        const donor = donorRows[0];

        // 2. Application Business Rule: Enforce minimum interval between donations
        if (donor.last_donation_date) {
            const lastDate = new Date(donor.last_donation_date);
            const currentDate = new Date(date);
            const diffTime = currentDate.getTime() - lastDate.getTime();
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays < DONATION_INTERVAL_DAYS) {
                await conn.rollback();
                return res.status(400).json({
                    success: false,
                    message: `Application business rule: A minimum interval of ${DONATION_INTERVAL_DAYS} days is required between donations. Last recorded donation was ${diffDays} days ago on ${donor.last_donation_date}.`,
                });
            }
        }

        // 3. Lock and verify blood stock for donor's blood group
        const [stockRows] = await conn.execute(
            "SELECT * FROM blood_stock WHERE blood_group = ? FOR UPDATE",
            [donor.blood_group]
        );

        if (stockRows.length === 0) {
            await conn.rollback();
            return res.status(500).json({
                success: false,
                message: `No stock record exists for blood group ${donor.blood_group}. Donation not recorded.`,
            });
        }

        // 4. Record donation
        const [insertResult] = await conn.execute(
            `INSERT INTO donations (donor_id, units, donation_date, recorded_by)
             VALUES (?, ?, ?, ?)`,
            [donorId, Number(units), date, req.user.id]
        );

        // 5. Increment stock
        await conn.execute(
            "UPDATE blood_stock SET units = units + ? WHERE blood_group = ?",
            [Number(units), donor.blood_group]
        );

        // 6. Update donor's last donation date
        await conn.execute(
            "UPDATE donors SET last_donation_date = ? WHERE id = ?",
            [date, donorId]
        );

        await conn.commit();

        const [donationRows] = await conn.execute(
            `SELECT d.*, dn.name AS donor_name, dn.blood_group
             FROM donations d
             JOIN donors dn ON dn.id = d.donor_id
             WHERE d.id = ?`,
            [insertResult.insertId]
        );

        res.status(201).json({
            success: true,
            message: `Donation recorded successfully! Added ${units} units to ${donor.blood_group} stock.`,
            data: { donation: donationRows[0] },
        });
    } catch (err) {
        await conn.rollback();
        console.error("recordDonation error:", err.message);
        res.status(500).json({ success: false, message: "Could not record donation due to a server error." });
    } finally {
        conn.release();
    }
}

// GET /api/donations (Staff)
async function getDonations(req, res) {
    try {
        const rows = await query(
            `SELECT d.*, dn.name AS donor_name, dn.blood_group, u.name AS recorded_by_name
             FROM donations d
             JOIN donors dn ON dn.id = d.donor_id
             LEFT JOIN users u ON u.id = d.recorded_by
             ORDER BY d.donation_date DESC, d.id DESC`
        );
        res.json({ success: true, message: "Donations retrieved.", data: { count: rows.length, donations: rows } });
    } catch (err) {
        console.error("getDonations error:", err.message);
        res.status(500).json({ success: false, message: "Could not retrieve donations." });
    }
}

// GET /api/donations/mine (Authenticated Donor)
async function getMyDonations(req, res) {
    try {
        const rows = await query(
            `SELECT d.*, dn.name AS donor_name, dn.blood_group
             FROM donations d
             JOIN donors dn ON dn.id = d.donor_id
             WHERE dn.user_id = ?
             ORDER BY d.donation_date DESC, d.id DESC`,
            [req.user.id]
        );
        res.json({ success: true, message: "Your donation history retrieved.", data: { count: rows.length, donations: rows } });
    } catch (err) {
        console.error("getMyDonations error:", err.message);
        res.status(500).json({ success: false, message: "Could not retrieve your donation history." });
    }
}

// GET /api/donations/:id
async function getDonationById(req, res) {
    if (!isValidId(req.params.id)) {
        return res.status(400).json({ success: false, message: "Invalid donation ID." });
    }

    try {
        const rows = await query(
            `SELECT d.*, dn.name AS donor_name, dn.blood_group, dn.user_id AS donor_user_id
             FROM donations d
             JOIN donors dn ON dn.id = d.donor_id
             WHERE d.id = ?`,
            [req.params.id]
        );
        if (rows.length === 0) return res.status(404).json({ success: false, message: "Donation not found." });

        const donation = rows[0];
        const isStaff = ["admin", "employee"].includes(req.user.role);
        const isOwner = req.user.role === "donor" && donation.donor_user_id === req.user.id;

        if (!isStaff && !isOwner) {
            return res.status(403).json({ success: false, message: "Forbidden. You cannot view this donation." });
        }

        res.json({ success: true, message: "Donation retrieved.", data: { donation } });
    } catch (err) {
        console.error("getDonationById error:", err.message);
        res.status(500).json({ success: false, message: "Could not retrieve donation." });
    }
}

module.exports = { recordDonation, getDonations, getMyDonations, getDonationById };
