const express = require("express");
const router = express.Router();
const {
    getStats,
    getUsers,
    toggleUserStatus,
    changeUserRole,
} = require("../controllers/adminController");
const { protect, authorize } = require("../middleware/auth");

// Staff metrics endpoint
router.get("/stats", protect, authorize("admin", "employee"), getStats);

// Administrator-only user management endpoints
router.get("/users", protect, authorize("admin"), getUsers);
router.patch("/users/:id/status", protect, authorize("admin"), toggleUserStatus);
router.patch("/users/:id/role", protect, authorize("admin"), changeUserRole);

module.exports = router;

