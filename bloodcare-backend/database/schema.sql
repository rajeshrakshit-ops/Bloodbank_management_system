-- ============================================================
-- BloodCare — MySQL Schema (Phase 2 design, approved)
-- Database: bloodcare
-- Engine:   InnoDB (required for foreign keys + transactions)
-- Charset:  utf8mb4
-- ============================================================
-- Run this file once to create the database and all tables.
-- Safe to re-run: uses CREATE DATABASE/TABLE IF NOT EXISTS.
-- ============================================================

CREATE DATABASE IF NOT EXISTS bloodcare
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE bloodcare;

-- ------------------------------------------------------------
-- Table: users
-- Single source of authentication for ALL roles (admin,
-- employee, donor, requester). Role-based authorization is
-- always determined server-side from this table / the JWT
-- issued from it — never trusted from the frontend.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(150) NOT NULL,
    email         VARCHAR(191) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role          ENUM('admin','employee','donor','requester') NOT NULL,
    is_active     TINYINT(1) NOT NULL DEFAULT 1,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_users_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Table: donors
-- One donor profile per login account (user_id UNIQUE, nullable).
-- Profile is deliberately separate from the login credential —
-- if the linked user account is deleted, the donor profile
-- survives with user_id set to NULL (ON DELETE SET NULL).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS donors (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    user_id             INT NULL UNIQUE,
    name                VARCHAR(150) NOT NULL,
    age                 TINYINT UNSIGNED NOT NULL,
    gender              ENUM('Male','Female','Other') NOT NULL,
    blood_group         ENUM('A+','A-','B+','B-','AB+','AB-','O+','O-') NOT NULL,
    phone               VARCHAR(20) NOT NULL,
    email               VARCHAR(191) NOT NULL,
    address             TEXT NOT NULL,
    is_available        TINYINT(1) NOT NULL DEFAULT 1,
    last_donation_date  DATE NULL,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_donors_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_donors_blood_group (blood_group)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Table: blood_stock
-- Exactly one row per blood group (8 total). Seeded by seed.sql.
-- blood_group is UNIQUE, so a duplicate group can never be
-- inserted. units can never go negative (CHECK + app-level
-- validation as a backstop, since CHECK enforcement varies
-- across MySQL/MariaDB versions).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS blood_stock (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    blood_group  ENUM('A+','A-','B+','B-','AB+','AB-','O+','O-') NOT NULL UNIQUE,
    units        INT NOT NULL DEFAULT 0,
    updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_stock_units_nonnegative CHECK (units >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Table: blood_requests
-- requester_id is nullable so a public/anonymous request (no
-- login) is still supported — requester_name/phone/email
-- capture who to contact even without a linked user account.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS blood_requests (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    requester_id    INT NULL,
    requester_name  VARCHAR(150) NOT NULL,
    blood_group     ENUM('A+','A-','B+','B-','AB+','AB-','O+','O-') NOT NULL,
    units           INT NOT NULL,
    hospital        VARCHAR(200) NOT NULL,
    phone           VARCHAR(20) NOT NULL,
    email           VARCHAR(191) NOT NULL,
    reason          TEXT NOT NULL,
    status          ENUM('pending','approved','rejected','fulfilled') NOT NULL DEFAULT 'pending',
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_requests_user
        FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_requests_units_positive CHECK (units > 0),
    INDEX idx_requests_status (status),
    INDEX idx_requests_blood_group (blood_group),
    INDEX idx_requests_requester (requester_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Table: donations
-- blood_group is intentionally NOT stored here. A donor's
-- blood group already lives in donors.blood_group — storing it
-- again here would allow it to disagree with the donor's actual
-- blood group (e.g. donor = O+ but donation = A+), which is
-- logically invalid. Instead, the application derives the
-- blood group via donor_id -> donors.blood_group whenever it
-- needs to know which blood_stock row a donation affects.
--
-- donor_id is NOT NULL with ON DELETE RESTRICT: a donation is
-- a historical fact and the donor it references cannot be
-- deleted while donation history exists.
--
-- recorded_by (the admin/employee who logged it) is nullable
-- with ON DELETE SET NULL, so the donation record survives even
-- if that staff account is later removed.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS donations (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    donor_id       INT NOT NULL,
    units          INT NOT NULL,
    donation_date  DATE NOT NULL,
    status         ENUM('recorded','cancelled') NOT NULL DEFAULT 'recorded',
    recorded_by    INT NULL,
    created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_donations_donor
        FOREIGN KEY (donor_id) REFERENCES donors(id) ON DELETE RESTRICT,
    CONSTRAINT fk_donations_recorder
        FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_donations_units_positive CHECK (units > 0),
    INDEX idx_donations_donor (donor_id),
    INDEX idx_donations_date (donation_date),
    INDEX idx_donations_recorded_by (recorded_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
