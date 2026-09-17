const API_BASE = "/api";

function getToken() {
    return localStorage.getItem("token");
}

function getUser() {
    const raw = localStorage.getItem("user");
    try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}

function saveSession(token, user) {
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));
}

function clearSession() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
}

async function apiFetch(path, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    let data = {};
    try { data = await res.json(); } catch {}

    if (!res.ok) throw new Error(data.message || "Something went wrong. Please try again.");
    return data;
}

function setupNavAuthButton() {
    const btn = document.getElementById("navAuthBtn");
    if (!btn) return;

    const user = getUser();
    if (user) {
        btn.textContent = `Logout (${user.name || user.role})`;
        btn.href = "#";
        btn.onclick = (e) => {
            e.preventDefault();
            clearSession();
            window.location.href = "index.html";
        };
    } else {
        btn.textContent = "Login";
        btn.href = "login.html";
    }
}

async function loadBloodStock() {
    const container = document.getElementById("bloodCards");
    if (!container) return;
    try {
        const data = await apiFetch("/stock");
        const stock = data.data?.stock || [];
        container.innerHTML = "";
        stock.forEach(item => {
            const card = document.createElement("div");
            card.className = "blood-card";
            card.innerHTML = `<h3>${item.blood_group}</h3><p>${item.units} Units</p>`;
            container.appendChild(card);
        });
    } catch (err) {
        console.error("Failed to load blood stock:", err.message);
    }
}

function setupDonateForm() {
    const form = document.getElementById("donorRegisterForm") || document.querySelector(".donate-container form");
    if (!form) return;

    const user = getUser();
    const nameInput = document.getElementById("donorName") || form.querySelector('input[type="text"]');
    const emailInput = document.getElementById("donorEmail") || form.querySelector('input[type="email"]');
    const passwordFields = document.getElementById("donorPasswordFields");

    if (user) {
        if (nameInput && !nameInput.value && user.name) nameInput.value = user.name;
        if (emailInput && !emailInput.value && user.email) emailInput.value = user.email;

        if (passwordFields) {
            passwordFields.style.display = "none";
            const pwdInput = document.getElementById("donorPassword");
            const confirmPwdInput = document.getElementById("donorConfirmPassword");
            if (pwdInput) pwdInput.removeAttribute("required");
            if (confirmPwdInput) confirmPwdInput.removeAttribute("required");
        }
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const name = nameInput ? nameInput.value.trim() : "";
        const ageInput = document.getElementById("donorAge") || form.querySelector('input[type="number"]');
        const genderSelect = document.getElementById("donorGender") || form.querySelectorAll("select")[0];
        const bloodGroupSelect = document.getElementById("donorBloodGroup") || form.querySelectorAll("select")[1];
        const phoneInput = document.getElementById("donorPhone") || form.querySelector('input[type="tel"]');
        const passwordInput = document.getElementById("donorPassword");
        const confirmPasswordInput = document.getElementById("donorConfirmPassword");
        const addressInput = document.getElementById("donorAddress") || form.querySelector("textarea");

        const age = ageInput ? ageInput.value.trim() : "";
        const gender = genderSelect ? genderSelect.value : "";
        const bloodGroup = bloodGroupSelect ? bloodGroupSelect.value : "";
        const phone = phoneInput ? phoneInput.value.trim() : "";
        const email = emailInput ? emailInput.value.trim() : "";
        const password = passwordInput ? passwordInput.value : "";
        const confirmPassword = confirmPasswordInput ? confirmPasswordInput.value : "";
        const address = addressInput ? addressInput.value.trim() : "";

        if (!name || !age || gender === "Select Gender" || !gender ||
            bloodGroup === "Select Blood Group" || !bloodGroup ||
            !phone || !email || !address) {
            alert("Please fill in all the details.");
            return;
        }

        const currentUser = getUser();
        if (!currentUser) {
            if (!password) {
                alert("Please create a password for your donor account.");
                return;
            }
            if (password.length < 6) {
                alert("Password must be at least 6 characters long.");
                return;
            }
            if (password !== confirmPassword) {
                alert("Passwords do not match. Please re-enter.");
                return;
            }
        }

        try {
            const payload = { name, age, gender, bloodGroup, phone, email, address };
            if (password) {
                payload.password = password;
            }

            const data = await apiFetch("/donors", {
                method: "POST",
                body: JSON.stringify(payload)
            });

            // If an account was created and a JWT was returned, save session
            if (data.data?.token && data.data?.user) {
                saveSession(data.data.token, data.data.user);
            }

            alert(data.message || "Donor registration successful!");
            form.reset();
            window.location.href = "index.html";
        } catch (err) {
            alert(err.message);
        }
    });
}

function setupRequestForm() {
    const form = document.getElementById("bloodRequestForm");
    if (!form) return;

    const user = getUser();
    const inputs = form.querySelectorAll("input");
    const select = form.querySelector("select");
    const textarea = form.querySelector("textarea");

    // Pre-fill requester info if logged in
    if (user) {
        if (inputs[0] && !inputs[0].value && user.name) inputs[0].value = user.name;
        if (inputs[5] && !inputs[5].value && user.email) inputs[5].value = user.email;
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const name = inputs[0].value.trim();
        const age = inputs[1].value;
        const bloodGroup = select.value;
        const units = inputs[2].value;
        const hospital = inputs[3].value.trim();
        const phone = inputs[4].value.trim();
        const email = inputs[5].value.trim();
        const reason = textarea.value.trim();

        if (!name || !age || bloodGroup === "Select Blood Group" || !units ||
            !hospital || !phone || !email || !reason) {
            alert("Please fill in all the details.");
            return;
        }

        try {
            const data = await apiFetch("/requests", {
                method: "POST",
                body: JSON.stringify({ name, age, bloodGroup, units, hospital, phone, email, reason })
            });
            alert(data.message || "Blood request submitted successfully!");
            form.reset();
            window.location.href = "index.html";
        } catch (err) {
            alert(err.message);
        }
    });
}

function setupLoginForm() {
    const form = document.getElementById("loginForm");
    if (!form) return;

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const email = document.getElementById("loginEmail").value.trim();
        const password = document.getElementById("loginPassword").value;
        const role = document.getElementById("loginRole").value;

        if (!email || !password || role === "Select Role") {
            alert("Please fill in all the details.");
            return;
        }

        try {
            const response = await apiFetch("/auth/login", {
                method: "POST",
                body: JSON.stringify({ email, password, role })
            });
            const { token, user } = response.data;
            saveSession(token, user);
            alert(`${user.role.charAt(0).toUpperCase() + user.role.slice(1)} login successful!`);

            if (user.role === "admin" || user.role === "employee") {
                window.location.href = "admin.html";
            } else {
                window.location.href = "index.html";
            }
        } catch (err) {
            alert(err.message);
        }
    });
}


function setupRegisterForm() {
    const form = document.getElementById("registerForm");
    if (!form) return;

    form.addEventListener("submit", async event => {
        event.preventDefault();
        const name = document.getElementById("registerName").value.trim();
        const email = document.getElementById("registerEmail").value.trim();
        const password = document.getElementById("registerPassword").value;
        const role = document.getElementById("registerRole").value;

        if (!name || !email || !password || !role) {
            alert("Please fill in all the details.");
            return;
        }

        try {
            const response = await apiFetch("/auth/register", {
                method: "POST",
                body: JSON.stringify({ name, email, password, role })
            });
            saveSession(response.data.token, response.data.user);
            alert("Registration successful!");
            window.location.href = role === "donor" ? "donate.html" : "request.html";
        } catch (err) {
            alert(err.message);
        }
    });
}

function guardAdminPage() {
    if (!document.getElementById("totalDonors")) return false;
    const user = getUser();
    if (!user || !["admin", "employee"].includes(user.role)) {
        alert("Please log in as an admin or employee to view this page.");
        window.location.href = "login.html";
        return false;
    }
    return true;
}

async function loadAdminStats() {
    const response = await apiFetch("/admin/stats");
    const stats = response.data;
    document.getElementById("totalDonors").textContent = stats.totalDonors;
    document.getElementById("totalUnits").textContent = stats.totalUnits;
    document.getElementById("totalRequests").textContent = stats.totalRequests;
    document.getElementById("pendingRequests").textContent = stats.pendingRequests;
}

async function loadAdminStock() {
    const grid = document.getElementById("adminStockGrid");
    if (!grid) return;
    const response = await apiFetch("/stock");
    grid.innerHTML = "";
    (response.data?.stock || []).forEach(item => {
        const card = document.createElement("div");
        card.className = "stock-card";
        card.innerHTML = `<h3>${item.blood_group}</h3><p>${item.units} Units</p>`;
        grid.appendChild(card);
    });
}

async function loadDonors() {
    const body = document.getElementById("donorsTableBody");
    const select = document.getElementById("donorSelect");
    if (!body || !select) return;

    try {
        const response = await apiFetch("/donors");
        const donors = response.data?.donors || [];
        body.innerHTML = "";
        select.innerHTML = '<option value="">Select Donor</option>';

        if (!donors.length) {
            body.innerHTML = '<tr><td colspan="6" class="empty-row">No donors registered yet.</td></tr>';
            return;
        }

        donors.forEach(donor => {
            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${donor.id}</td>
                <td>${escapeHtml(donor.name)}</td>
                <td>${donor.blood_group}</td>
                <td>${escapeHtml(donor.phone)}</td>
                <td>${donor.is_available ? "Yes" : "No"}</td>
                <td>${donor.last_donation_date || "—"}</td>`;
            body.appendChild(row);

            const option = document.createElement("option");
            option.value = donor.id;
            option.textContent = `${donor.name} (${donor.blood_group})`;
            select.appendChild(option);
        });
    } catch (err) {
        body.innerHTML = `<tr><td colspan="6" class="empty-row">${escapeHtml(err.message)}</td></tr>`;
    }
}

async function loadRequests() {
    const body = document.getElementById("requestsTableBody");
    if (!body) return;

    try {
        const response = await apiFetch("/requests");
        const requests = response.data?.requests || [];
        body.innerHTML = "";

        if (!requests.length) {
            body.innerHTML = '<tr><td colspan="7" class="empty-row">No blood requests yet.</td></tr>';
            return;
        }

        requests.forEach(request => {
            const row = document.createElement("tr");
            const status = request.status;
            const actions = [];

            if (status === "pending") {
                actions.push(`<button class="action-btn" data-action="approved" data-id="${request.id}">Approve</button>`);
                actions.push(`<button class="action-btn" data-action="rejected" data-id="${request.id}">Reject</button>`);
            } else if (status === "approved") {
                actions.push(`<button class="action-btn" data-action="fulfilled" data-id="${request.id}">Fulfill</button>`);
                actions.push(`<button class="action-btn" data-action="rejected" data-id="${request.id}">Reject</button>`);
            } else {
                actions.push("<span>—</span>");
            }

            row.innerHTML = `
                <td>${request.id}</td>
                <td>${escapeHtml(request.requester_name)}</td>
                <td>${request.blood_group}</td>
                <td>${request.units}</td>
                <td>${escapeHtml(request.hospital)}</td>
                <td><span class="status-badge">${escapeHtml(status)}</span></td>
                <td><div class="action-group">${actions.join("")}</div></td>`;
            body.appendChild(row);
        });
    } catch (err) {
        body.innerHTML = `<tr><td colspan="7" class="empty-row">${escapeHtml(err.message)}</td></tr>`;
    }
}

async function updateRequest(id, status) {
    if (status === "fulfilled") {
        if (!confirm("Fulfill this approved request and deduct blood stock?")) return;
        await apiFetch(`/requests/${id}/fulfill`, { method: "POST" });
    } else {
        await apiFetch(`/requests/${id}/status`, {
            method: "PATCH",
            body: JSON.stringify({ status })
        });
    }

    await Promise.all([loadAdminStats(), loadAdminStock(), loadRequests()]);
    alert(`Request ${status}.`);
}

function setupAdminActions() {
    const requestBody = document.getElementById("requestsTableBody");
    if (requestBody) {
        requestBody.addEventListener("click", async (event) => {
            const btn = event.target.closest("[data-action]");
            if (!btn) return;
            try {
                await updateRequest(btn.dataset.id, btn.dataset.action);
            } catch (err) {
                alert(err.message);
            }
        });
    }

    const donationForm = document.getElementById("donationForm");
    if (donationForm) {
        donationForm.addEventListener("submit", async event => {
            event.preventDefault();
            const donorId = document.getElementById("donorSelect").value;
            const units = document.getElementById("donationUnits").value;
            const donationDate = document.getElementById("donationDate").value;

            if (!donorId || !units) {
                alert("Please select a donor and enter the number of units.");
                return;
            }

            try {
                const response = await apiFetch("/donations", {
                    method: "POST",
                    body: JSON.stringify({ donorId, units, donationDate })
                });
                alert(response.message || "Donation recorded.");
                donationForm.reset();
                await Promise.all([loadAdminStats(), loadAdminStock(), loadDonors()]);
            } catch (err) {
                alert(err.message);
            }
        });
    }

    document.getElementById("refreshDashboardBtn")?.addEventListener("click", refreshAdminDashboard);
    document.getElementById("refreshRequestsBtn")?.addEventListener("click", loadRequests);
    document.getElementById("refreshDonorsBtn")?.addEventListener("click", loadDonors);
}

async function refreshAdminDashboard() {
    try {
        await Promise.all([loadAdminStats(), loadAdminStock(), loadRequests(), loadDonors()]);
    } catch (err) {
        console.error("Dashboard refresh failed:", err.message);
        if (/not authorized|forbidden|invalid or expired/i.test(err.message)) {
            clearSession();
            window.location.href = "login.html";
        } else {
            alert(err.message);
        }
    }
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

document.addEventListener("DOMContentLoaded", () => {
    setupNavAuthButton();
    loadBloodStock();
    setupDonateForm();
    setupRequestForm();
    setupLoginForm();
    setupRegisterForm();

    if (guardAdminPage()) {
        setupAdminActions();
        refreshAdminDashboard();
    }
});
