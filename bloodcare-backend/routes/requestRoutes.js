const express = require("express");
const router = express.Router();
const {
    createRequest,
    getRequests,
    getMyRequests,
    getRequestById,
    updateRequestStatus,
    fulfillRequest,
    deleteRequest,
} = require("../controllers/requestController");
const { protect, optionalProtect, authorize } = require("../middleware/auth");

router.post("/", optionalProtect, createRequest);
router.get("/", protect, authorize("admin", "employee"), getRequests);
router.get("/mine", protect, getMyRequests);
router.get("/:id", protect, getRequestById);
router.patch("/:id/status", protect, authorize("admin", "employee"), updateRequestStatus);
router.post("/:id/fulfill", protect, authorize("admin", "employee"), fulfillRequest);
router.delete("/:id", protect, authorize("admin"), deleteRequest);

module.exports = router;
