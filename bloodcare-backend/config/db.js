// ============================================================
// MySQL connection pool (mysql2/promise)
//
// PHASE 3 SCOPE: this file only sets up the connection pool and
// a small query helper + connection test utility. It does NOT
// contain any table-specific query methods (no db.users.x(),
// db.donors.x(), etc.) — those will be added when controllers
// are migrated in a later phase. Controllers/routes are NOT
// touched in this phase, so they still reference the old
// JSON-shaped API and will not work correctly until that
// migration happens. This is expected at this stage.
// ============================================================

require("dotenv").config();
const mysql = require("mysql2/promise");

const pool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "bloodcare",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    dateStrings: true, // return DATE/DATETIME columns as plain strings, not JS Date objects
});

/**
 * Run a parameterized SQL query using the pool.
 * Always use placeholders ('?') — never concatenate user input into SQL.
 *
 * Example:
 *   const [rows] = await query('SELECT * FROM users WHERE email = ?', [email]);
 */
async function query(sql, params = []) {
    const [rows] = await pool.execute(sql, params);
    return rows;
}

/**
 * Get a single connection from the pool for manual transaction control
 * (BEGIN / COMMIT / ROLLBACK). Caller is responsible for releasing it.
 *
 * Example:
 *   const conn = await getConnection();
 *   try {
 *       await conn.beginTransaction();
 *       ...
 *       await conn.commit();
 *   } catch (err) {
 *       await conn.rollback();
 *       throw err;
 *   } finally {
 *       conn.release();
 *   }
 */
async function getConnection() {
    return pool.getConnection();
}

/**
 * Verifies the pool can actually reach MySQL and authenticate.
 * Returns true/false instead of throwing, so it's safe to call
 * from a quick manual check without crashing a script.
 */
async function testConnection() {
    try {
        const conn = await pool.getConnection();
        await conn.ping();
        conn.release();
        console.log(
            `MySQL connection OK -> ${process.env.DB_HOST || "localhost"}:${process.env.DB_PORT || 3306}/${process.env.DB_NAME || "bloodcare"}`
        );
        return true;
    } catch (err) {
        console.error("MySQL connection FAILED:", err.message);
        return false;
    }
}

module.exports = { pool, query, getConnection, testConnection };
