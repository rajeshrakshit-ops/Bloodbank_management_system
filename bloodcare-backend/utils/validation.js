/**
 * Validation utilities for BloodCare system
 * Reusable, clean, and beginner-friendly helper functions.
 */

const VALID_BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];
const VALID_ROLES = ["admin", "employee", "donor", "requester"];
const VALID_REQUEST_STATUSES = ["pending", "approved", "rejected", "fulfilled"];
const VALID_GENDERS = ["Male", "Female", "Other"];

/**
 * Validates whether a given ID is a positive whole number (integer > 0).
 */
function isValidId(value) {
    if (value === null || value === undefined || value === "") return false;
    const num = Number(value);
    return Number.isInteger(num) && num > 0;
}

/**
 * Validates email format using standard RFC-compliant pattern.
 */
function isValidEmail(email) {
    if (!email || typeof email !== "string") return false;
    const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return re.test(email.trim());
}

/**
 * Validates phone numbers (permits international + prefix, spaces, dashes, 7-15 digits).
 */
function isValidPhone(phone) {
    if (!phone || typeof phone !== "string") return false;
    const trimmed = phone.trim();
    // Must contain between 7 and 15 numeric digits
    const digitsOnly = trimmed.replace(/\D/g, "");
    return digitsOnly.length >= 7 && digitsOnly.length <= 15;
}

/**
 * Validates if blood group matches one of the 8 accepted standard groups.
 */
function isValidBloodGroup(group) {
    return VALID_BLOOD_GROUPS.includes(group);
}

/**
 * Validates donor age according to project requirements (18–65 years).
 */
function isValidDonorAge(age) {
    if (age === null || age === undefined || age === "") return false;
    const num = Number(age);
    return Number.isInteger(num) && num >= 18 && num <= 65;
}

/**
 * Validates general age (e.g. for blood requests: 1–120 years).
 */
function isValidAge(age) {
    if (age === null || age === undefined || age === "") return false;
    const num = Number(age);
    return Number.isInteger(num) && num >= 1 && num <= 120;
}

/**
 * Validates positive whole units (e.g. 1 to 20 units).
 */
function isValidUnits(units, max = 20) {
    if (units === null || units === undefined || units === "") return false;
    const num = Number(units);
    return Number.isInteger(num) && num > 0 && num <= max;
}

/**
 * Validates donation date:
 * - Must match YYYY-MM-DD format
 * - Must be a real calendar date
 * - Must NOT be in the future
 */
function isValidDonationDate(dateStr) {
    if (!dateStr || typeof dateStr !== "string") return false;
    const trimmed = dateStr.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return false;

    const parsed = new Date(trimmed);
    if (isNaN(parsed.getTime())) return false;

    // ISO string format comparison (YYYY-MM-DD)
    const today = new Date().toISOString().slice(0, 10);
    return trimmed <= today;
}

/**
 * Validates if status is allowed for blood requests.
 */
function isValidRequestStatus(status) {
    return VALID_REQUEST_STATUSES.includes(status);
}

/**
 * Validates gender against accepted values.
 */
function isValidGender(gender) {
    return VALID_GENDERS.includes(gender);
}

/**
 * Validates user role.
 */
function isValidRole(role) {
    return VALID_ROLES.includes(role);
}

module.exports = {
    VALID_BLOOD_GROUPS,
    VALID_ROLES,
    VALID_REQUEST_STATUSES,
    VALID_GENDERS,
    isValidId,
    isValidEmail,
    isValidPhone,
    isValidBloodGroup,
    isValidDonorAge,
    isValidAge,
    isValidUnits,
    isValidDonationDate,
    isValidRequestStatus,
    isValidGender,
    isValidRole,
};
