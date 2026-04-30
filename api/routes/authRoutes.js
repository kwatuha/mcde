// backend/routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db'); // Your database connection pool
const orgScope = require('../services/organizationScopeService');
const authenticate = require('../middleware/authenticate');
const { normalizeRoleForCompare, ADMIN_LIKE_ROLE_NAMES, isAdminLikeRequester } = require('../utils/roleUtils');
const { canSendEmail, sendPasswordResetEmail } = require('../services/accountEmailService');
const { setMustChangePassword, getMustChangePassword } = require('../services/passwordPolicyService');

require('dotenv').config(); // Load environment variables

const JWT_SECRET = process.env.JWT_SECRET || 'your_fallback_secret_for_dev_only_change_this_asap';
const SESSION_SETTINGS_KEY = 'session.idle_timeout_minutes';
const DEFAULT_IDLE_TIMEOUT_MINUTES = 60;

function generateOneTimePassword(length = 12) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    let value = '';
    for (let i = 0; i < length; i += 1) {
        value += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return value;
}

/**
 * Read/write idle timeout in system_settings only when using PostgreSQL.
 * Historically we checked DB_TYPE === 'postgresql' only; production often omits DB_TYPE
 * (defaulting to 'mysql' in code) or uses "postgres", which incorrectly skipped DB and
 * always returned 60 minutes.
 */
function sessionPolicyUsesPostgresStorage() {
    const t = (process.env.DB_TYPE || '').trim().toLowerCase();
    if (t === 'mysql' || t === 'mariadb') return false;
    if (t === 'postgresql' || t === 'postgres') return true;
    // Unset or unknown: this API ships with node-postgres (see config/db.js).
    return true;
}

async function ensureSystemSettingsTableForPostgres() {
    const existsResult = await pool.query(`SELECT to_regclass('public.system_settings') AS table_name`);
    const exists = Boolean(existsResult.rows?.[0]?.table_name);
    if (exists) return;

    await pool.query(`
        CREATE TABLE IF NOT EXISTS system_settings (
            setting_key TEXT PRIMARY KEY,
            setting_value TEXT NOT NULL,
            updated_by INTEGER NULL,
            updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
}

async function getIdleTimeoutMinutesForPostgres() {
    await ensureSystemSettingsTableForPostgres();
    const result = await pool.query(
        `SELECT setting_value FROM system_settings WHERE setting_key = $1 LIMIT 1`,
        [SESSION_SETTINGS_KEY]
    );
    const raw = result.rows?.[0]?.setting_value;
    const n = parseInt(String(raw || ''), 10);
    if (!Number.isFinite(n) || n < 0) return DEFAULT_IDLE_TIMEOUT_MINUTES;
    return n;
}

async function setIdleTimeoutMinutesForPostgres(minutes, updatedBy) {
    await ensureSystemSettingsTableForPostgres();
    await pool.query(
        `
        INSERT INTO system_settings (setting_key, setting_value, updated_by, updated_at)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        ON CONFLICT (setting_key)
        DO UPDATE SET
            setting_value = EXCLUDED.setting_value,
            updated_by = EXCLUDED.updated_by,
            updated_at = CURRENT_TIMESTAMP
        `,
        [SESSION_SETTINGS_KEY, String(minutes), updatedBy || null]
    );
}

router.post('/test-reach', (req, res) => {
    res.status(200).json({ message: 'Auth test route reached!' });
});

/**
 * @file Authentication routes for user login and registration.
 * @description Handles user authentication, including password comparison and JWT token generation.
 */

/**
 * Helper function to fetch privileges for a given role ID.
 * @param {number} roleId - The ID of the role.
 * @returns {Promise<string[]>} An array of privilege names.
 */
async function getPrivilegesByRole(roleId) {
    try {
        // PostgreSQL uses role_permissions and permissions tables
        const DB_TYPE = process.env.DB_TYPE || 'mysql';
        let rows;
        
        if (DB_TYPE === 'postgresql') {
            // PostgreSQL structure: role_privileges -> privileges (same as MySQL)
            // Use $1 placeholder directly for PostgreSQL
            const result = await pool.query(
                `SELECT p.privilegename as "privilegeName"
                 FROM role_privileges rp
                 JOIN privileges p ON rp.privilegeid = p.privilegeid
                 WHERE rp.roleid = $1 AND rp.voided = false AND p.voided = false`,
                [roleId]
            );
            // PostgreSQL pool.query returns { rows: [...] } structure
            rows = result.rows || [];
        } else {
            // MySQL structure: role_privileges -> privileges
            const result = await pool.query(
                `SELECT kp.privilegeName
                 FROM roles kr
                 JOIN role_privileges krp ON kr.roleId = krp.roleId
                 JOIN privileges kp ON krp.privilegeId = kp.privilegeId
                 WHERE kr.roleId = ?`,
                [roleId]
            );
            rows = Array.isArray(result) ? result[0] : result.rows || result;
        }
        
        // Handle both camelCase and lowercase column names
        return rows.map(row => row.privilegeName || row.privilegename || row.PrivilegeName || '').filter(p => p);
    } catch (error) {
        console.error('Error fetching privileges for roleId', roleId, ':', error);
        return [];
    }
}

// @route   POST /register
// @desc    Register a new user (requires admin approval)
// @access  Public
router.post('/register', async (req, res) => {
    const { username, email, password, firstName, lastName, roleName, idNumber, employeeNumber, consentGiven, ministry, state_department, agency_id, phoneNumber } = req.body;

    let resolvedAgencyId = null;
    if (agency_id !== undefined && agency_id !== null && agency_id !== '') {
        const n = Number(agency_id);
        if (Number.isNaN(n)) {
            return res.status(400).json({ error: 'Invalid agency selection.' });
        }
        resolvedAgencyId = n;
    }

    // Validate required fields (agency is optional)
    if (!username || !email || !password || !firstName || !lastName || !idNumber || !employeeNumber || !ministry || !state_department) {
        return res.status(400).json({ error: 'Please enter all required fields: username, email, password, first name, last name, ID number, employee number, ministry, and state department.' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Please enter a valid email address (e.g., user@example.com).' });
    }

    // Validate phone format if provided (0718109196 or +254718109196)
    if (phoneNumber !== undefined && phoneNumber !== null && String(phoneNumber).trim() !== '') {
        const phoneRegex = /^(?:07\d{8}|\+2547\d{8})$/;
        if (!phoneRegex.test(String(phoneNumber).trim())) {
            return res.status(400).json({ error: 'Invalid phone number format. Use 07XXXXXXXX or +2547XXXXXXXX.' });
        }
    }

    // Validate consent
    if (!consentGiven) {
        return res.status(400).json({ error: 'You must consent to the collection and use of your information to proceed.' });
    }

    try {
        const DB_TYPE = process.env.DB_TYPE || 'mysql';
        
        // Check for existing users (clear message; voided-only → ask admin to restore)
        const rowVoided = (r) => {
            const v = r.voided ?? r.Voided ?? r.VOIDED;
            if (v === true || v === 1 || v === '1') return true;
            if (v === false || v === 0 || v === '0' || v === null || v === undefined) return false;
            return Boolean(v);
        };
        const rowUser = (r) => r.username ?? r.userName ?? r.USERNAME;
        const rowEmail = (r) => r.email ?? r.Email ?? r.EMAIL;

        let checkQuery;
        let checkParams;
        if (DB_TYPE === 'postgresql') {
            checkQuery = `
                SELECT username, email, voided
                FROM users
                WHERE username = $1 OR email = $2
                LIMIT 2
            `;
            checkParams = [username, email];
        } else {
            checkQuery = `
                SELECT username, email, voided
                FROM users
                WHERE username = ? OR email = ?
                LIMIT 2
            `;
            checkParams = [username, email];
        }

        const checkResult = await pool.query(checkQuery, checkParams);
        const dupRows = DB_TYPE === 'postgresql'
            ? (checkResult.rows || [])
            : (Array.isArray(checkResult) ? checkResult[0] : checkResult) || [];
        const dupList = Array.isArray(dupRows) ? dupRows : dupRows ? [dupRows] : [];

        if (dupList.length > 0) {
            const matchesUsername = dupList.filter((r) => rowUser(r) === username);
            const matchesEmail = dupList.filter((r) => rowEmail(r) === email);
            const activeUsernameConflict = matchesUsername.some((r) => !rowVoided(r));
            const activeEmailConflict = matchesEmail.some((r) => !rowVoided(r));

            if (activeUsernameConflict || activeEmailConflict) {
                const usernameTaken = matchesUsername.length > 0;
                const emailTaken = matchesEmail.length > 0;
                let dupMessage;
                if (usernameTaken && emailTaken) {
                    dupMessage = 'An account with this username and email is already registered. Please sign in instead, or use a different username and email.';
                } else if (usernameTaken) {
                    dupMessage = 'This username is already taken. Please choose a different username.';
                } else {
                    dupMessage = 'An account with this email address already exists. Please sign in or use a different email.';
                }
                return res.status(400).json({ error: dupMessage, code: 'DUPLICATE_USER' });
            }

            const voidedMessage =
                'This username or email is linked to a deactivated account. Please contact your system administrator to restore access.';
            return res.status(400).json({ error: voidedMessage, code: 'VOIDED_USER' });
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);
        
        // Get default role (usually a basic user role like 'viewer' or first available)
        let roleId = null;
        const adminLikeRoleNamesList = Array.from(ADMIN_LIKE_ROLE_NAMES);
        
        if (DB_TYPE === 'postgresql') {
            // First try to find 'viewer' role (common default)
            let roleQuery = 'SELECT roleid FROM roles WHERE LOWER(name) = LOWER($1) AND voided = false LIMIT 1';
            let roleParams = [roleName || 'viewer'];
            const roleResult = await pool.query(roleQuery, roleParams);
            const roleRows = roleResult.rows || [];
            roleId = roleRows.length > 0 ? roleRows[0].roleid : null;
            
            // If not found, try to get the first available non-admin-like role.
            if (!roleId) {
                const fallbackResult = await pool.query(
                    `SELECT roleid
                     FROM roles
                     WHERE voided = false
                       AND LOWER(TRIM(name)) NOT IN (${adminLikeRoleNamesList.map((_, idx) => `$${idx + 1}`).join(', ')})
                     ORDER BY roleid
                     LIMIT 1`,
                    adminLikeRoleNamesList
                );
                const fallbackRows = fallbackResult.rows || [];
                roleId = fallbackRows.length > 0 ? fallbackRows[0].roleid : null;
            }
        } else {
            // MySQL
            let roleQuery = 'SELECT roleId FROM roles WHERE roleName = ? AND voided = 0 LIMIT 1';
            let roleParams = [roleName || 'viewer'];
            const roleResult = await pool.query(roleQuery, roleParams);
            const roleRows = Array.isArray(roleResult) ? roleResult[0] : roleResult.rows || roleResult;
            roleId = Array.isArray(roleRows) && roleRows.length > 0 ? roleRows[0].roleId : null;
            
            // If not found, try to get the first available non-admin-like role.
            if (!roleId) {
                const fallbackResult = await pool.query(
                    `SELECT roleId
                     FROM roles
                     WHERE voided = 0
                       AND LOWER(TRIM(roleName)) NOT IN (${adminLikeRoleNamesList.map(() => '?').join(', ')})
                     ORDER BY roleId
                     LIMIT 1`,
                    adminLikeRoleNamesList
                );
                const fallbackRows = Array.isArray(fallbackResult) ? fallbackResult[0] : fallbackResult.rows || fallbackResult;
                roleId = Array.isArray(fallbackRows) && fallbackRows.length > 0 ? fallbackRows[0].roleId : null;
            }
        }

        if (!roleId) {
            return res.status(400).json({ error: 'No roles available. Please contact administrator.' });
        }
        
        // Insert user with isActive = false (pending approval)
        let insertQuery;
        let insertParams;
        if (DB_TYPE === 'postgresql') {
            // Check if ministry, state_department, agency_id, and phone_number columns exist
            const columnCheck = await pool.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'users' 
                AND column_name IN ('ministry', 'state_department', 'agency_id', 'phone_number')
            `);
            const hasMinistry = columnCheck.rows.some(row => row.column_name === 'ministry');
            const hasStateDepartment = columnCheck.rows.some(row => row.column_name === 'state_department');
            const hasAgencyId = columnCheck.rows.some(row => row.column_name === 'agency_id');
            const hasPhoneNumber = columnCheck.rows.some(row => row.column_name === 'phone_number');
            
            if (hasMinistry && hasStateDepartment && hasAgencyId && hasPhoneNumber) {
                insertQuery = `
                    INSERT INTO users (username, email, phone_number, passwordhash, firstname, lastname, roleid, id_number, employee_number, ministry, state_department, agency_id, createdat, updatedat, isactive, voided)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, false, false)
                    RETURNING userid
                `;
                insertParams = [username, email, phoneNumber || null, passwordHash, firstName, lastName, roleId, idNumber, employeeNumber, ministry, state_department, resolvedAgencyId];
            } else if (hasMinistry && hasStateDepartment && hasAgencyId) {
                insertQuery = `
                    INSERT INTO users (username, email, passwordhash, firstname, lastname, roleid, id_number, employee_number, ministry, state_department, agency_id, createdat, updatedat, isactive, voided)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, false, false)
                    RETURNING userid
                `;
                insertParams = [username, email, passwordHash, firstName, lastName, roleId, idNumber, employeeNumber, ministry, state_department, resolvedAgencyId];
            } else if (hasMinistry && hasAgencyId && hasPhoneNumber) {
                insertQuery = `
                    INSERT INTO users (username, email, phone_number, passwordhash, firstname, lastname, roleid, id_number, employee_number, ministry, agency_id, createdat, updatedat, isactive, voided)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, false, false)
                    RETURNING userid
                `;
                insertParams = [username, email, phoneNumber || null, passwordHash, firstName, lastName, roleId, idNumber, employeeNumber, ministry, resolvedAgencyId];
            } else {
                insertQuery = `
                    INSERT INTO users (username, email, passwordhash, firstname, lastname, roleid, id_number, employee_number, createdat, updatedat, isactive, voided)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, false, false)
                    RETURNING userid
                `;
                insertParams = [username, email, passwordHash, firstName, lastName, roleId, idNumber, employeeNumber];
            }
        } else {
            // MySQL - check if columns exist
            const columnCheck = await pool.query(`
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = 'users' 
                AND COLUMN_NAME IN ('ministry', 'state_department', 'agency_id')
            `);
            const hasMinistry = Array.isArray(columnCheck) ? columnCheck.some(row => row.COLUMN_NAME === 'ministry') : false;
            const hasStateDepartment = Array.isArray(columnCheck) ? columnCheck.some(row => row.COLUMN_NAME === 'state_department') : false;
            const hasAgencyId = Array.isArray(columnCheck) ? columnCheck.some(row => row.COLUMN_NAME === 'agency_id') : false;
            
            if (hasMinistry && hasStateDepartment && hasAgencyId) {
                insertQuery = `
                    INSERT INTO users (username, email, passwordHash, firstName, lastName, roleId, idNumber, employeeNumber, ministry, state_department, agency_id, createdAt, updatedAt, isActive, voided)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), 0, 0)
                `;
                insertParams = [username, email, passwordHash, firstName, lastName, roleId, idNumber, employeeNumber, ministry, state_department, resolvedAgencyId];
            } else if (hasMinistry && hasAgencyId) {
                insertQuery = `
                    INSERT INTO users (username, email, passwordHash, firstName, lastName, roleId, idNumber, employeeNumber, ministry, agency_id, createdAt, updatedAt, isActive, voided)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), 0, 0)
                `;
                insertParams = [username, email, passwordHash, firstName, lastName, roleId, idNumber, employeeNumber, ministry, resolvedAgencyId];
            } else {
                insertQuery = `
                    INSERT INTO users (username, email, passwordHash, firstName, lastName, roleId, idNumber, employeeNumber, createdAt, updatedAt, isActive, voided)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), 0, 0)
                `;
                insertParams = [username, email, passwordHash, firstName, lastName, roleId, idNumber, employeeNumber];
            }
        }
        
        const insertResult = await pool.query(insertQuery, insertParams);
        const userId = DB_TYPE === 'postgresql' ? insertResult.rows[0].userid : insertResult.insertId;

        // Organization scopes are created when the account is activated (PUT user isActive),
        // not at registration — keeps pending users without scope rows until approved.

        // Return success message without token - user must wait for approval
        res.status(201).json({ 
            message: 'Registration successful! Your account is pending approval by an administrator. You will be notified once your account is activated.',
            userId: userId,
            requiresApproval: true
        });

    } catch (err) {
        console.error('Error during registration:', err);
        
        if (err.code === 'ER_DUP_ENTRY' || err.code === '23505') {
            return res.status(400).json({
                error: 'An account with this username or email already exists. Please sign in or use different details.',
                code: 'DUPLICATE_USER',
            });
        }
        res.status(500).json({ error: 'Server error during registration.', details: err.message });
    }
});

// @route   POST /login
// @desc    Authenticate user & get token
// @access  Public
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const DB_TYPE = process.env.DB_TYPE || 'mysql';
        let query, users;
        
        if (DB_TYPE === 'postgresql') {
            // PostgreSQL schema: roles has 'name' column, roleid as PK
            query = `
                SELECT 
                    u.*, 
                    r.name AS role
                FROM users u
                LEFT JOIN roles r ON u.roleid = r.roleid
                WHERE (u.username = $1 OR u.email = $1) AND u.voided = false
            `;
            const result = await pool.query(query, [username]);
            users = result.rows || [];
        } else {
            // MySQL uses camelCase column names
            query = `
                SELECT 
                    u.*, 
                    r.roleName AS role
                FROM users u
                LEFT JOIN roles r ON u.roleId = r.roleId
                WHERE (u.username = ? OR u.email = ?) AND u.voided = 0
            `;
            const result = await pool.execute(query, [username, username]);
            users = Array.isArray(result) ? result[0] : result.rows || result;
        }

        // Ensure users is an array
        if (!Array.isArray(users)) {
            users = users ? [users] : [];
        }

        if (users.length === 0) {
            return res.status(400).json({ error: 'Invalid credentials.' });
        }

        const user = users[0];
        
        // Check if user account is active (approved)
        const isActive = user.isActive !== undefined ? user.isActive : (user.isactive !== undefined ? user.isactive : true);
        if (!isActive) {
            return res.status(403).json({ 
                error: 'Your account is pending approval. Please wait for an administrator to activate your account.',
                requiresApproval: true
            });
        }
        // Handle both PostgreSQL (passwordhash) and MySQL (passwordHash) column names
        const passwordHash = user.passwordHash || user.passwordhash;
        if (!passwordHash) {
            console.error('User password not set for user:', username);
            return res.status(500).json({ error: 'Server configuration error: User password not set.' });
        }

        const isMatch = await bcrypt.compare(password, passwordHash);

        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid credentials.' });
        }
        
        // Handle both PostgreSQL (roleid, userid) and MySQL (roleId, userId) column names
        const roleId = user.roleId || user.roleid;
        const userId = user.userId || user.userid;

        const userPrivileges = await getPrivilegesByRole(roleId);

        let organizationScopes = [];
        if (DB_TYPE === 'postgresql') {
            try {
                organizationScopes = await orgScope.fetchOrganizationScopesForUser(userId);
            } catch (scopeErr) {
                console.warn('fetchOrganizationScopesForUser (login):', scopeErr.message);
            }
        }

        const payload = {
            user: {
                id: userId,
                actualUserId: userId,
                username: user.username,
                email: user.email,
                roleId: roleId,
                roleName: user.role,
                privileges: userPrivileges,
                organizationScopes,
            }
        };
        const normalizedRole = normalizeRoleForCompare(user.role || '');
        const isSuperAdmin = normalizedRole === 'super admin';
        const isDefaultResetPassword = String(password || '').trim() === 'reset123';
        let mustChangePassword = false;
        if (DB_TYPE === 'postgresql') {
            try {
                mustChangePassword = await getMustChangePassword(userId);
            } catch (policyErr) {
                console.warn('getMustChangePassword (login):', policyErr.message);
            }
        }
        const forcePasswordChange = isSuperAdmin || isDefaultResetPassword || mustChangePassword;

        jwt.sign(
            payload,
            JWT_SECRET,
            { expiresIn: '24h' }, // Changed to 24 hours for a better user experience
            (err, token) => {
                if (err) {
                    console.error('JWT signing error:', err);
                    return res.status(500).json({ error: 'Server error during token generation.' });
                }
                res.json({ token, message: 'Logged in successfully!', forcePasswordChange });
            }
        );

    } catch (err) {
        console.error('Error during login:', err);
        res.status(500).json({ error: 'Server error during login.', details: err.message });
    }
});

// @route   POST /auth/change-password
// @desc    Change password for authenticated user
// @access  Private
router.post('/change-password', authenticate, async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    const authUserId = req.user?.id ?? req.user?.userId ?? req.user?.actualUserId;
    const userId = parseInt(String(authUserId), 10);

    if (!Number.isFinite(userId)) {
        return res.status(401).json({ error: 'Invalid authentication context.' });
    }
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current password and new password are required.' });
    }
    if (String(newPassword).length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
    }
    if (String(currentPassword) === String(newPassword)) {
        return res.status(400).json({ error: 'New password must be different from current password.' });
    }

    try {
        const DB_TYPE = process.env.DB_TYPE || 'mysql';
        let query;
        let params;
        if (DB_TYPE === 'postgresql') {
            query = `
                SELECT userid, passwordhash
                FROM users
                WHERE userid = $1 AND COALESCE(voided, false) = false
                LIMIT 1
            `;
            params = [userId];
        } else {
            query = `
                SELECT userId, passwordHash
                FROM users
                WHERE userId = ? AND voided = 0
                LIMIT 1
            `;
            params = [userId];
        }

        const result = await pool.query(query, params);
        const rows = DB_TYPE === 'postgresql' ? (result.rows || []) : (Array.isArray(result) ? result[0] : result) || [];
        const row = Array.isArray(rows) ? rows[0] : rows;
        if (!row) {
            return res.status(404).json({ error: 'User not found.' });
        }

        const existingHash = row.passwordhash || row.passwordHash;
        if (!existingHash) {
            return res.status(500).json({ error: 'User password not set.' });
        }

        const isMatch = await bcrypt.compare(String(currentPassword), existingHash);
        if (!isMatch) {
            return res.status(401).json({ error: 'Current password is incorrect.' });
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(String(newPassword), salt);
        if (DB_TYPE === 'postgresql') {
            await pool.query(
                'UPDATE users SET passwordhash = $1, updatedat = CURRENT_TIMESTAMP WHERE userid = $2',
                [passwordHash, userId]
            );
            await setMustChangePassword(userId, false, 'password_changed');
        } else {
            await pool.query(
                'UPDATE users SET passwordHash = ?, updatedAt = NOW() WHERE userId = ?',
                [passwordHash, userId]
            );
        }

        return res.status(200).json({ success: true, message: 'Password changed successfully.' });
    } catch (err) {
        console.error('Error changing password:', err);
        return res.status(500).json({ error: 'Server error while changing password.', details: err.message });
    }
});

// @route   POST /auth/forgot-password
// @desc    Reset password and email a temporary one-time password
// @access  Public
router.post('/forgot-password', async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) {
        return res.status(400).json({ error: 'Email is required.' });
    }

    try {
        const DB_TYPE = process.env.DB_TYPE || 'mysql';
        if (!canSendEmail()) {
            return res.status(503).json({ error: 'Password reset email is not configured. Please contact administrator.' });
        }
        let userRow = null;
        if (DB_TYPE === 'postgresql') {
            const result = await pool.query(
                `SELECT userid, username, email, firstname, lastname
                 FROM users
                 WHERE LOWER(email) = LOWER($1)
                   AND COALESCE(voided, false) = false
                 LIMIT 1`,
                [email]
            );
            userRow = result.rows?.[0] || null;
        } else {
            const result = await pool.query(
                `SELECT userId, username, email, firstName, lastName
                 FROM users
                 WHERE LOWER(email) = LOWER(?)
                   AND voided = 0
                 LIMIT 1`,
                [email]
            );
            const rows = Array.isArray(result) ? result[0] : result;
            userRow = Array.isArray(rows) ? rows[0] : rows;
        }

        // Always return generic response to prevent account enumeration.
        const genericResponse = {
            success: true,
            message: 'If the email exists, password reset instructions have been sent.',
        };
        if (!userRow) {
            return res.status(200).json(genericResponse);
        }

        const userId = userRow.userid || userRow.userId;
        const username = userRow.username;
        const fullName = `${userRow.firstname || userRow.firstName || ''} ${userRow.lastname || userRow.lastName || ''}`.trim();
        const oneTimePassword = generateOneTimePassword();
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(oneTimePassword, salt);

        if (DB_TYPE === 'postgresql') {
            await pool.query(
                'UPDATE users SET passwordhash = $1, updatedat = CURRENT_TIMESTAMP WHERE userid = $2',
                [passwordHash, userId]
            );
            await setMustChangePassword(userId, true, 'forgot_password');
        } else {
            await pool.query(
                'UPDATE users SET passwordHash = ?, updatedAt = NOW() WHERE userId = ?',
                [passwordHash, userId]
            );
        }

        try {
            await sendPasswordResetEmail({
                email: userRow.email,
                fullName,
                username,
                oneTimePassword,
            });
        } catch (mailErr) {
            console.error('Forgot password email failed:', mailErr.message);
        }

        return res.status(200).json(genericResponse);
    } catch (err) {
        console.error('Error processing forgot-password:', err);
        return res.status(500).json({ error: 'Server error while processing password reset.', details: err.message });
    }
});

// @route   GET /auth/session-policy
// @desc    Fetch client session policy (idle timeout minutes)
// @access  Private
router.get('/session-policy', authenticate, async (req, res) => {
    try {
        if (!sessionPolicyUsesPostgresStorage()) {
            return res.status(200).json({
                idleTimeoutMinutes: DEFAULT_IDLE_TIMEOUT_MINUTES,
                source: 'default_non_postgres',
            });
        }

        const idleTimeoutMinutes = await getIdleTimeoutMinutesForPostgres();
        return res.status(200).json({
            idleTimeoutMinutes,
            source: 'system_settings',
        });
    } catch (err) {
        console.error('Error fetching session policy:', err);
        return res.status(500).json({ error: 'Failed to fetch session policy.', details: err.message });
    }
});

// @route   PUT /auth/session-policy
// @desc    Update idle timeout minutes (Super Admin / admin-like only)
// @access  Private
router.put('/session-policy', authenticate, async (req, res) => {
    try {
        if (!isAdminLikeRequester(req.user)) {
            return res.status(403).json({ error: 'Only super admin/admin can update session policy.' });
        }

        const minutesRaw = req.body?.idleTimeoutMinutes;
        const idleTimeoutMinutes = parseInt(String(minutesRaw), 10);
        if (!Number.isFinite(idleTimeoutMinutes) || idleTimeoutMinutes < 1 || idleTimeoutMinutes > 1440) {
            return res.status(400).json({ error: 'idleTimeoutMinutes must be between 1 and 1440.' });
        }

        if (!sessionPolicyUsesPostgresStorage()) {
            return res.status(200).json({
                idleTimeoutMinutes,
                source: 'memory_only',
                warning: 'Persistent session policy storage is not used when DB_TYPE is MySQL/MariaDB.',
            });
        }

        const authUserId = req.user?.id ?? req.user?.userId ?? req.user?.actualUserId ?? null;
        const updatedBy = Number.isFinite(parseInt(String(authUserId), 10)) ? parseInt(String(authUserId), 10) : null;
        await setIdleTimeoutMinutesForPostgres(idleTimeoutMinutes, updatedBy);

        return res.status(200).json({
            success: true,
            idleTimeoutMinutes,
            message: 'Session idle timeout updated successfully.',
        });
    } catch (err) {
        console.error('Error updating session policy:', err);
        return res.status(500).json({ error: 'Failed to update session policy.', details: err.message });
    }
});

module.exports = router;