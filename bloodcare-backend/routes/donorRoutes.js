const express = require("express");
const router = express.Router();
const {
    registerDonor,
    getDonorMe,
    getDonors,
    getDonorById,
    updateDonor,
    deleteDonor,
} = require("../controllers/donorController");
const { protect, optionalProtect, authorize } = require("../middleware/auth");

// Public donor profile registration; if a donor JWT is present, it is linked to that account.
router.post("/", optionalProtect, registerDonor);
router.get("/me", protect, getDonorMe);
router.get("/", protect, authorize("admin", "employee"), getDonors);
router.get("/:id", protect, getDonorById);
router.patch("/:id", protect, updateDonor);
router.delete("/:id", protect, authorize("admin"), deleteDonor);

module.exports = router;

