const express = require("express");
const router = express.Router();
const {
    recordDonation,
    getDonations,
    getMyDonations,
    getDonationById,
} = require("../controllers/donationController");
const { protect, authorize } = require("../middleware/auth");

// Donor's personal donation history
router.get("/mine", protect, getMyDonations);

// Staff-only donation management routes
router.post("/", protect, authorize("admin", "employee"), recordDonation);
router.get("/", protect, authorize("admin", "employee"), getDonations);
router.get("/:id", protect, getDonationById);

module.exports = router;

