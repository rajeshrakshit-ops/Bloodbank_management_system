const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { query, getConnection } = require("../config/db");
const {
    isValidId,
    isValidEmail,
    isValidPhone,
    isValidBloodGroup,
    isValidDonorAge,
    isValidGender,
    isValidDonationDate,
    VALID_BLOOD_GROUPS,
} = require("../utils/validation");

function signToken(user) {
    return jwt.sign(
        { id: user.id, email: user.email, role: user.role, name: user.name },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );
}

// POST /api/donors
// Atomic registration: If user creation and donor creation are part of the same operation,
// both are committed or rolled back together in a transaction to prevent orphaned user records.
async function registerDonor(req, res) {
    const { name, age, gender, bloodGroup, phone, email, address, password } = req.body;

    const trimmedName = String(name || "").trim();
    const trimmedPhone = String(phone || "").trim();
    const trimmedEmail = String(email || "").trim().toLowerCase();
    const trimmedAddress = String(address || "").trim();

    if (!trimmedName || !age || !gender || !bloodGroup || !trimmedPhone || !trimmedEmail || !trimmedAddress) {
        return res.status(400).json({ success: false, message: "Please fill in all the details." });
    }
    if (!isValidBloodGroup(bloodGroup)) {
        return res.status(400).json({ success: false, message: "Invalid blood group specified." });
    }
    if (!isValidDonorAge(age)) {
        return res.status(400).json({ success: false, message: "Donor age must be a whole number between 18 and 65 years." });
    }
    if (!isValidGender(gender)) {
        return res.status(400).json({ success: false, message: "Invalid gender selected." });
    }
    if (!isValidEmail(trimmedEmail)) {
        return res.status(400).json({ success: false, message: "Please provide a valid email address." });
    }
    if (!isValidPhone(trimmedPhone)) {
        return res.status(400).json({ success: false, message: "Please provide a valid phone number (7-15 digits)." });
    }
    if (password && String(password).length < 6) {
        return res.status(400).json({ success: false, message: "Password must be at least 6 characters long." });
    }

    const conn = await getConnection();

    try {
        await conn.beginTransaction();

        let userId = null;
        let responseData = {};

        // Case 1: An existing authenticated donor is registering their donor profile
        if (req.user && req.user.role === "donor") {
            userId = req.user.id;
            const [existingProfile] = await conn.execute("SELECT id FROM donors WHERE user_id = ?", [userId]);
            if (existingProfile.length) {
                await conn.rollback();
                return res.status(409).json({ success: false, message: "This donor account already has a registered donor profile." });
            }
        }
        // Case 2: An unauthenticated registration supplying a password to create an account
        else if (password) {
            const [existingUser] = await conn.execute("SELECT id FROM users WHERE email = ?", [trimmedEmail]);
            if (existingUser.length) {
                await conn.rollback();
                return res.status(409).json({ success: false, message: "An account with this email already exists." });
            }

            // Async non-blocking bcrypt
            const hashed = await bcrypt.hash(password, 10);
            const [userResult] = await conn.execute(
                "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'donor')",
                [trimmedName, trimmedEmail, hashed]
            );
            userId = userResult.insertId;

            const [userRows] = await conn.execute("SELECT * FROM users WHERE id = ?", [userId]);
            const { password_hash, ...safeUser } = userRows[0];
            responseData.token = signToken(safeUser);
            responseData.user = safeUser;
        }

        // Insert donor profile
        const [donorResult] = await conn.execute(
            `INSERT INTO donors
             (user_id, name, age, gender, blood_group, phone, email, address)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, trimmedName, Number(age), gender, bloodGroup, trimmedPhone, trimmedEmail, trimmedAddress]
        );

        await conn.commit();

        const [createdDonor] = await query("SELECT * FROM donors WHERE id = ?", [donorResult.insertId]);
        responseData.donor = createdDonor;

        res.status(201).json({
            success: true,
            message: "Donor registration successful!",
            data: responseData,
        });
    } catch (err) {
        await conn.rollback();
        console.error("registerDonor error:", err.message);
        if (err.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                success: false,
                message: "This account or donor profile already exists.",
            });
        }
        res.status(500).json({ success: false, message: "Could not register donor." });
    } finally {
        conn.release();
    }
}

// GET /api/donors/me
// Returns the donor profile for the currently logged-in donor
async function getDonorMe(req, res) {
    try {
        const rows = await query("SELECT * FROM donors WHERE user_id = ?", [req.user.id]);
        if (!rows.length) {
            return res.status(404).json({ success: false, message: "No donor profile found for your account." });
        }
        res.json({ success: true, message: "Donor profile retrieved.", data: { donor: rows[0] } });
    } catch (err) {
        console.error("getDonorMe error:", err.message);
        res.status(500).json({ success: false, message: "Could not retrieve your donor profile." });
    }
}

// GET /api/donors
async function getDonors(req, res) {
    const { bloodGroup, available } = req.query;
    let sql = "SELECT * FROM donors WHERE 1=1";
    const params = [];

    if (bloodGroup) {
        if (!isValidBloodGroup(bloodGroup)) {
            return res.status(400).json({ success: false, message: "Invalid blood group filter." });
        }
        sql += " AND blood_group = ?";
        params.push(bloodGroup);
    }
    if (available !== undefined) {
        sql += " AND is_available = ?";
        params.push(available === "1" || available === "true" ? 1 : 0);
    }

    sql += " ORDER BY created_at DESC";

    try {
        const donors = await query(sql, params);
        res.json({ success: true, message: "Donors retrieved.", data: { count: donors.length, donors } });
    } catch (err) {
        console.error("getDonors error:", err.message);
        res.status(500).json({ success: false, message: "Could not retrieve donors." });
    }
}

// GET /api/donors/:id
async function getDonorById(req, res) {
    if (!isValidId(req.params.id)) {
        return res.status(400).json({ success: false, message: "Invalid donor ID." });
    }

    try {
        const rows = await query("SELECT * FROM donors WHERE id = ?", [req.params.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: "Donor not found." });

        const donor = rows[0];
        const isStaff = ["admin", "employee"].includes(req.user.role);
        const isOwner = req.user.role === "donor" && donor.user_id === req.user.id;

        if (!isStaff && !isOwner) {
            return res.status(403).json({ success: false, message: "Forbidden. You cannot view this profile." });
        }

        res.json({ success: true, message: "Donor retrieved.", data: { donor } });
    } catch (err) {
        console.error("getDonorById error:", err.message);
        res.status(500).json({ success: false, message: "Could not retrieve donor." });
    }
}

// PATCH /api/donors/:id
async function updateDonor(req, res) {
    if (!isValidId(req.params.id)) {
        return res.status(400).json({ success: false, message: "Invalid donor ID." });
    }

    try {
        const rows = await query("SELECT * FROM donors WHERE id = ?", [req.params.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: "Donor not found." });

        const donor = rows[0];
        const isStaff = ["admin", "employee"].includes(req.user.role);
        const isOwner = req.user.role === "donor" && donor.user_id === req.user.id;

        if (!isStaff && !isOwner) return res.status(403).json({ success: false, message: "Forbidden." });

        const setClauses = [];
        const params = [];

        if (req.body.name !== undefined) {
            const name = String(req.body.name).trim();
            if (!name) return res.status(400).json({ success: false, message: "Name cannot be empty." });
            setClauses.push("name = ?");
            params.push(name);
        }

        if (req.body.age !== undefined) {
            if (!isValidDonorAge(req.body.age)) {
                return res.status(400).json({ success: false, message: "Age must be a whole number between 18 and 65." });
            }
            setClauses.push("age = ?");
            params.push(Number(req.body.age));
        }

        if (req.body.gender !== undefined) {
            if (!isValidGender(req.body.gender)) {
                return res.status(400).json({ success: false, message: "Invalid gender." });
            }
            setClauses.push("gender = ?");
            params.push(req.body.gender);
        }

        if (req.body.bloodGroup !== undefined) {
            if (!isValidBloodGroup(req.body.bloodGroup)) {
                return res.status(400).json({ success: false, message: "Invalid blood group." });
            }
            setClauses.push("blood_group = ?");
            params.push(req.body.bloodGroup);
        }

        if (req.body.phone !== undefined) {
            if (!isValidPhone(req.body.phone)) {
                return res.status(400).json({ success: false, message: "Invalid phone number." });
            }
            setClauses.push("phone = ?");
            params.push(String(req.body.phone).trim());
        }

        if (req.body.address !== undefined) {
            const address = String(req.body.address).trim();
            if (!address) return res.status(400).json({ success: false, message: "Address cannot be empty." });
            setClauses.push("address = ?");
            params.push(address);
        }

        if (req.body.is_available !== undefined) {
            const val = req.body.is_available === 1 || req.body.is_available === "1" || req.body.is_available === true ? 1 : 0;
            setClauses.push("is_available = ?");
            params.push(val);
        }

        if (req.body.last_donation_date !== undefined) {
            if (req.body.last_donation_date !== null && !isValidDonationDate(req.body.last_donation_date)) {
                return res.status(400).json({ success: false, message: "Invalid donation date or date is in the future." });
            }
            setClauses.push("last_donation_date = ?");
            params.push(req.body.last_donation_date);
        }

        if (!setClauses.length) {
            return res.status(400).json({ success: false, message: "No valid fields provided to update." });
        }

        params.push(req.params.id);
        await query(`UPDATE donors SET ${setClauses.join(", ")} WHERE id = ?`, params);

        const [updated] = await query("SELECT * FROM donors WHERE id = ?", [req.params.id]);
        res.json({ success: true, message: "Donor updated.", data: { donor: updated } });
    } catch (err) {
        console.error("updateDonor error:", err.message);
        res.status(500).json({ success: false, message: "Could not update donor." });
    }
}

// DELETE /api/donors/:id
async function deleteDonor(req, res) {
    if (!isValidId(req.params.id)) {
        return res.status(400).json({ success: false, message: "Invalid donor ID." });
    }

    try {
        const result = await query("DELETE FROM donors WHERE id = ?", [req.params.id]);
        if (!result.affectedRows) return res.status(404).json({ success: false, message: "Donor not found." });
        res.json({ success: true, message: "Donor deleted.", data: null });
    } catch (err) {
        if (err.code === "ER_ROW_IS_REFERENCED_2") {
            return res.status(409).json({
                success: false,
                message: "Cannot delete this donor because donation history exists.",
            });
        }
        console.error("deleteDonor error:", err.message);
        res.status(500).json({ success: false, message: "Could not delete donor." });
    }
}

module.exports = {
    registerDonor,
    getDonorMe,
    getDonors,
    getDonorById,
    updateDonor,
    deleteDonor,
};

