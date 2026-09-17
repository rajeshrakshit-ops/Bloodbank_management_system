require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const { testConnection } = require("./config/db");
const { seedAdmin } = require("./utils/seed");

const authRoutes = require("./routes/authRoutes");
const donorRoutes = require("./routes/donorRoutes");
const requestRoutes = require("./routes/requestRoutes");
const stockRoutes = require("./routes/stockRoutes");
const adminRoutes = require("./routes/adminRoutes");
const donationRoutes = require("./routes/donationRoutes");
const { notFound, errorHandler } = require("./middleware/errorHandler");

const app = express();

// Security headers (configured to allow vanilla JS scripts and local assets)
app.use(
    helmet({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false,
    })
);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiter for authentication endpoints to prevent brute-force attacks
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 auth requests per window
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many authentication requests from this IP. Please try again after 15 minutes.",
    },
});

app.get("/api/health", (req, res) => {
    res.json({ status: "ok", service: "BloodCare API", time: new Date().toISOString() });
});

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/donors", donorRoutes);
app.use("/api/requests", requestRoutes);
app.use("/api/stock", stockRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/donations", donationRoutes);

// ---------- Serve the frontend (index.html, login.html, etc.) ----------
const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir));

// Any non-/api route that isn't a static file falls back to index.html
app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
});

app.use("/api", notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// Startup is async now: we verify the MySQL connection and make sure the
// default admin account exists BEFORE accepting any requests. This is
// also what fixes the old crash-on-start bug — the legacy JSON-based
// seed script (which ran synchronously at require-time) is gone; seeding
// now happens here, after MySQL is confirmed reachable.
async function start() {
    const connected = await testConnection();
    if (!connected) {
        console.error(
            "Could not connect to MySQL. Check that MySQL is running and your .env DB_* values are correct."
        );
        process.exit(1);
    }

    await seedAdmin();

    app.listen(PORT, () => {
        console.log(`BloodCare running on http://localhost:${PORT}`);
    });
}

start();