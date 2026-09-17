const express = require("express");
const router = express.Router();
const { getStock, getStockByGroup, setStock, adjustStock } = require("../controllers/stockController");
const { protect, authorize } = require("../middleware/auth");

router.get("/", getStock);
router.get("/:bloodGroup", getStockByGroup);
router.put("/:bloodGroup", protect, authorize("admin", "employee"), setStock);
router.patch("/:bloodGroup/adjust", protect, authorize("admin", "employee"), adjustStock);

module.exports = router;
