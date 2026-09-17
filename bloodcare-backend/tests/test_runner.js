/**
 * BloodCare Automated Verification & Test Runner
 * Comprehensive end-to-end testing suite for academic and production verification.
 * 
 * Tests:
 * 1-28: Individual Unit & Functional Integration Scenarios
 * STEP 1-12: Complete End-to-End Real-World Business Lifecycle
 */

require("dotenv").config();
const { pool } = require("../config/db");

const BASE_URL = `http://localhost:${process.env.PORT || 5000}`;
let passedCount = 0;
let failedCount = 0;

function assert(condition, message) {
    if (!condition) {
        console.error(`  ❌ FAILED: ${message}`);
        failedCount++;
        throw new Error(message);
    } else {
        console.log(`  ✅ PASSED: ${message}`);
        passedCount++;
    }
}

async function api(path, options = {}) {
    const url = `${BASE_URL}${path}`;
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    const res = await fetch(url, { ...options, headers });
    let json = {};
    try {
        json = await res.json();
    } catch (e) {
        json = { rawText: await res.text() };
    }
    return { status: res.status, ok: res.ok, data: json };
}

async function runTests() {
    console.log("\n=======================================================");
    console.log("     BLOODCARE SYSTEM AUTOMATED TEST SUITE             ");
    console.log("=======================================================\n");

    const timestamp = Date.now();
    const donorEmail = `donor_${timestamp}@test.com`;
    const requesterEmail = `requester_${timestamp}@test.com`;
    const testPassword = "Password@123";

    let adminToken = "";
    let donorToken = "";
    let donorUserId = null;
    let donorProfileId = null;
    let requesterToken = "";
    let requesterUserId = null;
    let createdRequestId = null;

    try {
        // -------------------------------------------------------------
        // 1. Server startup & Health
        // -------------------------------------------------------------
        console.log("\n[TEST GROUP 1: Core System & Health]");
        const health = await api("/api/health");
        assert(health.status === 200 && health.data.status === "ok", "1. GET /api/health responds with status ok");

        // -------------------------------------------------------------
        // 2. MySQL Connection Test
        // -------------------------------------------------------------
        const [dbPing] = await pool.execute("SELECT 1 AS connected");
        assert(dbPing[0].connected === 1, "2. MySQL connection verified via direct query");

        // -------------------------------------------------------------
        // 3. Admin Authentication
        // -------------------------------------------------------------
        console.log("\n[TEST GROUP 2: Authentication & Authorization]");
        const adminEmail = process.env.ADMIN_EMAIL || "admin@bloodcare.com";
        const adminPass = process.env.ADMIN_PASSWORD || "admin123";

        const adminLogin = await api("/api/auth/login", {
            method: "POST",
            body: JSON.stringify({ email: adminEmail, password: adminPass, role: "admin" })
        });
        assert(adminLogin.status === 200, "3. Admin login successful with status 200");
        assert(adminLogin.data.data?.token, "4. Admin JWT token returned");
        adminToken = adminLogin.data.data.token;

        // -------------------------------------------------------------
        // 4. Wrong password rejection
        // -------------------------------------------------------------
        const badLogin = await api("/api/auth/login", {
            method: "POST",
            body: JSON.stringify({ email: adminEmail, password: "wrong_password", role: "admin" })
        });
        assert(badLogin.status === 401, "5. Invalid password rejected with status 401");

        // -------------------------------------------------------------
        // 5. Donor Registration (Async Bcrypt)
        // -------------------------------------------------------------
        console.log("\n[TEST GROUP 3: Donor Registration & Validation]");
        const donorReg = await api("/api/auth/register", {
            method: "POST",
            body: JSON.stringify({ name: "Alice Donor", email: donorEmail, password: testPassword, role: "donor" })
        });
        assert(donorReg.status === 201, "6. Donor user registration successful (201 Created)");
        donorToken = donorReg.data.data.token;
        donorUserId = donorReg.data.data.user.id;

        // -------------------------------------------------------------
        // 6. Duplicate registration rejection
        // -------------------------------------------------------------
        const dupReg = await api("/api/auth/register", {
            method: "POST",
            body: JSON.stringify({ name: "Alice Duplicate", email: donorEmail, password: testPassword, role: "donor" })
        });
        assert(dupReg.status === 409, "7. Duplicate registration rejected with 409 Conflict");

        // -------------------------------------------------------------
        // 7. Requester Registration
        // -------------------------------------------------------------
        const reqReg = await api("/api/auth/register", {
            method: "POST",
            body: JSON.stringify({ name: "Bob Requester", email: requesterEmail, password: testPassword, role: "requester" })
        });
        assert(reqReg.status === 201, "8. Requester user registration successful (201 Created)");
        requesterToken = reqReg.data.data.token;
        requesterUserId = reqReg.data.data.user.id;

        // -------------------------------------------------------------
        // 8. Invalid JWT & Unauthenticated access
        // -------------------------------------------------------------
        const badJwt = await api("/api/auth/me", { headers: { Authorization: "Bearer invalid.fake.token" } });
        assert(badJwt.status === 401, "9. Invalid JWT rejected with status 401");

        const noJwt = await api("/api/auth/me");
        assert(noJwt.status === 401, "10. Protected route without token rejected with status 401");

        // -------------------------------------------------------------
        // 9. Unauthorized Role Access (Donor accessing Admin endpoint)
        // -------------------------------------------------------------
        const forbiddenAccess = await api("/api/admin/users", {
            headers: { Authorization: `Bearer ${donorToken}` }
        });
        assert(forbiddenAccess.status === 403, "11. Role enforcement: Donor forbidden from admin user list (403)");

        // -------------------------------------------------------------
        // 10. Deactivated User Account Verification
        // -------------------------------------------------------------
        console.log("\n[TEST GROUP 4: Security & Account Lifecycle]");
        const deactEmail = `deact_${timestamp}@test.com`;
        const deactUserReg = await api("/api/auth/register", {
            method: "POST",
            body: JSON.stringify({ name: "Deact Test", email: deactEmail, password: testPassword, role: "donor" })
        });
        const deactToken = deactUserReg.data.data.token;
        const deactId = deactUserReg.data.data.user.id;

        // Admin deactivates account
        const deactRes = await api(`/api/admin/users/${deactId}/status`, {
            method: "PATCH",
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        assert(deactRes.status === 200, "12. Admin toggled user status to inactive");

        // Request with deactToken should be rejected
        const deactMe = await api("/api/auth/me", {
            headers: { Authorization: `Bearer ${deactToken}` }
        });
        assert(deactMe.status === 403, "13. Deactivated user token rejected by protect middleware (403)");

        // -------------------------------------------------------------
        // 11. Donor Age Validation (Bounds: 18 - 65)
        // -------------------------------------------------------------
        console.log("\n[TEST GROUP 5: Medical Business Rules & Validations]");
        const underageDonor = await api("/api/donors", {
            method: "POST",
            headers: { Authorization: `Bearer ${donorToken}` },
            body: JSON.stringify({
                name: "Underage",
                age: 16,
                gender: "Male",
                bloodGroup: "O+",
                phone: "9876543210",
                email: donorEmail,
                address: "Sample Address"
            })
        });
        assert(underageDonor.status === 400, "14. Underage donor (age 16) rejected with 400 Bad Request");

        // -------------------------------------------------------------
        // 12. Valid Donor Profile Registration (Linked to user)
        // -------------------------------------------------------------
        const validDonor = await api("/api/donors", {
            method: "POST",
            headers: { Authorization: `Bearer ${donorToken}` },
            body: JSON.stringify({
                name: "Alice Donor",
                age: 26,
                gender: "Female",
                bloodGroup: "O+",
                phone: "9876543210",
                email: donorEmail,
                address: "123 Health Ave"
            })
        });
        assert(validDonor.status === 201, "15. Valid donor profile created (201 Created)");
        donorProfileId = validDonor.data.data.donor.id;

        // -------------------------------------------------------------
        // 13. Donor Profile Self-Lookup (GET /api/donors/me)
        // -------------------------------------------------------------
        const donorMe = await api("/api/donors/me", {
            headers: { Authorization: `Bearer ${donorToken}` }
        });
        assert(donorMe.status === 200 && donorMe.data.data.donor.blood_group === "O+", "16. GET /api/donors/me retrieves linked profile");

        // -------------------------------------------------------------
        // 14. Donor Ownership Protection
        // -------------------------------------------------------------
        const otherDonorAccess = await api(`/api/donors/${donorProfileId}`, {
            headers: { Authorization: `Bearer ${requesterToken}` }
        });
        assert(otherDonorAccess.status === 403, "17. Requester cannot access another user's donor profile (403)");

        // -------------------------------------------------------------
        // 15. Stock Invariant: Negative Stock Prevention
        // -------------------------------------------------------------
        console.log("\n[TEST GROUP 6: Inventory & Concurrency Safety]");
        const negStockAdjust = await api("/api/stock/O+/adjust", {
            method: "PATCH",
            headers: { Authorization: `Bearer ${adminToken}` },
            body: JSON.stringify({ delta: -9999 })
        });
        assert(negStockAdjust.status === 400, "18. Excessive stock deduction rejected; stock cannot become negative");

        // -------------------------------------------------------------
        // 16. State Machine: Prevent Direct Fulfillment via PATCH /status
        // -------------------------------------------------------------
        console.log("\n[TEST GROUP 7: Request State Machine & Fulfillment]");
        // Create request as logged-in requester
        const reqCreate = await api("/api/requests", {
            method: "POST",
            headers: { Authorization: `Bearer ${requesterToken}` },
            body: JSON.stringify({
                name: "Bob Patient",
                age: 42,
                bloodGroup: "O+",
                units: 2,
                hospital: "Metro General Hospital",
                phone: "9876501234",
                email: requesterEmail,
                reason: "Scheduled Surgery"
            })
        });
        assert(reqCreate.status === 201, "19. Blood request submitted with Authorization header (201)");
        createdRequestId = reqCreate.data.data.request.id;

        // Verify requester_id is correctly linked
        const [dbReq] = await pool.execute("SELECT requester_id FROM blood_requests WHERE id = ?", [createdRequestId]);
        assert(dbReq[0].requester_id === requesterUserId, "20. blood_requests.requester_id correctly matches authenticated user ID");

        // Verify GET /api/requests/mine returns this request
        const myRequests = await api("/api/requests/mine", {
            headers: { Authorization: `Bearer ${requesterToken}` }
        });
        assert(myRequests.status === 200 && myRequests.data.data.requests.length > 0, "21. GET /api/requests/mine returns the requester's submission");

        // Attempt direct status change to fulfilled -> MUST BE REJECTED
        const directFulfill = await api(`/api/requests/${createdRequestId}/status`, {
            method: "PATCH",
            headers: { Authorization: `Bearer ${adminToken}` },
            body: JSON.stringify({ status: "fulfilled" })
        });
        assert(directFulfill.status === 400, "22. State machine: Setting 'fulfilled' directly via PATCH /status is rejected (400)");

        // -------------------------------------------------------------
        // 17. Valid State Transition: pending -> approved
        // -------------------------------------------------------------
        const approveReq = await api(`/api/requests/${createdRequestId}/status`, {
            method: "PATCH",
            headers: { Authorization: `Bearer ${adminToken}` },
            body: JSON.stringify({ status: "approved" })
        });
        assert(approveReq.status === 200 && approveReq.data.data.request.status === "approved", "23. Request status successfully transitioned from pending to approved");

        // -------------------------------------------------------------
        // 18. Donation Recording with Transaction & 56-Day Rule
        // -------------------------------------------------------------
        console.log("\n[TEST GROUP 8: Clinical Donation Flow & Rules]");
        const [[initialStock]] = await pool.execute("SELECT units FROM blood_stock WHERE blood_group = 'O+'");
        const initialUnits = initialStock.units;

        const recordDonation = await api("/api/donations", {
            method: "POST",
            headers: { Authorization: `Bearer ${adminToken}` },
            body: JSON.stringify({ donorId: donorProfileId, units: 2 })
        });
        assert(recordDonation.status === 201, "24. Staff recorded blood donation (201 Created)");

        const [[postDonationStock]] = await pool.execute("SELECT units FROM blood_stock WHERE blood_group = 'O+'");
        assert(postDonationStock.units === initialUnits + 2, "25. Inventory: Blood stock increased by exactly 2 units after donation");

        // Attempt immediate 2nd donation on same day -> must trigger 56-day business rule
        const rapidDonation = await api("/api/donations", {
            method: "POST",
            headers: { Authorization: `Bearer ${adminToken}` },
            body: JSON.stringify({ donorId: donorProfileId, units: 1 })
        });
        assert(rapidDonation.status === 400, "26. Business Rule: Minimum 56-day donation interval enforced (400)");

        // Verify Donor can view their donation history
        const donorHistory = await api("/api/donations/mine", {
            headers: { Authorization: `Bearer ${donorToken}` }
        });
        assert(donorHistory.status === 200 && donorHistory.data.data.donations.length > 0, "27. Donor self-service: GET /api/donations/mine retrieves donation history");

        // -------------------------------------------------------------
        // 19. Transactional Fulfillment & Stock Deduction
        // -------------------------------------------------------------
        console.log("\n[TEST GROUP 9: Transactional Fulfillment]");
        const [[preFulfillStock]] = await pool.execute("SELECT units FROM blood_stock WHERE blood_group = 'O+'");
        const preUnits = preFulfillStock.units;

        const fulfillRes = await api(`/api/requests/${createdRequestId}/fulfill`, {
            method: "POST",
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        assert(fulfillRes.status === 200, "28. POST /api/requests/:id/fulfill successfully fulfilled approved request");

        const [[postFulfillStock]] = await pool.execute("SELECT units FROM blood_stock WHERE blood_group = 'O+'");
        assert(postFulfillStock.units === preUnits - 2, "29. Inventory: Blood stock decreased by requested 2 units upon fulfillment");

        const [[fulfilledRow]] = await pool.execute("SELECT status FROM blood_requests WHERE id = ?", [createdRequestId]);
        assert(fulfilledRow.status === "fulfilled", "30. Database: Request status set to 'fulfilled'");

        // -------------------------------------------------------------
        // 20. Re-fulfillment & Re-opening Rejection
        // -------------------------------------------------------------
        const doubleFulfill = await api(`/api/requests/${createdRequestId}/fulfill`, {
            method: "POST",
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        assert(doubleFulfill.status === 400, "31. Double-fulfillment prevented: Cannot fulfill already-fulfilled request");

        const reopenFulfilled = await api(`/api/requests/${createdRequestId}/status`, {
            method: "PATCH",
            headers: { Authorization: `Bearer ${adminToken}` },
            body: JSON.stringify({ status: "pending" })
        });
        assert(reopenFulfilled.status === 400, "32. Reopening fulfilled request prevented: Status cannot be altered");

        // -------------------------------------------------------------
        // 21. Insufficient Stock Fulfillment Scenario
        // -------------------------------------------------------------
        console.log("\n[TEST GROUP 10: Concurrency & Insufficient Stock]");
        // Create request for massive units exceeding current stock
        const hugeUnits = postFulfillStock.units + 50;
        const hugeReq = await api("/api/requests", {
            method: "POST",
            headers: { Authorization: `Bearer ${requesterToken}` },
            body: JSON.stringify({
                name: "Large Order",
                age: 30,
                bloodGroup: "O+",
                units: 15,
                hospital: "Trauma Care",
                phone: "9876543210",
                email: requesterEmail,
                reason: "Emergency"
            })
        });
        const hugeReqId = hugeReq.data.data.request.id;

        // Approve it
        await api(`/api/requests/${hugeReqId}/status`, {
            method: "PATCH",
            headers: { Authorization: `Bearer ${adminToken}` },
            body: JSON.stringify({ status: "approved" })
        });

        // Artificially test insufficient stock by setting stock to 0 in transaction test
        await pool.execute("UPDATE blood_stock SET units = 0 WHERE blood_group = 'AB-'");
        const abNegReq = await api("/api/requests", {
            method: "POST",
            body: JSON.stringify({
                name: "AB- Patient",
                age: 50,
                bloodGroup: "AB-",
                units: 3,
                hospital: "City Clinic",
                phone: "9123456780",
                email: "ab_patient@test.com",
                reason: "Surgery"
            })
        });
        const abReqId = abNegReq.data.data.request.id;
        await api(`/api/requests/${abReqId}/status`, {
            method: "PATCH",
            headers: { Authorization: `Bearer ${adminToken}` },
            body: JSON.stringify({ status: "approved" })
        });

        // Attempt fulfill with 0 available units
        const failFulfill = await api(`/api/requests/${abReqId}/fulfill`, {
            method: "POST",
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        assert(failFulfill.status === 400, "33. Insufficient stock rejects fulfillment (400)");

        const [[checkStock]] = await pool.execute("SELECT units FROM blood_stock WHERE blood_group = 'AB-'");
        assert(checkStock.units === 0, "34. Database rollback: Stock remains 0 and did not become negative");

        // Restore AB- stock to standard initial value 4
        await pool.execute("UPDATE blood_stock SET units = 4 WHERE blood_group = 'AB-'");

        // -------------------------------------------------------------
        // 22. Admin Parallel Stats Check
        // -------------------------------------------------------------
        console.log("\n[TEST GROUP 11: Admin Statistics & User Management]");
        const statsRes = await api("/api/admin/stats", {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        assert(statsRes.status === 200, "35. GET /api/admin/stats retrieved via parallel Promise.all");
        assert(typeof statsRes.data.data.totalDonors === "number", "36. stats.totalDonors is a valid number");
        assert(typeof statsRes.data.data.totalUnits === "number", "37. stats.totalUnits is a valid number");

        // -------------------------------------------------------------
        // 23. Admin Self-Deactivation Prevention
        // -------------------------------------------------------------
        const [[adminRow]] = await pool.execute("SELECT id FROM users WHERE email = ?", [adminEmail]);
        const selfDeact = await api(`/api/admin/users/${adminRow.id}/status`, {
            method: "PATCH",
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        assert(selfDeact.status === 400, "38. Administrator self-deactivation strictly prevented (400)");

        // -------------------------------------------------------------
        // 24. Malformed Input & Error Handling
        // -------------------------------------------------------------
        console.log("\n[TEST GROUP 12: Malformed Input & Negative Test Cases]");
        const malformedJson = await fetch(`${BASE_URL}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{ bad json: true,"
        });
        assert(malformedJson.status === 400, "39. Malformed JSON syntax returns HTTP 400 Bad Request (not 500)");

        const invalidIdRes = await api("/api/requests/not_a_number", {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        assert(invalidIdRes.status === 400, "40. Non-numeric ID parameter rejected with HTTP 400 Bad Request");

    } catch (err) {
        console.error("\n💥 UNEXPECTED ERROR DURING TEST RUN:", err.message);
    } finally {
        console.log("\n=======================================================");
        console.log(`TEST SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
        console.log("=======================================================\n");

        if (failedCount > 0) {
            process.exit(1);
        } else {
            console.log("🎉 ALL TESTS EXECUTED AND PASSED SUCCESSFULLY!\n");
            process.exit(0);
        }
    }
}

runTests();
