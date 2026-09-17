# 🩸 BloodCare — Blood Bank Management System

A robust, secure, and production-grade Blood Bank Management System built with **Node.js, Express.js, MySQL (InnoDB), JWT authentication, async bcrypt, and Vanilla JavaScript**.

The Express server acts as a unified backend that serves both the secure REST API (`/api/*`) and the static frontend (`/public/*`) on a single port (`5000`) without requiring complex CORS configurations or heavy frontend frameworks.

> **Architecture Notice**: BloodCare uses **MySQL (InnoDB)** as its sole, ACID-compliant database. Any earlier references to `bloodcare.json` are deprecated legacy prototypes from early development.

---

## 🛠️ Technology Stack

- **Runtime & Server**: Node.js & Express.js
- **Database**: MySQL (InnoDB engine for transactions, row-level locking, and foreign keys)
- **Database Driver**: `mysql2/promise` (connection pooling with promise-based queries)
- **Authentication**: JSON Web Tokens (`jsonwebtoken`) with server-side database status validation
- **Password Hashing**: `bcryptjs` (asynchronous `await bcrypt.hash` with 10 salt rounds)
- **Security & Concurrency**:
  - `helmet` for secure HTTP response headers
  - `express-rate-limit` for rate limiting authentication endpoints
  - `SELECT ... FOR UPDATE` row-level locking for atomic inventory management
  - Centralized error handling returning HTTP 400 for malformed JSON
- **Frontend**: HTML5, Vanilla CSS3, and modern Vanilla JavaScript (`fetch`, `async/await`)

---

## 🚀 Quick Start & Installation

### 1. Prerequisites
- **Node.js**: v16+ or v18+ installed
- **MySQL Server**: v8.0+ (or MariaDB 10.5+) running locally on port `3306`

### 2. Database Setup
Log into your MySQL shell or GUI client (such as MySQL Workbench or phpMyAdmin) and execute the schema and seed scripts:

```bash
mysql -u root -p < database/schema.sql
mysql -u root -p < database/seed.sql
```

- `database/schema.sql`: Sets up the `bloodcare` database, character set `utf8mb4`, and tables (`users`, `donors`, `blood_stock`, `blood_requests`, `donations`) with foreign keys, checks, and performance indexes.
- `database/seed.sql`: Seeds the initial 8 blood groups in `blood_stock` with zero or default units.

### 3. Environment Configuration (`.env`)
Ensure a `.env` file exists in the `bloodcare-backend/` root directory. A template is provided below:

```ini
PORT=5000
NODE_ENV=development

# MySQL Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=bloodcare

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRES_IN=7d

# Default System Administrator
ADMIN_EMAIL=admin@bloodcare.com
ADMIN_PASSWORD=admin123
```

> **Security Note**: Never commit real database passwords or JWT secrets to version control. The `.env` file is git-ignored.

### 4. Install Dependencies & Launch
```bash
cd bloodcare-backend
npm install
npm run dev
```

The application will start on:
```
http://localhost:5000
```
On startup, the server automatically tests the MySQL connection and guarantees that the system admin account (`admin@bloodcare.com`) exists in the `users` table.

---

## 🧪 Running Automated Tests

BloodCare comes with an automated test runner that verifies 40 distinct system invariants, security checks, and an entire 12-step real-world blood bank lifecycle:

```bash
npm test
```

### Verified Test Categories:
1. **Core System & Health**: Server health check and MySQL ping.
2. **Authentication & Authorization**: Async bcrypt password hashing, token generation, invalid password rejection (401), missing token protection (401), invalid JWT rejection (401).
3. **Account Lifecycle & Security**: Admin-controlled user deactivation, immediate revocation of deactivated users via `protect` middleware.
4. **Donor Management**:
   - Atomic user + donor profile creation within a single database transaction.
   - Enforced donor age boundary (18–65 years).
   - Self-profile retrieval via `GET /api/donors/me`.
   - Access-control restriction preventing unauthorized users from viewing private profiles.
5. **Inventory Integrity & Anti-Negativity**:
   - Prevention of negative blood stock.
   - Manual stock adjustment capacity bounds.
6. **Request State Machine**:
   - Authenticated user ID automatically bound to `blood_requests.requester_id`.
   - Requester self-service retrieval via `GET /api/requests/mine`.
   - Strict state transitions: `pending` → `approved` / `rejected`. Direct manipulation to `fulfilled` via `PATCH /status` is rejected (400).
7. **Clinical Donation Flow**:
   - Staff donation recording with transactional stock increment.
   - Enforced 56-day minimum donation interval business rule.
   - Donor history retrieval via `GET /api/donations/mine`.
8. **Transactional Fulfillment**:
   - Row-level locked (`FOR UPDATE`) fulfillment via `POST /api/requests/:id/fulfill`.
   - Automatic deduction of blood stock upon fulfillment.
   - Reopening or re-fulfilling already fulfilled requests is strictly blocked.
   - Transaction rollback on insufficient inventory (stock never becomes negative).
9. **Admin Performance & Robustness**:
   - Concurrently fetched dashboard metrics using `Promise.all`.
   - Prevention of administrator self-deactivation.
   - Malformed JSON handling returning HTTP 400 Bad Request instead of 500.

---

## 👥 User Roles & Access Control

The system implements Role-Based Access Control (RBAC) enforced strictly on the server:

| Role | Permissions & Capabilities |
|---|---|
| **Admin** | Full system control: view all statistics, manage blood stock, approve/reject/fulfill requests, record donations, view and activate/deactivate users. |
| **Employee** | Operational staff: view stats, view/adjust stock, approve/reject/fulfill requests, record donations. Cannot manage user accounts. |
| **Donor** | Community member: register profile, view homepage stock, view personal profile (`/api/donors/me`), view personal donation history (`/api/donations/mine`). |
| **Requester** | Blood recipient/hospital agent: submit blood requests, view personal submitted requests (`/api/requests/mine`). |

---

## 🔄 Core Business Workflows

### 1. Atomic Donor Registration
When an unregistered user fills out the registration/donor form:
1. A MySQL transaction begins (`conn.beginTransaction()`).
2. A record is inserted into `users` with role `donor` and an asynchronous bcrypt hash of their password.
3. A linked record is inserted into `donors` referencing `user_id`.
4. If either step fails (e.g. duplicate email), the transaction rolls back completely, ensuring no orphaned accounts are left in the database.
5. On success, a JWT session is returned directly to the browser.

### 2. Clinical Donation Flow & 56-Day Rule
1. Only authorized staff (`admin` or `employee`) can record a physical donation.
2. The application validates that the donor exists, units are positive, and the donation date is not in the future.
3. **Application Business Rule**: The system verifies that at least **56 days** (standard red blood cell recovery period) have elapsed since the donor's previous donation.
4. Inside an ACID transaction, the donation is inserted, `donors.last_donation_date` is updated, and the corresponding blood group in `blood_stock` is incremented.

### 3. Request State Machine & Transactional Fulfillment
1. Requesters submit a blood requirement. If logged in, their `req.user.id` is automatically linked to `blood_requests.requester_id`.
2. Initial status is `pending`.
3. Staff can transition status to `approved` or `rejected`.
4. **Fulfillment Protection**: A request **cannot** be marked `fulfilled` via standard status update endpoints. It MUST be executed via `POST /api/requests/:id/fulfill`.
5. During fulfillment, the server:
   - Starts a transaction (`conn.beginTransaction()`).
   - Locks the request row using `SELECT ... FOR UPDATE`.
   - Locks the specific blood group stock row using `SELECT ... FOR UPDATE`.
   - Checks if `stock.units >= request.units`.
   - If stock is sufficient, decrements inventory, marks request as `fulfilled`, and commits.
   - If stock is insufficient, issues a rollback (`conn.rollback()`) and returns HTTP 400 with the exact deficit.

---

## 📡 Complete API Reference

### Authentication (`/api/auth`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public | Register new `donor` or `requester` user account |
| `POST` | `/api/auth/login` | Public | Authenticate user; returns JWT token and role |
| `GET` | `/api/auth/me` | Logged In | Retrieve authenticated user's profile and active status |

### Donors (`/api/donors`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/donors` | Public | Atomic registration of user + donor profile |
| `GET` | `/api/donors/me` | Donor | Retrieve logged-in donor's personal profile |
| `GET` | `/api/donors` | Staff | List all donors (supports filters: `?bloodGroup=`, `?available=`) |
| `GET` | `/api/donors/:id` | Owner / Staff | Get specific donor details |
| `PATCH` | `/api/donors/:id` | Owner / Staff | Update donor contact info or availability |
| `DELETE` | `/api/donors/:id` | Admin | Delete donor (restricted if donation history exists) |

### Blood Requests (`/api/requests`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/requests` | Public / Logged In | Submit blood request (attaches `requester_id` if authenticated) |
| `GET` | `/api/requests/mine` | Requester | View all requests submitted by the logged-in user |
| `GET` | `/api/requests` | Staff | List all blood requests (filter: `?status=`, `?bloodGroup=`) |
| `GET` | `/api/requests/:id` | Requester / Staff | Get specific request details |
| `PATCH` | `/api/requests/:id/status` | Staff | Transition status (`pending` → `approved`/`rejected`) |
| `POST` | `/api/requests/:id/fulfill` | Staff | Transactional fulfillment with row-locked stock deduction |
| `DELETE` | `/api/requests/:id` | Admin | Delete blood request |

### Blood Donations (`/api/donations`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/donations` | Staff | Record a donation (enforces 56-day rule & increases stock) |
| `GET` | `/api/donations/mine` | Donor | View authenticated donor's personal donation history |
| `GET` | `/api/donations` | Staff | List all recorded donations |
| `GET` | `/api/donations/:id` | Staff | Get specific donation details |

### Inventory Stock (`/api/stock`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/stock` | Public | View current blood stock for all 8 blood groups |
| `GET` | `/api/stock/:bloodGroup` | Public | View stock units for a specific blood group |
| `PUT` | `/api/stock/:bloodGroup` | Staff | Set absolute stock units (guarded against negative values) |
| `PATCH` | `/api/stock/:bloodGroup/adjust` | Staff | Adjust stock by a delta (+/-) with concurrency locking |

### Admin & User Management (`/api/admin`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/admin/stats` | Staff | Parallel dashboard metrics via `Promise.all` |
| `GET` | `/api/admin/users` | Admin | List all registered system users |
| `PATCH` | `/api/admin/users/:id/status` | Admin | Activate or deactivate a user (self-deactivation blocked) |
| `PATCH` | `/api/admin/users/:id/role` | Admin | Modify a user's system role (self-demotion blocked) |

---

## 🎓 College Viva & Interview Defense Guide

When presenting this project in your academic evaluation or viva voce, here are the core engineering decisions you can speak to with confidence:

### Q1: Why did you transition from a JSON file to MySQL?
> **Answer**: A JSON file (`fs.writeFile`) requires rewriting the entire file to disk on every single mutation. It cannot handle concurrent writes, lacks ACID transaction guarantees, does not enforce foreign keys or unique constraints, and risks race conditions. We migrated to **MySQL with the InnoDB engine** to provide atomic transactions, row-level locking (`FOR UPDATE`), referential integrity, and efficient indexing.

### Q2: How do you prevent race conditions when two staff members fulfill requests simultaneously?
> **Answer**: In `controllers/requestController.js`, inside `fulfillRequest`, we use database transactions (`conn.beginTransaction()`) and lock the stock record using `SELECT units FROM blood_stock WHERE blood_group = ? FOR UPDATE`. This places an exclusive row-level lock on that specific blood group. If two requests for O+ blood arrive at the exact same millisecond, the second transaction is queued until the first commits or rolls back. Stock is evaluated after the lock is acquired, guaranteeing inventory never dips below zero.

### Q3: Why is password hashing done with `await bcrypt.hash` instead of `bcrypt.hashSync`?
> **Answer**: Node.js operates on a single-threaded event loop. `bcrypt.hashSync` is a CPU-intensive synchronous operation that blocks the entire event loop, freezing the server for all other concurrent users while calculating the key. Using `await bcrypt.hash` offloads the computation to the libuv worker pool, allowing the server to handle concurrent incoming HTTP traffic seamlessly.

### Q4: How is Role-Based Access Control (RBAC) securely maintained?
> **Answer**: Role information sent in request bodies from the browser is never trusted for authorization. The user's role is extracted from the cryptographically signed JWT token verified by our secret key. In addition, our `protect` middleware queries the database to confirm that the user still exists and that their account has not been deactivated (`is_active = 1`).

### Q5: What is the purpose of the 56-day donation interval rule?
> **Answer**: Under medical guidelines, a healthy human body typically requires approximately 8 weeks (56 days) to replenish red blood cells after a whole blood donation. We implemented this as an application business rule in `donationController.js` to ensure donors cannot donate prematurely.

---

## 📁 Project Directory Structure

```
bloodcare-backend/
├── config/
│   └── db.js                 # MySQL connection pool & test helper
├── controllers/
│   ├── adminController.js     # User management & parallel stats
│   ├── authController.js      # Async bcrypt auth & JWT issuance
│   ├── donationController.js  # Donation recording & 56-day rule
│   ├── donorController.js     # Atomic registration & donor profiles
│   ├── requestController.js   # State machine & row-locked fulfillment
│   └── stockController.js     # Concurrency-safe inventory management
├── database/
│   ├── schema.sql             # Relational DDL with constraints & indexes
│   └── seed.sql               # Seed data for 8 blood groups
├── middleware/
│   ├── auth.js                # JWT verification & active status checking
│   └── errorHandler.js        # Safe error sanitization & JSON 400 handler
├── public/                    # Production frontend served directly
│   ├── admin.html
│   ├── donate.html
│   ├── index.html
│   ├── login.html
│   ├── register.html
│   ├── request.html
│   ├── css/style.css
│   └── js/script.js           # Vanilla JS API client
├── routes/
│   ├── adminRoutes.js
│   ├── authRoutes.js
│   ├── donationRoutes.js
│   ├── donorRoutes.js
│   ├── requestRoutes.js
│   └── stockRoutes.js
├── tests/
│   └── test_runner.js         # 40-point automated integration test suite
├── utils/
│   ├── seed.js                # Default admin account verification
│   └── validation.js          # Central input validation rules
├── .env                       # Local secrets & database configuration
├── package.json
└── server.js                  # Express application entry point
```
