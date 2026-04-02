// backend/routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db'); // Your database connection pool
const orgScope = require('../services/organizationScopeService');

require('dotenv').config(); // Load environment variables

const JWT_SECRET = process.env.JWT_SECRET || 'your_fallback_secret_for_dev_only_change_this_asap';

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

    // Validate required fields
    if (!username || !email || !password || !firstName || !lastName || !idNumber || !employeeNumber || !ministry || !state_department || !agency_id) {
        return res.status(400).json({ error: 'Please enter all required fields: username, email, password, first name, last name, ID number, employee number, ministry, state department, and agency.' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Please enter a valid email address (e.g., user@example.com).' });
    }

    // Validate consent
    if (!consentGiven) {
        return res.status(400).json({ error: 'You must consent to the collection and use of your information to proceed.' });
    }

    try {
        const DB_TYPE = process.env.DB_TYPE || 'mysql';
        
        // Check for existing users
        let checkQuery;
        let checkParams;
        if (DB_TYPE === 'postgresql') {
            checkQuery = 'SELECT userid FROM users WHERE username = $1 OR email = $2';
            checkParams = [username, email];
        } else {
            checkQuery = 'SELECT userId FROM users WHERE username = ? OR email = ?';
            checkParams = [username, email];
        }
        
        const checkResult = await pool.query(checkQuery, checkParams);
        const existingUsers = DB_TYPE === 'postgresql' ? checkResult.rows : (Array.isArray(checkResult) ? checkResult[0] : checkResult);
        
        if (Array.isArray(existingUsers) ? existingUsers.length > 0 : existingUsers) {
            return res.status(400).json({ error: 'User with that username or email already exists.' });
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);
        
        // Get default role (usually a basic user role like 'viewer' or first available)
        let roleId = null;
        
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
                       AND LOWER(TRIM(name)) NOT IN ('admin', 'mda ict admin', 'super admin', 'administrator', 'ict admin')
                     ORDER BY roleid
                     LIMIT 1`
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
                       AND LOWER(TRIM(roleName)) NOT IN ('admin', 'mda ict admin', 'super admin', 'administrator', 'ict admin')
                     ORDER BY roleId
                     LIMIT 1`
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
                insertParams = [username, email, phoneNumber || null, passwordHash, firstName, lastName, roleId, idNumber, employeeNumber, ministry, state_department, agency_id];
            } else if (hasMinistry && hasStateDepartment && hasAgencyId) {
                insertQuery = `
                    INSERT INTO users (username, email, passwordhash, firstname, lastname, roleid, id_number, employee_number, ministry, state_department, agency_id, createdat, updatedat, isactive, voided)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, false, false)
                    RETURNING userid
                `;
                insertParams = [username, email, passwordHash, firstName, lastName, roleId, idNumber, employeeNumber, ministry, state_department, agency_id];
            } else if (hasMinistry && hasAgencyId && hasPhoneNumber) {
                insertQuery = `
                    INSERT INTO users (username, email, phone_number, passwordhash, firstname, lastname, roleid, id_number, employee_number, ministry, agency_id, createdat, updatedat, isactive, voided)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, false, false)
                    RETURNING userid
                `;
                insertParams = [username, email, phoneNumber || null, passwordHash, firstName, lastName, roleId, idNumber, employeeNumber, ministry, agency_id];
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
                insertParams = [username, email, passwordHash, firstName, lastName, roleId, idNumber, employeeNumber, ministry, state_department, agency_id];
            } else if (hasMinistry && hasAgencyId) {
                insertQuery = `
                    INSERT INTO users (username, email, passwordHash, firstName, lastName, roleId, idNumber, employeeNumber, ministry, agency_id, createdAt, updatedAt, isActive, voided)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), 0, 0)
                `;
                insertParams = [username, email, passwordHash, firstName, lastName, roleId, idNumber, employeeNumber, ministry, agency_id];
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
            return res.status(400).json({ error: 'User with that username or email already exists.' });
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

        jwt.sign(
            payload,
            JWT_SECRET,
            { expiresIn: '24h' }, // Changed to 24 hours for a better user experience
            (err, token) => {
                if (err) {
                    console.error('JWT signing error:', err);
                    return res.status(500).json({ error: 'Server error during token generation.' });
                }
                res.json({ token, message: 'Logged in successfully!' });
            }
        );

    } catch (err) {
        console.error('Error during login:', err);
        res.status(500).json({ error: 'Server error during login.', details: err.message });
    }
});

module.exports = router;