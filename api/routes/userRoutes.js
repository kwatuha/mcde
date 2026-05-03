const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const orgScope = require('../services/organizationScopeService');
const { isSuperAdminRequester, normalizeRoleForCompare } = require('../utils/roleUtils');
const { canSendEmail, sendInitialCredentialsEmail } = require('../services/accountEmailService');
const { ensureLoginOtpSchema } = require('../services/loginOtpService');
const { setMustChangePassword } = require('../services/passwordPolicyService');

const ALLOWED_ASSIGNMENT_ROLES_FOR_MDA_ICT_ADMIN = new Set([
    'data entry officer',
    'data approver',
    'viewer',
]);

function generateOneTimePassword(length = 12) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    let value = '';
    for (let i = 0; i < length; i += 1) {
        value += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return value;
}

function isMdaIctAdminRequester(reqUser) {
    const raw = reqUser?.roleName ?? reqUser?.role ?? '';
    const normalized = normalizeRoleForCompare(raw);
    // Support common naming variants/typos such as "MDA ICT addmin".
    return normalized === 'mda ict admin'
        || normalized === 'mda ict addmin'
        || (normalized.includes('mda ict') && (normalized.includes('admin') || normalized.includes('addmin')));
}

async function getRoleNameById(roleId, DB_TYPE) {
    if (DB_TYPE === 'postgresql') {
        const r = await pool.query(
            'SELECT name AS "roleName" FROM roles WHERE roleid = $1 AND voided = false',
            [roleId]
        );
        return r.rows?.[0]?.roleName || null;
    }
    const r = await pool.query('SELECT roleName FROM roles WHERE roleId = ? AND voided = 0', [roleId]);
    const rows = Array.isArray(r) ? r[0] : r;
    return rows?.[0]?.roleName || null;
}

async function getUserRoleNameByUserId(userId, DB_TYPE) {
    if (DB_TYPE === 'postgresql') {
        const r = await pool.query(
            `SELECT r.name AS "roleName"
             FROM users u
             LEFT JOIN roles r ON u.roleid = r.roleid
             WHERE u.userid = $1`,
            [userId]
        );
        return r.rows?.[0]?.roleName || null;
    }
    const r = await pool.query(
        `SELECT r.roleName
         FROM users u
         LEFT JOIN roles r ON u.roleId = r.roleId
         WHERE u.userId = ?`,
        [userId]
    );
    const rows = Array.isArray(r) ? r[0] : r;
    return rows?.[0]?.roleName || null;
}

async function enforceRoleAssignmentPermission(reqUser, targetRoleId, DB_TYPE) {
    const roleIdNum = parseInt(String(targetRoleId), 10);
    if (!Number.isFinite(roleIdNum)) {
        return { ok: false, status: 400, error: 'Invalid roleId.' };
    }
    if (isSuperAdminRequester(reqUser)) {
        return { ok: true };
    }
    if (!isMdaIctAdminRequester(reqUser)) {
        return { ok: true };
    }
    const targetRoleName = await getRoleNameById(roleIdNum, DB_TYPE);
    if (!targetRoleName) {
        return { ok: false, status: 400, error: 'Selected role does not exist.' };
    }
    if (!ALLOWED_ASSIGNMENT_ROLES_FOR_MDA_ICT_ADMIN.has(normalizeRoleForCompare(targetRoleName))) {
        return {
            ok: false,
            status: 403,
            error: 'MDA ICT Admin can only assign Data Entry Officer, Data Approver, or Viewer roles.',
        };
    }
    return { ok: true };
}

async function enforceTargetUserEditPermission(reqUser, targetUserId, DB_TYPE) {
    if (isSuperAdminRequester(reqUser)) {
        return { ok: true };
    }
    if (!isMdaIctAdminRequester(reqUser)) {
        return { ok: true };
    }

    const currentRoleName = await getUserRoleNameByUserId(targetUserId, DB_TYPE);
    if (!currentRoleName) {
        return { ok: false, status: 404, error: 'Target user not found.' };
    }

    const normalizedCurrentRole = normalizeRoleForCompare(currentRoleName);
    if (!ALLOWED_ASSIGNMENT_ROLES_FOR_MDA_ICT_ADMIN.has(normalizedCurrentRole)) {
        return {
            ok: false,
            status: 403,
            error: 'MDA ICT Admin can only edit users in Data Entry Officer, Data Approver, or Viewer roles.',
        };
    }

    return { ok: true };
}

/**
 * Active (non-voided) users with role/agency joins; optional org scopes on PostgreSQL.
 * Does not select password or password hash columns.
 */
async function fetchActiveNonVoidedUsers() {
    await ensureLoginOtpSchema(pool).catch(() => {});
    const DB_TYPE = process.env.DB_TYPE || 'mysql';
    let query;

    if (DB_TYPE === 'postgresql') {
        let hasPhoneNumber = false;
        try {
            const colResult = await pool.query(`
                SELECT 1 
                FROM information_schema.columns 
                WHERE table_name = 'users' 
                  AND column_name = 'phone_number'
                LIMIT 1
            `);
            hasPhoneNumber = Array.isArray(colResult.rows) ? colResult.rows.length > 0 : !!colResult.rows;
        } catch (colErr) {
            console.warn('Warning: Failed to check for phone_number column on users table:', colErr.message);
        }

        query = `
            SELECT 
                u.userid AS "userId", 
                u.username, 
                u.email${hasPhoneNumber ? ', u.phone_number AS "phoneNumber"' : ''}, 
                u.firstname AS "firstName", 
                u.lastname AS "lastName", 
                u.id_number AS "idNumber", 
                u.employee_number AS "employeeNumber",
                u.createdat AS "createdAt", 
                u.updatedat AS "updatedAt", 
                u.isactive AS "isActive",
                u.otp_enabled AS "otpEnabled",
                u.roleid AS "roleId", 
                r.name AS role,
                u.ministry, 
                u.state_department AS "stateDepartment", 
                u.agency_id AS "agencyId", 
                a.agency_name AS "agencyName"
            FROM users u
            LEFT JOIN roles r ON u.roleid = r.roleid
            LEFT JOIN agencies a ON u.agency_id = a.id
            WHERE u.voided = false
            ORDER BY u.createdat DESC
        `;
    } else {
        query = `
            SELECT 
                u.userId, 
                u.username, 
                u.email,
                u.firstName, 
                u.lastName, 
                u.idNumber, 
                u.employeeNumber,
                u.createdAt, 
                u.updatedAt, 
                u.isActive,
                IFNULL(u.otpEnabled, 0) AS otpEnabled,
                u.roleId, 
                r.roleName AS role,
                u.ministry, 
                u.state_department AS stateDepartment, 
                u.agency_id AS agencyId, 
                a.agency_name AS agencyName
            FROM users u
            LEFT JOIN roles r ON u.roleId = r.roleId
            LEFT JOIN agencies a ON u.agency_id = a.id
            WHERE u.voided = 0
            ORDER BY u.createdAt DESC
        `;
    }

    const result = await pool.query(query);
    const rows = DB_TYPE === 'postgresql' ? (result.rows || result) : (Array.isArray(result) ? result[0] : result);
    let payload = Array.isArray(rows) ? rows : [];

    if (DB_TYPE === 'postgresql' && payload.length > 0 && (await orgScope.organizationScopeTableExists())) {
        try {
            const scopeMap = await orgScope.fetchOrganizationScopesForUsers(payload.map((u) => u.userId));
            payload = payload.map((u) => ({
                ...u,
                organizationScopes: scopeMap.get(parseInt(String(u.userId), 10)) || [],
            }));
        } catch (scopeErr) {
            console.warn('User list: could not attach organization scopes:', scopeErr.message);
        }
    }

    return payload;
}

// --- CRUD Operations for users ---

/**
 * @route GET /api/users/users
 * @description Get all users from the users table.
 */
router.get('/users', async (req, res) => {
    try {
        const payload = await fetchActiveNonVoidedUsers();
        res.status(200).json(payload);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ message: 'Error fetching users', error: error.message });
    }
});

/**
 * @route GET /api/users/users/export/excel
 * @description Super Admin only: export all active (non-voided) users (no passwords).
 */
router.get('/users/export/excel', async (req, res) => {
    try {
        if (!isSuperAdminRequester(req.user)) {
            return res.status(403).json({ error: 'Only Super Admin can export users.' });
        }
        const payload = await fetchActiveNonVoidedUsers();
        res.status(200).json({ data: payload });
    } catch (error) {
        console.error('Error exporting users:', error);
        res.status(500).json({ message: 'Error exporting users', error: error.message });
    }
});

/**
 * @route GET /api/users/users/check-username
 * @description Super Admin only: check if a username is available.
 */
router.get('/users/check-username', async (req, res) => {
    if (!isSuperAdminRequester(req.user)) {
        return res.status(403).json({ error: 'Only Super Admin can check username availability.' });
    }

    const username = String(req.query.username || '').trim();
    const excludeRaw = req.query.excludeUserId;
    const excludeUserId = excludeRaw !== undefined && excludeRaw !== null && String(excludeRaw).trim() !== ''
        ? Number(excludeRaw)
        : null;

    if (!username) {
        return res.status(400).json({ error: 'username query parameter is required.' });
    }
    if (excludeUserId !== null && Number.isNaN(excludeUserId)) {
        return res.status(400).json({ error: 'excludeUserId must be a valid number when provided.' });
    }

    const DB_TYPE = process.env.DB_TYPE || 'mysql';
    try {
        let rows;
        if (DB_TYPE === 'postgresql') {
            let query = 'SELECT userid FROM users WHERE LOWER(username) = LOWER($1)';
            const params = [username];
            if (excludeUserId !== null) {
                query += ' AND userid <> $2';
                params.push(excludeUserId);
            }
            const result = await pool.query(query, params);
            rows = result.rows || [];
        } else {
            let query = 'SELECT userId FROM users WHERE LOWER(username) = LOWER(?)';
            const params = [username];
            if (excludeUserId !== null) {
                query += ' AND userId <> ?';
                params.push(excludeUserId);
            }
            const result = await pool.query(query, params);
            rows = Array.isArray(result) ? result[0] : result;
        }

        const available = !Array.isArray(rows) || rows.length === 0;
        return res.json({
            available,
            message: available ? 'Username is available.' : 'Username is already taken.',
        });
    } catch (error) {
        console.error('Error checking username availability:', error);
        return res.status(500).json({ error: 'Failed to check username availability.' });
    }
});

/**
 * @route GET /api/users/users/:id
 * @description Get a single user by user_id from the users table.
 */
router.get('/users/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await ensureLoginOtpSchema(pool).catch(() => {});
        const DB_TYPE = process.env.DB_TYPE || 'mysql';
        let query;
        let params;
        
        if (DB_TYPE === 'postgresql') {
            let hasPhoneNumber = false;
            try {
                const colResult = await pool.query(`
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_name = 'users'
                      AND column_name = 'phone_number'
                    LIMIT 1
                `);
                hasPhoneNumber = Array.isArray(colResult.rows) ? colResult.rows.length > 0 : !!colResult.rows;
            } catch (colErr) {
                console.warn('Warning: Failed to check for phone_number column on users table:', colErr.message);
            }
            query = `
                SELECT 
                    u.userid AS "userId", 
                    u.username, 
                    u.email${hasPhoneNumber ? ', u.phone_number AS "phoneNumber"' : ''}, 
                    u.firstname AS "firstName", 
                    u.lastname AS "lastName", 
                    u.id_number AS "idNumber", 
                    u.employee_number AS "employeeNumber",
                    u.createdat AS "createdAt", 
                    u.updatedat AS "updatedAt", 
                    u.isactive AS "isActive",
                    u.otp_enabled AS "otpEnabled",
                    u.roleid AS "roleId", 
                    r.name AS role,
                    u.ministry,
                    u.state_department AS "stateDepartment",
                    u.agency_id AS "agencyId",
                    a.agency_name AS "agencyName"
                FROM users u
                LEFT JOIN roles r ON u.roleid = r.roleid
                LEFT JOIN agencies a ON u.agency_id = a.id
                WHERE u.userid = $1
            `;
            params = [id];
        } else {
            query = `
                SELECT 
                    u.userId, 
                    u.username, 
                    u.email, 
                    u.firstName, 
                    u.lastName, 
                    u.idNumber, 
                    u.employeeNumber,
                    u.createdAt, 
                    u.updatedAt, 
                    u.isActive,
                    IFNULL(u.otpEnabled, 0) AS otpEnabled,
                    u.roleId, 
                    r.roleName AS role,
                    u.ministry,
                    u.state_department AS stateDepartment,
                    u.agency_id AS agencyId,
                    a.agency_name AS agencyName
                FROM users u
                LEFT JOIN roles r ON u.roleId = r.roleId
                LEFT JOIN agencies a ON u.agency_id = a.id
                WHERE u.userId = ?
            `;
            params = [id];
        }
        
        const result = await pool.query(query, params);
        const rows = DB_TYPE === 'postgresql' ? (result.rows || result) : (Array.isArray(result) ? result[0] : result);
        
        if (Array.isArray(rows) ? rows.length > 0 : rows) {
            const userRow = Array.isArray(rows) ? rows[0] : rows;
            let organizationScopes = [];
            if (DB_TYPE === 'postgresql') {
                try {
                    organizationScopes = await orgScope.fetchOrganizationScopesForUser(id);
                } catch (scopeErr) {
                    console.warn('fetchOrganizationScopesForUser:', scopeErr.message);
                }
            }
            res.status(200).json({ ...userRow, organizationScopes });
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ message: 'Error fetching user', error: error.message });
    }
});

/**
 * @route POST /api/users/users
 * @description Create a new user in the users table.
 */
router.post('/users', async (req, res) => {
    const {
        username, email, password, firstName, lastName, roleId, idNumber, employeeNumber,
        ministry, state_department, agency_id, phoneNumber, phone_number, otpEnabled,
        organizationScopes: organizationScopesBody,
        organization_scopes: organization_scopes_snake,
    } = req.body;
    const otpEnabledVal =
        otpEnabled === true ||
        otpEnabled === 1 ||
        otpEnabled === '1' ||
        String(otpEnabled || '').toLowerCase() === 'true';
    const scopesFromBody = organizationScopesBody !== undefined ? organizationScopesBody : organization_scopes_snake;

    if (!username || !email || !password || !firstName || !lastName || !roleId) {
        return res.status(400).json({ error: 'Please enter all required fields: username, email, password, first name, last name, and role ID.' });
    }

    const resolvedPhone = phoneNumber ?? phone_number;
    if (resolvedPhone !== undefined && resolvedPhone !== null && String(resolvedPhone).trim() !== '') {
        const phoneRegex = /^(?:07\d{8}|\+2547\d{8})$/;
        if (!phoneRegex.test(String(resolvedPhone).trim())) {
            return res.status(400).json({ error: 'Invalid phone number format. Use 07XXXXXXXX or +2547XXXXXXXX.' });
        }
    }

    try {
        const DB_TYPE = process.env.DB_TYPE || 'mysql';
        const roleGuard = await enforceRoleAssignmentPermission(req.user, roleId, DB_TYPE);
        if (!roleGuard.ok) {
            return res.status(roleGuard.status).json({ error: roleGuard.error });
        }
        
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

        await ensureLoginOtpSchema(pool).catch(() => {});

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        let insertedUserId;
        if (DB_TYPE === 'postgresql') {
            const insertResult = await pool.query(
                `INSERT INTO users (username, email, passwordhash, firstname, lastname, roleid, id_number, employee_number, ministry, state_department, agency_id, createdat, updatedat, isactive, voided, otp_enabled)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $12, false, $13)
                RETURNING userid`,
                [
                    username,
                    email,
                    passwordHash,
                    firstName,
                    lastName,
                    roleId,
                    idNumber || null,
                    employeeNumber || null,
                    ministry || null,
                    state_department || null,
                    agency_id || null,
                    true,
                    otpEnabledVal,
                ]
            );
            insertedUserId = insertResult.rows[0].userid;
            await setMustChangePassword(insertedUserId, true, 'initial_password');
        } else {
            // MySQL: Use SET syntax (current schema has no phoneNumber column)
            const newUser = {
                username,
                email,
                passwordHash,
                firstName,
                lastName,
                roleId,
                idNumber: idNumber || null,
                employeeNumber: employeeNumber || null,
                ministry: ministry || null,
                state_department: state_department || null,
                agency_id: agency_id || null,
                createdAt: new Date(),
                updatedAt: new Date(),
                isActive: true,
                otpEnabled: otpEnabledVal ? 1 : 0,
            };
            const [result] = await pool.query('INSERT INTO users SET ?', newUser);
            insertedUserId = result.insertId;
        }
        
        // Fetch the created user
        let fetchQuery;
        let fetchParams;
        if (DB_TYPE === 'postgresql') {
                fetchQuery = `
                    SELECT 
                        u.userid AS "userId", 
                        u.username, 
                        u.email, 
                        u.firstname AS "firstName", 
                        u.lastname AS "lastName", 
                        u.id_number AS "idNumber", 
                        u.employee_number AS "employeeNumber",
                        u.roleid AS "roleId", 
                        r.name AS role, 
                        u.createdat AS "createdAt", 
                        u.updatedat AS "updatedAt", 
                        u.isactive AS "isActive",
                        u.otp_enabled AS "otpEnabled",
                        u.ministry, 
                        u.state_department AS "stateDepartment", 
                        u.agency_id AS "agencyId", 
                        a.agency_name AS "agencyName"
                    FROM users u
                    LEFT JOIN roles r ON u.roleid = r.roleid
                    LEFT JOIN agencies a ON u.agency_id = a.id
                    WHERE u.userid = $1
                `;
                fetchParams = [insertedUserId];
            } else {
                fetchQuery = `
                    SELECT 
                        u.userId, 
                        u.username, 
                        u.email, 
                        u.firstName, 
                        u.lastName, 
                        u.idNumber, 
                        u.employeeNumber,
                        u.roleId, 
                        r.roleName AS role, 
                        u.createdAt, 
                        u.updatedAt, 
                        u.isActive,
                        IFNULL(u.otpEnabled, 0) AS otpEnabled,
                        u.ministry, 
                        u.state_department AS stateDepartment, 
                        u.agency_id AS agencyId, 
                        a.agency_name AS agencyName
                    FROM users u
                    LEFT JOIN roles r ON u.roleId = r.roleId
                    LEFT JOIN agencies a ON u.agency_id = a.id
                    WHERE u.userId = ?
                `;
                fetchParams = [insertedUserId];
            }
        
        const fetchResult = await pool.query(fetchQuery, fetchParams);
        const rows = DB_TYPE === 'postgresql' ? fetchResult.rows : (Array.isArray(fetchResult) ? fetchResult[0] : fetchResult);
        const created = Array.isArray(rows) ? rows[0] : rows;

        let emailSent = false;
        if (DB_TYPE === 'postgresql') {
            try {
                const fullName = `${firstName || ''} ${lastName || ''}`.trim();
                await sendInitialCredentialsEmail({
                    email,
                    fullName,
                    username,
                    oneTimePassword: password,
                });
                emailSent = true;
            } catch (mailErr) {
                console.error('Initial account email failed:', mailErr.message);
            }
        }

        if (DB_TYPE === 'postgresql') {
            try {
                if (Array.isArray(scopesFromBody) && scopesFromBody.length > 0) {
                    await orgScope.replaceUserOrganizationScopes(insertedUserId, scopesFromBody);
                } else {
                    await orgScope.syncOrganizationScopesFromUserProfile(insertedUserId, { onlyIfEmpty: true });
                }
            } catch (scopeErr) {
                console.error('Error saving organization scopes for new user:', scopeErr);
            }
            let organizationScopes = [];
            try {
                organizationScopes = await orgScope.fetchOrganizationScopesForUser(insertedUserId);
            } catch (e) {
                console.warn('fetchOrganizationScopesForUser after create:', e.message);
            }
            return res.status(201).json({ ...created, organizationScopes, emailSent });
        }

        res.status(201).json({ ...created, emailSent });
    } catch (error) {
        console.error('Error creating user:', error);
        if (error.code === 'ER_DUP_ENTRY' || error.code === '23505') {
            return res.status(400).json({ error: 'User with that username or email already exists.' });
        }
        res.status(500).json({ message: 'Error creating user', error: error.message });
    }
});

/**
 * @route POST /api/users/users/:id/resend-credentials
 * @description Super Admin only: resend login URL, username and one-time password email.
 */
router.post('/users/:id/resend-credentials', async (req, res) => {
    if (!isSuperAdminRequester(req.user)) {
        return res.status(403).json({ error: 'Only Super Admin can resend credentials.' });
    }
    if (!canSendEmail()) {
        return res.status(503).json({ error: 'Email service is not configured. Please configure SMTP settings first.' });
    }

    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) {
        return res.status(400).json({ error: 'Invalid user ID.' });
    }

    try {
        const DB_TYPE = process.env.DB_TYPE || 'mysql';
        let userRow = null;
        if (DB_TYPE === 'postgresql') {
            const result = await pool.query(
                `SELECT userid, username, email, firstname, lastname
                 FROM users
                 WHERE userid = $1
                   AND COALESCE(voided, false) = false
                 LIMIT 1`,
                [id]
            );
            userRow = result.rows?.[0] || null;
        } else {
            const result = await pool.query(
                `SELECT userId, username, email, firstName, lastName
                 FROM users
                 WHERE userId = ?
                   AND voided = 0
                 LIMIT 1`,
                [id]
            );
            const rows = Array.isArray(result) ? result[0] : result;
            userRow = Array.isArray(rows) ? rows[0] : rows;
        }

        if (!userRow) {
            return res.status(404).json({ error: 'User not found.' });
        }
        if (!userRow.email || String(userRow.email).trim() === '') {
            return res.status(400).json({ error: 'User has no email address on file.' });
        }

        const oneTimePassword = generateOneTimePassword();
        const username = userRow.username;
        const fullName = `${userRow.firstname || userRow.firstName || ''} ${userRow.lastname || userRow.lastName || ''}`.trim();

        await sendInitialCredentialsEmail({
            email: userRow.email,
            fullName,
            username,
            oneTimePassword,
        });

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(oneTimePassword, salt);
        const userId = userRow.userid || userRow.userId;
        if (DB_TYPE === 'postgresql') {
            await pool.query(
                'UPDATE users SET passwordhash = $1, updatedat = CURRENT_TIMESTAMP WHERE userid = $2',
                [passwordHash, userId]
            );
            await setMustChangePassword(userId, true, 'resent_credentials');
        } else {
            await pool.query(
                'UPDATE users SET passwordHash = ?, updatedAt = NOW() WHERE userId = ?',
                [passwordHash, userId]
            );
        }

        return res.status(200).json({
            success: true,
            message: `Credentials email sent to ${userRow.email}.`,
        });
    } catch (error) {
        console.error('Error resending user credentials:', error);
        return res.status(500).json({ error: 'Failed to resend credentials email.', details: error.message });
    }
});

/**
 * @route PUT /api/users/users/:id
 * @description Update an existing user in the users table.
 */
router.put('/users/:id', async (req, res) => {
    const { id } = req.params;
    const {
        password,
        organizationScopes: organizationScopesBody,
        organization_scopes: organization_scopes_snake,
        ...otherFieldsToUpdate
    } = req.body;
    const scopesPayload = organizationScopesBody !== undefined ? organizationScopesBody : organization_scopes_snake;
    const incomingPhone = req.body.phoneNumber ?? req.body.phone_number;
    if (incomingPhone !== undefined && incomingPhone !== null && String(incomingPhone).trim() !== '') {
        const phoneRegex = /^(?:07\d{8}|\+2547\d{8})$/;
        if (!phoneRegex.test(String(incomingPhone).trim())) {
            return res.status(400).json({ error: 'Invalid phone number format. Use 07XXXXXXXX or +2547XXXXXXXX.' });
        }
    }
    const isSuperAdmin = isSuperAdminRequester(req.user);
    const orgProfileFields = ['ministry', 'stateDepartment', 'state_department', 'agencyId', 'agency_id'];
    const attemptedOrgProfileEdit = orgProfileFields.some((f) =>
        Object.prototype.hasOwnProperty.call(otherFieldsToUpdate, f)
    );
    if (attemptedOrgProfileEdit && !isSuperAdmin) {
        return res.status(403).json({
            error: 'Only Super Admin can update a user ministry, state department, or agency.',
        });
    }

    const DB_TYPE = process.env.DB_TYPE || 'mysql';
    const targetEditGuard = await enforceTargetUserEditPermission(req.user, id, DB_TYPE);
    if (!targetEditGuard.ok) {
        return res.status(targetEditGuard.status).json({ error: targetEditGuard.error });
    }

    if (Object.prototype.hasOwnProperty.call(otherFieldsToUpdate, 'roleId')) {
        const roleGuard = await enforceRoleAssignmentPermission(req.user, otherFieldsToUpdate.roleId, DB_TYPE);
        if (!roleGuard.ok) {
            return res.status(roleGuard.status).json({ error: roleGuard.error });
        }
    }
    
    if (password && password.trim() !== '') {
        const salt = await bcrypt.genSalt(10);
        otherFieldsToUpdate.passwordHash = await bcrypt.hash(password, salt);
    }
    delete otherFieldsToUpdate.userId;

    await ensureLoginOtpSchema(pool).catch(() => {});
    if (Object.prototype.hasOwnProperty.call(otherFieldsToUpdate, 'otpEnabled')) {
        const v = otherFieldsToUpdate.otpEnabled;
        otherFieldsToUpdate.otpEnabled = !!(
            v === true ||
            v === 1 ||
            v === '1' ||
            String(v || '').toLowerCase() === 'true'
        );
    }

    const normalizedUsername = otherFieldsToUpdate.username !== undefined
        ? String(otherFieldsToUpdate.username || '').trim()
        : null;
    const normalizedEmail = otherFieldsToUpdate.email !== undefined
        ? String(otherFieldsToUpdate.email || '').trim()
        : null;

    let previousIsActive = null;
    if (DB_TYPE === 'postgresql') {
        try {
            const prevActiveRes = await pool.query('SELECT isactive FROM users WHERE userid = $1', [id]);
            if (prevActiveRes.rows?.length) {
                previousIsActive = prevActiveRes.rows[0].isactive === true;
            }
        } catch (preErr) {
            console.warn('Could not read previous isActive for user', id, preErr.message);
        }
    }

    try {
        if (normalizedUsername !== null || normalizedEmail !== null) {
            if (DB_TYPE === 'postgresql') {
                const checks = [];
                const params = [];
                let idx = 1;
                if (normalizedUsername !== null && normalizedUsername !== '') {
                    checks.push(`LOWER(username) = LOWER($${idx++})`);
                    params.push(normalizedUsername);
                }
                if (normalizedEmail !== null && normalizedEmail !== '') {
                    checks.push(`LOWER(email) = LOWER($${idx++})`);
                    params.push(normalizedEmail);
                }
                if (checks.length > 0) {
                    params.push(id);
                    const exists = await pool.query(
                        `SELECT userid FROM users WHERE (${checks.join(' OR ')}) AND userid <> $${idx} LIMIT 1`,
                        params
                    );
                    if (exists.rows?.length) {
                        return res.status(400).json({ error: 'Another user with that username or email already exists.' });
                    }
                }
            } else {
                const checks = [];
                const params = [];
                if (normalizedUsername !== null && normalizedUsername !== '') {
                    checks.push('LOWER(username) = LOWER(?)');
                    params.push(normalizedUsername);
                }
                if (normalizedEmail !== null && normalizedEmail !== '') {
                    checks.push('LOWER(email) = LOWER(?)');
                    params.push(normalizedEmail);
                }
                if (checks.length > 0) {
                    params.push(id);
                    const existsRes = await pool.query(
                        `SELECT userId FROM users WHERE (${checks.join(' OR ')}) AND userId <> ? LIMIT 1`,
                        params
                    );
                    const rows = Array.isArray(existsRes) ? existsRes[0] : existsRes;
                    if (Array.isArray(rows) && rows.length > 0) {
                        return res.status(400).json({ error: 'Another user with that username or email already exists.' });
                    }
                }
            }
        }

        let result;
        if (DB_TYPE === 'postgresql') {
            // PostgreSQL: Build UPDATE query dynamically
            const updateFields = [];
            const values = [];
            let paramIndex = 1;
            
            // Map camelCase to snake_case for PostgreSQL
            const fieldMap = {
                username: 'username',
                email: 'email',
                passwordHash: 'passwordhash',
                firstName: 'firstname',
                lastName: 'lastname',
                idNumber: 'id_number',
                employeeNumber: 'employee_number',
                roleId: 'roleid',
                isActive: 'isactive',
                ministry: 'ministry',
                stateDepartment: 'state_department',
                state_department: 'state_department',
                agencyId: 'agency_id',
                agency_id: 'agency_id',
                phoneNumber: 'phone_number',
                otpEnabled: 'otp_enabled',
            };

            for (const [key, value] of Object.entries(otherFieldsToUpdate)) {
                const dbField = fieldMap[key] || key.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
                updateFields.push(`${dbField} = $${paramIndex}`);
                values.push(value);
                paramIndex++;
            }
            
            // Always update updatedat
            updateFields.push(`updatedat = CURRENT_TIMESTAMP`);
            values.push(id); // For WHERE clause
            
            const updateQuery = `UPDATE users SET ${updateFields.join(', ')} WHERE userid = $${paramIndex}`;
            result = await pool.query(updateQuery, values);
        } else {
            // MySQL: Use SET syntax
            const fieldsToUpdate = { ...otherFieldsToUpdate, updatedAt: new Date() };
            // Current MySQL schema does not include phoneNumber, so drop it to avoid SQL errors
            delete fieldsToUpdate.phoneNumber;
            if (Object.prototype.hasOwnProperty.call(fieldsToUpdate, 'otpEnabled')) {
                fieldsToUpdate.otpEnabled = fieldsToUpdate.otpEnabled ? 1 : 0;
            }
            const [mysqlResult] = await pool.query('UPDATE users SET ? WHERE userId = ?', [fieldsToUpdate, id]);
            result = mysqlResult;
        }
        
        const affectedRows = DB_TYPE === 'postgresql' ? result.rowCount : result.affectedRows;
        
        if (affectedRows > 0) {
            // Fetch updated user
            let fetchQuery;
            let fetchParams;
            if (DB_TYPE === 'postgresql') {
                let hasPhoneNumber = false;
                try {
                    const colResult = await pool.query(`
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_name = 'users'
                          AND column_name = 'phone_number'
                        LIMIT 1
                    `);
                    hasPhoneNumber = Array.isArray(colResult.rows) ? colResult.rows.length > 0 : !!colResult.rows;
                } catch (colErr) {
                    console.warn('Warning: Failed to check for phone_number column on users table:', colErr.message);
                }
                fetchQuery = `
                    SELECT 
                        u.userid AS "userId", u.username, u.email${hasPhoneNumber ? ', u.phone_number AS "phoneNumber"' : ''}, u.firstname AS "firstName", u.lastname AS "lastName", 
                        u.id_number AS "idNumber", u.employee_number AS "employeeNumber",
                        u.roleid AS "roleId", r.name AS role, u.createdat AS "createdAt", u.updatedat AS "updatedAt", u.isactive AS "isActive",
                        u.otp_enabled AS "otpEnabled",
                        u.ministry, u.state_department AS "stateDepartment", u.agency_id AS "agencyId", a.agency_name AS "agencyName"
                    FROM users u
                    LEFT JOIN roles r ON u.roleid = r.roleid
                    LEFT JOIN agencies a ON u.agency_id = a.id
                    WHERE u.userid = $1
                `;
                fetchParams = [id];
            } else {
                fetchQuery = `
                    SELECT 
                        u.userId, u.username, u.email, u.firstName, u.lastName, u.idNumber, u.employeeNumber,
                        u.roleId, r.roleName AS role, u.createdAt, u.updatedAt, u.isActive,
                        IFNULL(u.otpEnabled, 0) AS otpEnabled,
                        u.ministry, u.state_department AS stateDepartment, u.agency_id AS agencyId, a.agency_name AS agencyName
                    FROM users u
                    LEFT JOIN roles r ON u.roleId = r.roleId
                    LEFT JOIN agencies a ON u.agency_id = a.id
                    WHERE u.userId = ?
                `;
                fetchParams = [id];
            }
            
            const fetchResult = await pool.query(fetchQuery, fetchParams);
            const rows = DB_TYPE === 'postgresql' ? fetchResult.rows : (Array.isArray(fetchResult) ? fetchResult[0] : fetchResult);
            const userObj = Array.isArray(rows) ? rows[0] : rows;

            if (DB_TYPE === 'postgresql' && scopesPayload !== undefined) {
                try {
                    await orgScope.replaceUserOrganizationScopes(id, Array.isArray(scopesPayload) ? scopesPayload : []);
                } catch (scopeErr) {
                    console.error('Error updating organization scopes:', scopeErr);
                }
            }

            // Self-service registration stores ministry / agency on `users` while pending; scopes are not
            // created until activation. The UI always sends organizationScopes (often []), so we cannot
            // rely on scopesPayload === undefined. After update, if user just became active and still
            // has no scope rows, seed from profile (admins can add more later in User Management).
            const becameActive =
                DB_TYPE === 'postgresql'
                && previousIsActive === false
                && userObj.isActive === true;
            if (becameActive) {
                try {
                    let scopesNow = await orgScope.fetchOrganizationScopesForUser(id);
                    if (!scopesNow.length) {
                        await orgScope.syncOrganizationScopesFromUserProfile(id, { onlyIfEmpty: true });
                    }
                } catch (scopeErr) {
                    console.warn('syncOrganizationScopesFromUserProfile (user activation):', scopeErr.message);
                }
            }

            let organizationScopes = [];
            if (DB_TYPE === 'postgresql') {
                try {
                    organizationScopes = await orgScope.fetchOrganizationScopesForUser(id);
                } catch (e) {
                    console.warn('fetchOrganizationScopesForUser after update:', e.message);
                }
            }

            res.status(200).json({ ...userObj, organizationScopes });
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ message: 'Error updating user', error: error.message });
    }
});

/**
 * @route DELETE /api/users/users/:id
 * @description Soft delete a user by setting voided = 1.
 */
router.delete('/users/:id', async (req, res) => {
    if (!isSuperAdminRequester(req.user)) {
        return res.status(403).json({ error: 'Only Super Admin can delete users.' });
    }

    const { id } = req.params;
    try {
        const DB_TYPE = process.env.DB_TYPE || 'mysql';
        let query;
        let params;
        
        if (DB_TYPE === 'postgresql') {
            query = 'UPDATE users SET voided = true, updatedat = CURRENT_TIMESTAMP WHERE userid = $1 AND voided = false';
            params = [id];
        } else {
            query = 'UPDATE users SET voided = 1, updatedAt = CURRENT_TIMESTAMP WHERE userId = ? AND voided = 0';
            params = [id];
        }
        
        const result = await pool.query(query, params);
        const affectedRows = DB_TYPE === 'postgresql' ? result.rowCount : result.affectedRows;
        
        if (affectedRows > 0) {
            res.status(200).json({ message: 'User deleted successfully' });
        } else {
            res.status(404).json({ message: 'User not found or already deleted' });
        }
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ message: 'Error deleting user', error: error.message });
    }
});

/**
 * @route GET /api/users/users/voided/list
 * @description Get all voided users (Super Admin only).
 */
router.get('/users/voided/list', async (req, res) => {
    try {
        if (!isSuperAdminRequester(req.user)) {
            return res.status(403).json({ error: 'Only Super Admin can view voided users.' });
        }

        const DB_TYPE = process.env.DB_TYPE || 'mysql';
        let query;
        if (DB_TYPE === 'postgresql') {
            query = `
                SELECT 
                    u.userid AS "userId",
                    u.username,
                    u.email,
                    u.firstname AS "firstName",
                    u.lastname AS "lastName",
                    u.id_number AS "idNumber",
                    u.employee_number AS "employeeNumber",
                    u.createdat AS "createdAt",
                    u.updatedat AS "updatedAt",
                    u.isactive AS "isActive",
                    u.roleid AS "roleId",
                    r.name AS role,
                    u.ministry,
                    u.state_department AS "stateDepartment",
                    u.agency_id AS "agencyId",
                    a.agency_name AS "agencyName"
                FROM users u
                LEFT JOIN roles r ON u.roleid = r.roleid
                LEFT JOIN agencies a ON u.agency_id = a.id
                WHERE u.voided = true
                ORDER BY u.updatedat DESC
            `;
        } else {
            query = `
                SELECT
                    u.userId,
                    u.username,
                    u.email,
                    u.firstName,
                    u.lastName,
                    u.idNumber,
                    u.employeeNumber,
                    u.createdAt,
                    u.updatedAt,
                    u.isActive,
                    u.roleId,
                    r.roleName AS role,
                    u.ministry,
                    u.state_department AS stateDepartment,
                    u.agency_id AS agencyId,
                    a.agency_name AS agencyName
                FROM users u
                LEFT JOIN roles r ON u.roleId = r.roleId
                LEFT JOIN agencies a ON u.agency_id = a.id
                WHERE u.voided = 1
                ORDER BY u.updatedAt DESC
            `;
        }

        const result = await pool.query(query);
        const rows = DB_TYPE === 'postgresql' ? (result.rows || result) : (Array.isArray(result) ? result[0] : result);
        return res.status(200).json(Array.isArray(rows) ? rows : []);
    } catch (error) {
        console.error('Error fetching voided users:', error);
        return res.status(500).json({ message: 'Error fetching voided users', error: error.message });
    }
});

/**
 * @route PUT /api/users/users/:id/restore
 * @description Restore a voided user by setting voided = 0/false (Super Admin only).
 */
router.put('/users/:id/restore', async (req, res) => {
    const { id } = req.params;
    try {
        if (!isSuperAdminRequester(req.user)) {
            return res.status(403).json({ error: 'Only Super Admin can restore voided users.' });
        }

        const DB_TYPE = process.env.DB_TYPE || 'mysql';
        let query;
        let params;
        if (DB_TYPE === 'postgresql') {
            query = 'UPDATE users SET voided = false, updatedat = CURRENT_TIMESTAMP WHERE userid = $1 AND voided = true';
            params = [id];
        } else {
            query = 'UPDATE users SET voided = 0, updatedAt = CURRENT_TIMESTAMP WHERE userId = ? AND voided = 1';
            params = [id];
        }

        const result = await pool.query(query, params);
        const affectedRows = DB_TYPE === 'postgresql' ? result.rowCount : result.affectedRows;
        if (!affectedRows) {
            return res.status(404).json({ message: 'Voided user not found.' });
        }
        return res.status(200).json({ message: 'User restored successfully.' });
    } catch (error) {
        console.error('Error restoring voided user:', error);
        return res.status(500).json({ message: 'Error restoring voided user', error: error.message });
    }
});

// --- CRUD Operations for roles ---

/**
 * @route GET /api/users/roles
 * @description Get all roles from the roles table.
 */
router.get('/roles', async (req, res) => {
    try {
        const DB_TYPE = process.env.DB_TYPE || 'mysql';
        let query;
        
        if (DB_TYPE === 'postgresql') {
            query = 'SELECT roleid AS "roleId", name AS "roleName", description, createdat AS "createdAt", updatedat AS "updatedAt", voided FROM roles WHERE voided = false ORDER BY name';
        } else {
            query = 'SELECT * FROM roles WHERE voided = 0 ORDER BY roleName';
        }
        
        const result = await pool.query(query);
        const rows = DB_TYPE === 'postgresql' ? (result.rows || result) : (Array.isArray(result) ? result[0] : result);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching roles:', error);
        res.status(500).json({ message: 'Error fetching roles', error: error.message });
    }
});

/**
 * @route GET /api/users/roles/:id
 * @description Get a single role by role_id from the roles table.
 */
router.get('/roles/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const DB_TYPE = process.env.DB_TYPE || 'mysql';
        let query;
        let params;
        
        if (DB_TYPE === 'postgresql') {
            query = 'SELECT roleid AS "roleId", name AS "roleName", description, createdat AS "createdAt", updatedat AS "updatedAt", voided FROM roles WHERE roleid = $1';
            params = [id];
        } else {
            query = 'SELECT * FROM roles WHERE roleId = ?';
            params = [id];
        }
        
        const result = await pool.query(query, params);
        const rows = DB_TYPE === 'postgresql' ? (result.rows || result) : (Array.isArray(result) ? result[0] : result);
        
        if (Array.isArray(rows) ? rows.length > 0 : rows) {
            res.status(200).json(Array.isArray(rows) ? rows[0] : rows);
        } else {
            res.status(404).json({ message: 'Role not found' });
        }
    } catch (error) {
        console.error('Error fetching role:', error);
        res.status(500).json({ message: 'Error fetching role', error: error.message });
    }
});

/**
 * @route POST /api/users/roles
 * @description Create a new role in the roles table.
 */
router.post('/roles', async (req, res) => {
    if (!isSuperAdminRequester(req.user)) {
        return res.status(403).json({ error: 'Only Super Admin can create roles.' });
    }

    const { roleName, name, description } = req.body;
    const roleNameValue = roleName || name; // Support both field names

    if (!roleNameValue) {
        return res.status(400).json({ error: 'Role name is required' });
    }

    try {
        const DB_TYPE = process.env.DB_TYPE || 'mysql';
        let insertedRoleId;
        
        if (DB_TYPE === 'postgresql') {
            const insertSql = 'INSERT INTO roles (name, description, createdat, updatedat, voided) VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, false) RETURNING roleid';
            const insertParams = [roleNameValue, description || null];
            try {
                const insertResult = await pool.query(insertSql, insertParams);
                insertedRoleId = insertResult.rows[0].roleid;
            } catch (pgInsertError) {
                const detail = String(pgInsertError.detail || pgInsertError.message || '').toLowerCase();
                const isRoleIdDuplicate =
                    pgInsertError.code === '23505' &&
                    (/roleid\)=\(\d+\)\s+already exists/i.test(String(pgInsertError.detail || '')) ||
                        (detail.includes('roleid') && detail.includes('already exists')));

                if (!isRoleIdDuplicate) {
                    throw pgInsertError;
                }

                // Auto-heal roles.roleid sequence drift, then retry once.
                await pool.query(`
                    SELECT setval(
                        pg_get_serial_sequence('roles', 'roleid'),
                        COALESCE((SELECT MAX(roleid) FROM roles), 1),
                        true
                    )
                `);

                const retryInsertResult = await pool.query(insertSql, insertParams);
                insertedRoleId = retryInsertResult.rows[0].roleid;
            }
        } else {
            const newRole = {
                roleName: roleNameValue,
                description: description || null,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            const [result] = await pool.query('INSERT INTO roles SET ?', newRole);
            insertedRoleId = result.insertId;
        }
        
        // Fetch the created role
        let fetchQuery;
        let fetchParams;
        if (DB_TYPE === 'postgresql') {
            fetchQuery = 'SELECT roleid AS "roleId", name AS "roleName", description, createdat AS "createdAt", updatedat AS "updatedAt", voided FROM roles WHERE roleid = $1';
            fetchParams = [insertedRoleId];
        } else {
            fetchQuery = 'SELECT * FROM roles WHERE roleId = ?';
            fetchParams = [insertedRoleId];
        }
        
        const fetchResult = await pool.query(fetchQuery, fetchParams);
        const rows = DB_TYPE === 'postgresql' ? fetchResult.rows : (Array.isArray(fetchResult) ? fetchResult[0] : fetchResult);
        const createdRole = Array.isArray(rows) ? rows[0] : rows;
        
        if (!createdRole) {
            return res.status(500).json({ message: 'Error creating role', error: 'Failed to fetch created role' });
        }
        
        res.status(201).json(createdRole);
    } catch (error) {
        console.error('Error creating role:', error);
        if (error.code === 'ER_DUP_ENTRY' || error.code === '23505') {
            const detail = String(error.detail || error.message || '').toLowerCase();
            const isRoleIdDuplicate =
                /roleid\)=\(\d+\)\s+already exists/i.test(String(error.detail || '')) ||
                (detail.includes('roleid') && detail.includes('already exists'));
            return res.status(400).json({
                error: isRoleIdDuplicate
                    ? 'Role ID sequence is out of sync with the table (duplicate primary key).'
                    : 'Role with that name already exists.',
                code: isRoleIdDuplicate ? 'ROLE_ID_SEQUENCE_OUT_OF_SYNC' : 'ROLE_NAME_DUPLICATE',
                detail: error.detail || undefined,
            });
        }
        res.status(500).json({ message: 'Error creating role', error: error.message });
    }
});

/**
 * @route PUT /api/users/roles/:id
 * @description Update an existing role in the roles table.
 */
router.put('/roles/:id', async (req, res) => {
    const { id } = req.params;
    const { roleName, name, description } = req.body;
    const roleNameValue = roleName || name; // Support both field names

    try {
        const DB_TYPE = process.env.DB_TYPE || 'mysql';
        let result;
        
        if (DB_TYPE === 'postgresql') {
            const updateFields = [];
            const values = [];
            let paramIndex = 1;
            
            if (roleNameValue !== undefined) {
                updateFields.push(`name = $${paramIndex}`);
                values.push(roleNameValue);
                paramIndex++;
            }
            if (description !== undefined) {
                updateFields.push(`description = $${paramIndex}`);
                values.push(description);
                paramIndex++;
            }
            
            updateFields.push(`updatedat = CURRENT_TIMESTAMP`);
            values.push(id); // For WHERE clause
            
            const updateQuery = `UPDATE roles SET ${updateFields.join(', ')} WHERE roleid = $${paramIndex}`;
            result = await pool.query(updateQuery, values);
        } else {
            const fieldsToUpdate = { ...req.body, updatedAt: new Date() };
            delete fieldsToUpdate.roleId;
            const [mysqlResult] = await pool.query('UPDATE roles SET ? WHERE roleId = ?', [fieldsToUpdate, id]);
            result = mysqlResult;
        }
        
        const affectedRows = DB_TYPE === 'postgresql' ? result.rowCount : result.affectedRows;
        
        if (affectedRows > 0) {
            // Fetch updated role
            let fetchQuery;
            let fetchParams;
            if (DB_TYPE === 'postgresql') {
                fetchQuery = 'SELECT roleid AS "roleId", name AS "roleName", description, createdat AS "createdAt", updatedat AS "updatedAt", voided FROM roles WHERE roleid = $1';
                fetchParams = [id];
            } else {
                fetchQuery = 'SELECT * FROM roles WHERE roleId = ?';
                fetchParams = [id];
            }
            
            const fetchResult = await pool.query(fetchQuery, fetchParams);
            const rows = DB_TYPE === 'postgresql' ? fetchResult.rows : (Array.isArray(fetchResult) ? fetchResult[0] : fetchResult);
            res.status(200).json(Array.isArray(rows) ? rows[0] : rows);
        } else {
            res.status(404).json({ message: 'Role not found' });
        }
    } catch (error) {
        console.error('Error updating role:', error);
        res.status(500).json({ message: 'Error updating role', error: error.message });
    }
});

/**
 * @route DELETE /api/users/roles/:id
 * @description Delete a role from the roles table.
 */
router.delete('/roles/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const DB_TYPE = process.env.DB_TYPE || 'mysql';
        let query;
        let params;
        
        if (DB_TYPE === 'postgresql') {
            // Soft delete by setting voided = true
            query = 'UPDATE roles SET voided = true, updatedat = CURRENT_TIMESTAMP WHERE roleid = $1 AND voided = false';
            params = [id];
        } else {
            query = 'DELETE FROM roles WHERE roleId = ?';
            params = [id];
        }
        
        const result = await pool.query(query, params);
        const affectedRows = DB_TYPE === 'postgresql' ? result.rowCount : result.affectedRows;
        
        if (affectedRows > 0) {
            res.status(204).send();
        } else {
            res.status(404).json({ message: 'Role not found' });
        }
    } catch (error) {
        console.error('Error deleting role:', error);
        res.status(500).json({ message: 'Error deleting role', error: error.message });
    }
});

// --- CRUD Operations for privileges ---

/**
 * @route GET /api/users/privileges
 * @description Get all privileges from the privileges table.
 */
router.get('/privileges', async (req, res) => {
    try {
        const DB_TYPE = process.env.DB_TYPE || 'mysql';
        let query;
        
        if (DB_TYPE === 'postgresql') {
            query = 'SELECT privilegeid AS "privilegeId", privilegename AS "privilegeName", description, createdat AS "createdAt", updatedat AS "updatedAt", voided FROM privileges WHERE voided = false ORDER BY privilegename';
        } else {
            query = 'SELECT * FROM privileges WHERE voided = 0 ORDER BY privilegeName';
        }
        
        const result = await pool.query(query);
        const rows = DB_TYPE === 'postgresql' ? (result.rows || result) : (Array.isArray(result) ? result[0] : result);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching privileges:', error);
        res.status(500).json({ message: 'Error fetching privileges', error: error.message });
    }
});

/**
 * @route GET /api/users/privileges/:id
 * @description Get a single privilege by privilege_id from the privileges table.
 */
router.get('/privileges/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const DB_TYPE = process.env.DB_TYPE || 'mysql';
        let query;
        let params;
        
        if (DB_TYPE === 'postgresql') {
            query = 'SELECT privilegeid AS "privilegeId", privilegename AS "privilegeName", description, createdat AS "createdAt", updatedat AS "updatedAt", voided FROM privileges WHERE privilegeid = $1';
            params = [id];
        } else {
            query = 'SELECT * FROM privileges WHERE privilegeId = ?';
            params = [id];
        }
        
        const result = await pool.query(query, params);
        const rows = DB_TYPE === 'postgresql' ? (result.rows || result) : (Array.isArray(result) ? result[0] : result);
        
        if (Array.isArray(rows) ? rows.length > 0 : rows) {
            res.status(200).json(Array.isArray(rows) ? rows[0] : rows);
        } else {
            res.status(404).json({ message: 'Privilege not found' });
        }
    } catch (error) {
        console.error('Error fetching privilege:', error);
        res.status(500).json({ message: 'Error fetching privilege', error: error.message });
    }
});

/**
 * @route POST /api/users/privileges
 * @description Create a new privilege in the privileges table.
 */
router.post('/privileges', async (req, res) => {
    if (!isSuperAdminRequester(req.user)) {
        return res.status(403).json({ error: 'Only Super Admin can create privileges.' });
    }

    // Normalize body (express may deliver object, or nested/odd shapes from proxies)
    let body = req.body;
    if (body == null) {
        body = {};
    } else if (typeof body === 'string') {
        try {
            body = JSON.parse(body);
        } catch (e) {
            return res.status(400).json({
                error: 'Invalid JSON body',
                hint: 'Send a JSON object: { "privilegeName": "…", "description": "…" }',
            });
        }
    }
    if (typeof body !== 'object' || Array.isArray(body)) {
        return res.status(400).json({
            error: 'Request body must be a JSON object with privilegeName',
            hint: 'Example: { "privilegeName": "project.read", "description": "..." }',
        });
    }

    const rawName =
        body.privilegeName ??
        body.privilege_name ??
        body.name ??
        body.PrivilegeName ??
        body.privilegename;
    let privilegeName = '';
    if (rawName != null && typeof rawName !== 'object') {
        privilegeName = String(rawName).trim();
    }
    const descRaw = body.description ?? body.desc;
    const description =
        descRaw != null && typeof descRaw !== 'object'
            ? String(descRaw).trim()
            : '';

    if (!privilegeName) {
        console.error('Privilege creation failed: missing privilegeName');
        console.error('Content-Type:', req.headers['content-type'], 'body keys:', Object.keys(body));
        return res.status(400).json({
            error: 'Privilege name is required',
            hint: 'Include "privilegeName" in the JSON body (e.g. project.read_all).',
            receivedKeys: Object.keys(body),
        });
    }

    try {
        const DB_TYPE = process.env.DB_TYPE || 'mysql';
        let insertedPrivilegeId;
        
        if (DB_TYPE === 'postgresql') {
            const insertResult = await pool.query(
                'INSERT INTO privileges (privilegename, description, createdat, updatedat, voided) VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, false) RETURNING privilegeid',
                [privilegeName, description !== '' ? description : null]
            );
            const retRow = insertResult.rows && insertResult.rows[0];
            insertedPrivilegeId = retRow && (retRow.privilegeid ?? retRow.privilegeId);
            if (insertedPrivilegeId == null) {
                console.error('Privilege INSERT RETURNING missing id:', insertResult.rows);
                return res.status(500).json({ message: 'Error creating privilege', error: 'Insert succeeded but no id returned' });
            }
        } else {
            const newPrivilege = {
                privilegeName,
                description: description || null,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            const [result] = await pool.query('INSERT INTO privileges SET ?', newPrivilege);
            insertedPrivilegeId = result.insertId;
        }
        
        // Fetch the created privilege
        let fetchQuery;
        let fetchParams;
        if (DB_TYPE === 'postgresql') {
            fetchQuery = 'SELECT privilegeid AS "privilegeId", privilegename AS "privilegeName", description, createdat AS "createdAt", updatedat AS "updatedAt", voided FROM privileges WHERE privilegeid = $1';
            fetchParams = [insertedPrivilegeId];
        } else {
            fetchQuery = 'SELECT * FROM privileges WHERE privilegeId = ?';
            fetchParams = [insertedPrivilegeId];
        }
        
        const fetchResult = await pool.query(fetchQuery, fetchParams);
        let createdPrivilege;
        if (DB_TYPE === 'postgresql') {
            // For PostgreSQL, fetchResult.rows is an array
            createdPrivilege = fetchResult.rows && fetchResult.rows.length > 0 ? fetchResult.rows[0] : null;
        } else {
            // For MySQL, result is [rows, fields]
            const rows = Array.isArray(fetchResult) ? fetchResult[0] : fetchResult;
            createdPrivilege = Array.isArray(rows) ? (rows.length > 0 ? rows[0] : null) : rows;
        }
        
        if (!createdPrivilege) {
            return res.status(500).json({ message: 'Error creating privilege', error: 'Failed to fetch created privilege' });
        }
        
        res.status(201).json(createdPrivilege);
    } catch (error) {
        console.error('Error creating privilege:', error);
        if (error.code === 'ER_DUP_ENTRY' || error.code === '23505') {
            const detail = error.detail || error.message || '';
            const isPkSequenceOutOfSync =
                /privilegeid\)=\(\d+\)\s+already exists/i.test(detail) ||
                (detail.includes('privilegeid') && detail.includes('already exists'));
            return res.status(400).json({
                error: isPkSequenceOutOfSync
                    ? 'Privilege ID sequence is out of sync with the table (duplicate primary key).'
                    : 'Privilege with that name already exists (or duplicate key).',
                detail,
                ...(isPkSequenceOutOfSync && {
                    hint: 'Run: scripts/migration/fix-privileges-privilegeid-sequence.sql (sets privileges_privilegeid_seq to MAX(privilegeid)).',
                }),
            });
        }
        res.status(500).json({ message: 'Error creating privilege', error: error.message });
    }
});

/**
 * @route PUT /api/users/privileges/:id
 * @description Update an existing privilege in the privileges table.
 */
router.put('/privileges/:id', async (req, res) => {
    const { id } = req.params;
    const { privilegeName, description } = req.body;

    try {
        const DB_TYPE = process.env.DB_TYPE || 'mysql';
        let result;
        
        if (DB_TYPE === 'postgresql') {
            const updateFields = [];
            const values = [];
            let paramIndex = 1;
            
            if (privilegeName !== undefined) {
                updateFields.push(`privilegename = $${paramIndex}`);
                values.push(privilegeName);
                paramIndex++;
            }
            if (description !== undefined) {
                updateFields.push(`description = $${paramIndex}`);
                values.push(description);
                paramIndex++;
            }
            
            updateFields.push(`updatedat = CURRENT_TIMESTAMP`);
            values.push(id); // For WHERE clause
            
            const updateQuery = `UPDATE privileges SET ${updateFields.join(', ')} WHERE privilegeid = $${paramIndex}`;
            result = await pool.query(updateQuery, values);
        } else {
            const fieldsToUpdate = { ...req.body, updatedAt: new Date() };
            delete fieldsToUpdate.privilegeId;
            const [mysqlResult] = await pool.query('UPDATE privileges SET ? WHERE privilegeId = ?', [fieldsToUpdate, id]);
            result = mysqlResult;
        }
        
        const affectedRows = DB_TYPE === 'postgresql' ? result.rowCount : result.affectedRows;
        
        if (affectedRows > 0) {
            // Fetch updated privilege
            let fetchQuery;
            let fetchParams;
            if (DB_TYPE === 'postgresql') {
                fetchQuery = 'SELECT privilegeid AS "privilegeId", privilegename AS "privilegeName", description, createdat AS "createdAt", updatedat AS "updatedAt", voided FROM privileges WHERE privilegeid = $1';
                fetchParams = [id];
            } else {
                fetchQuery = 'SELECT * FROM privileges WHERE privilegeId = ?';
                fetchParams = [id];
            }
            
            const fetchResult = await pool.query(fetchQuery, fetchParams);
            const rows = DB_TYPE === 'postgresql' ? fetchResult.rows : (Array.isArray(fetchResult) ? fetchResult[0] : fetchResult);
            res.status(200).json(Array.isArray(rows) ? rows[0] : rows);
        } else {
            res.status(404).json({ message: 'Privilege not found' });
        }
    } catch (error) {
        console.error('Error updating privilege:', error);
        res.status(500).json({ message: 'Error updating privilege', error: error.message });
    }
});

/**
 * @route DELETE /api/users/privileges/:id
 * @description Delete a privilege from the privileges table.
 */
router.delete('/privileges/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const DB_TYPE = process.env.DB_TYPE || 'mysql';
        let query;
        let params;
        
        if (DB_TYPE === 'postgresql') {
            // Soft delete by setting voided = true
            query = 'UPDATE privileges SET voided = true, updatedat = CURRENT_TIMESTAMP WHERE privilegeid = $1 AND voided = false';
            params = [id];
        } else {
            query = 'DELETE FROM privileges WHERE privilegeId = ?';
            params = [id];
        }
        
        const result = await pool.query(query, params);
        const affectedRows = DB_TYPE === 'postgresql' ? result.rowCount : result.affectedRows;
        
        if (affectedRows > 0) {
            res.status(204).send();
        } else {
            res.status(404).json({ message: 'Privilege not found' });
        }
    } catch (error) {
        console.error('Error deleting privilege:', error);
        res.status(500).json({ message: 'Error deleting privilege', error: error.message });
    }
});

// --- CRUD Operations for role_privileges ---

/**
 * @route GET /api/users/role_privileges
 * @description Get all role privileges from the role_privileges table.
 * @query roleId - Optional: Filter by roleId
 * @query privilegeId - Optional: Filter by privilegeId
 */
router.get('/role_privileges', async (req, res) => {
    const { roleId, privilegeId } = req.query;
    const DB_TYPE = process.env.DB_TYPE || 'mysql';
    
    try {
        let query;
        let params = [];
        let paramIndex = 1;
        const conditions = [];

        if (DB_TYPE === 'postgresql') {
            if (roleId) {
                conditions.push(`roleid = $${paramIndex}`);
                params.push(roleId);
                paramIndex++;
            }
            if (privilegeId) {
                conditions.push(`privilegeid = $${paramIndex}`);
                params.push(privilegeId);
                paramIndex++;
            }
            
            let whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')} AND voided = false` : 'WHERE voided = false';
            query = `SELECT roleprivilegeid AS "rolePrivilegeId", roleid AS "roleId", privilegeid AS "privilegeId", createdat AS "createdAt", updatedat AS "updatedAt", voided FROM role_privileges ${whereClause}`;
        } else {
            if (roleId) {
                conditions.push('roleId = ?');
                params.push(roleId);
            }
            if (privilegeId) {
                conditions.push('privilegeId = ?');
                params.push(privilegeId);
            }
            
            let whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')} AND voided = 0` : 'WHERE voided = 0';
            query = `SELECT * FROM role_privileges ${whereClause}`;
        }

        const result = await pool.query(query, params);
        const rows = DB_TYPE === 'postgresql' ? (result.rows || result) : (Array.isArray(result) ? result[0] : result);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching role privileges:', error);
        res.status(500).json({ message: 'Error fetching role privileges', error: error.message });
    }
});

/**
 * @route GET /api/users/role_privileges/:roleId/:privilegeId
 * @description Get a single role privilege by role_id and privilege_id from the role_privileges table.
 */
router.get('/role_privileges/:roleId/:privilegeId', async (req, res) => {
    const { roleId, privilegeId } = req.params;
    try {
        const DB_TYPE = process.env.DB_TYPE || 'mysql';
        let query;
        let params;
        
        if (DB_TYPE === 'postgresql') {
            query = 'SELECT roleprivilegeid AS "rolePrivilegeId", roleid AS "roleId", privilegeid AS "privilegeId", createdat AS "createdAt", updatedat AS "updatedAt", voided FROM role_privileges WHERE roleid = $1 AND privilegeid = $2 AND voided = false';
            params = [roleId, privilegeId];
        } else {
            query = 'SELECT * FROM role_privileges WHERE roleId = ? AND privilegeId = ? AND voided = 0';
            params = [roleId, privilegeId];
        }
        
        const result = await pool.query(query, params);
        const rows = DB_TYPE === 'postgresql' ? (result.rows || result) : (Array.isArray(result) ? result[0] : result);
        
        if (Array.isArray(rows) ? rows.length > 0 : rows) {
            res.status(200).json(Array.isArray(rows) ? rows[0] : rows);
        } else {
            res.status(404).json({ message: 'Role privilege not found' });
        }
    } catch (error) {
        console.error('Error fetching role privilege:', error);
        res.status(500).json({ message: 'Error fetching role privilege', error: error.message });
    }
});

/**
 * @route POST /api/users/role_privileges
 * @description Create a new role privilege assignment in the role_privileges table.
 * @body {number} roleId - The ID of the role.
 * @body {number} privilegeId - The ID of the privilege.
 */
router.post('/role_privileges', async (req, res) => {
    const roleId = req.body.roleId ?? req.body.role_id;
    const privilegeId = req.body.privilegeId ?? req.body.privilege_id;
    if (roleId == null || privilegeId == null || roleId === '' || privilegeId === '') {
        return res.status(400).json({ message: 'roleId and privilegeId are required.' });
    }
    
    try {
        const DB_TYPE = process.env.DB_TYPE || 'mysql';
        
        if (DB_TYPE === 'postgresql') {
            // PostgreSQL: Use ON CONFLICT DO NOTHING instead of INSERT IGNORE
            const insertResult = await pool.query(
                `INSERT INTO role_privileges (roleid, privilegeid, createdat, updatedat, voided)
                 VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, false)
                 ON CONFLICT DO NOTHING
                 RETURNING roleprivilegeid AS "rolePrivilegeId", roleid AS "roleId", privilegeid AS "privilegeId", createdat AS "createdAt", updatedat AS "updatedAt", voided`,
                [roleId, privilegeId]
            );
            
            if (insertResult.rows.length > 0) {
                res.status(201).json(insertResult.rows[0]);
            } else {
                // Already exists, fetch it
                const fetchResult = await pool.query(
                    'SELECT roleprivilegeid AS "rolePrivilegeId", roleid AS "roleId", privilegeid AS "privilegeId", createdat AS "createdAt", updatedat AS "updatedAt", voided FROM role_privileges WHERE roleid = $1 AND privilegeid = $2 AND voided = false',
                    [roleId, privilegeId]
                );
                if (fetchResult.rows.length > 0) {
                    res.status(200).json(fetchResult.rows[0]);
                } else {
                    res.status(400).json({ message: 'Role privilege already exists or could not be created.' });
                }
            }
        } else {
            // MySQL: Use INSERT IGNORE
            const newRolePrivilege = {
                roleId: roleId,
                privilegeId: privilegeId,
                createdAt: new Date(),
            };
            await pool.query('INSERT IGNORE INTO role_privileges SET ?', newRolePrivilege);
            res.status(201).json(newRolePrivilege);
        }
    } catch (error) {
        console.error('Error creating role privilege:', error);
        if (error.code === '23505') {
            return res.status(400).json({ message: 'Role privilege already exists.' });
        }
        res.status(500).json({ message: 'Error creating role privilege', error: error.message });
    }
});

/**
 * @route DELETE /api/users/role_privileges/:roleId/:privilegeId
 * @description Delete a role privilege assignment from the role_privileges table.
 */
router.delete('/role_privileges/:roleId/:privilegeId', async (req, res) => {
    const { roleId, privilegeId } = req.params;
    try {
        const DB_TYPE = process.env.DB_TYPE || 'mysql';
        let query;
        let params;
        
        if (DB_TYPE === 'postgresql') {
            // Soft delete by setting voided = true
            query = 'UPDATE role_privileges SET voided = true, updatedat = CURRENT_TIMESTAMP WHERE roleid = $1 AND privilegeid = $2 AND voided = false';
            params = [roleId, privilegeId];
        } else {
            query = 'DELETE FROM role_privileges WHERE roleId = ? AND privilegeId = ?';
            params = [roleId, privilegeId];
        }
        
        const result = await pool.query(query, params);
        const affectedRows = DB_TYPE === 'postgresql' ? result.rowCount : result.affectedRows;
        
        if (affectedRows > 0) {
            res.status(204).send();
        } else {
            res.status(404).json({ message: 'Role privilege not found' });
        }
    } catch (error) {
        console.error('Error deleting role privilege:', error);
        res.status(500).json({ message: 'Error deleting role privilege', error: error.message });
    }
});

// --- CRUD Operations for staff ---

/**
 * @route GET /api/users/staff
 * @description Get all staff from the staff table.
 */
router.get('/staff', async (req, res) => {
    try {
        const DB_TYPE = process.env.DB_TYPE || 'mysql';
        let query;
        
        if (DB_TYPE === 'postgresql') {
            // PostgreSQL: use snake_case column names, return camelCase for API compatibility
            query = `
                SELECT 
                    staff_id AS "staffId",
                    first_name AS "firstName",
                    last_name AS "lastName",
                    email,
                    phone_number AS "phoneNumber",
                    department_id AS "departmentId",
                    job_group_id AS "jobGroupId",
                    gender,
                    date_of_birth AS "dateOfBirth",
                    place_of_birth AS "placeOfBirth",
                    blood_type AS "bloodType",
                    religion,
                    national_id AS "nationalId",
                    kra_pin AS "kraPin",
                    employment_status AS "employmentStatus",
                    start_date AS "startDate",
                    emergency_contact_name AS "emergencyContactName",
                    emergency_contact_relationship AS "emergencyContactRelationship",
                    emergency_contact_phone AS "emergencyContactPhone",
                    nationality,
                    marital_status AS "maritalStatus",
                    employment_type AS "employmentType",
                    manager_id AS "managerId",
                    user_id AS "userId",
                    created_at AS "createdAt",
                    updated_at AS "updatedAt",
                    role,
                    voided
                FROM staff
                WHERE voided = false
            `;
        } else {
            // MySQL: use camelCase column names
            query = 'SELECT * FROM staff WHERE voided = 0';
        }
        
        const result = await pool.execute(query);
        const rows = DB_TYPE === 'postgresql' ? (result.rows || result) : (Array.isArray(result) ? result[0] : result);
        const staff = Array.isArray(rows) ? rows : [rows];
        
        res.status(200).json(staff);
    } catch (error) {
        // SCOPE_DOWN / cleanup safety: some deployments may not have the staff table.
        // Return [] so other screens (e.g., projects) can still load.
        const pgMissingTable = error?.code === '42P01'; // undefined_table
        const mysqlMissingTable = error?.code === 'ER_NO_SUCH_TABLE';
        const msg = String(error?.message || '');
        const looksLikeMissing =
            pgMissingTable ||
            mysqlMissingTable ||
            msg.toLowerCase().includes('does not exist') ||
            msg.toLowerCase().includes('no such table') ||
            msg.toLowerCase().includes('staff');

        if (looksLikeMissing) {
            console.warn('Staff table missing; returning []', { code: error?.code, message: error?.message });
            return res.status(200).json([]);
        }

        console.error('Error fetching staff:', error);
        return res.status(500).json({ message: 'Error fetching staff', error: error.message });
    }
});

/**
 * @route GET /api/users/staff/:id
 * @description Get a single staff by staff_id from the staff table.
 */
router.get('/staff/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const DB_TYPE = process.env.DB_TYPE || 'mysql';
        let query, params;
        
        if (DB_TYPE === 'postgresql') {
            // PostgreSQL: use snake_case column names, return camelCase for API compatibility
            query = `
                SELECT 
                    staff_id AS "staffId",
                    first_name AS "firstName",
                    last_name AS "lastName",
                    email,
                    phone_number AS "phoneNumber",
                    department_id AS "departmentId",
                    job_group_id AS "jobGroupId",
                    gender,
                    date_of_birth AS "dateOfBirth",
                    place_of_birth AS "placeOfBirth",
                    blood_type AS "bloodType",
                    religion,
                    national_id AS "nationalId",
                    kra_pin AS "kraPin",
                    employment_status AS "employmentStatus",
                    start_date AS "startDate",
                    emergency_contact_name AS "emergencyContactName",
                    emergency_contact_relationship AS "emergencyContactRelationship",
                    emergency_contact_phone AS "emergencyContactPhone",
                    nationality,
                    marital_status AS "maritalStatus",
                    employment_type AS "employmentType",
                    manager_id AS "managerId",
                    user_id AS "userId",
                    created_at AS "createdAt",
                    updated_at AS "updatedAt",
                    role,
                    voided
                FROM staff
                WHERE staff_id = $1 AND voided = false
            `;
            params = [id];
        } else {
            // MySQL: use camelCase column names
            query = 'SELECT * FROM staff WHERE staffId = ? AND voided = 0';
            params = [id];
        }
        
        const result = await pool.execute(query, params);
        const rows = DB_TYPE === 'postgresql' ? (result.rows || result) : (Array.isArray(result) ? result[0] : result);
        const staff = Array.isArray(rows) ? rows : [rows];
        
        if (staff.length > 0) {
            res.status(200).json(staff[0]);
        } else {
            res.status(404).json({ message: 'Staff member not found' });
        }
    } catch (error) {
        console.error('Error fetching staff member:', error);
        res.status(500).json({ message: 'Error fetching staff member', error: error.message });
    }
});

/**
 * @route POST /api/users/staff
 * @description Create a new staff member in the staff table.
 */
router.post('/staff', async (req, res) => {
    const newStaff = {
        createdAt: new Date(),
        updatedAt: new Date(),
        ...req.body
    };
    delete newStaff.staffId;

    try {
        const [result] = await pool.query('INSERT INTO staff SET ?', newStaff);
        const insertedStaffId = result.insertId;
        const [rows] = await pool.query('SELECT * FROM staff WHERE staffId = ?', [insertedStaffId]);
        res.status(201).json(rows[0]);
    } catch (error) {
        console.error('Error creating staff member:', error);
        res.status(500).json({ message: 'Error creating staff member', error: error.message });
    }
});

/**
 * @route PUT /api/users/staff/:id
 * @description Update an existing staff member in the staff table.
 */
router.put('/staff/:id', async (req, res) => {
    const { id } = req.params;
    const fieldsToUpdate = { ...req.body, updatedAt: new Date() };
    delete fieldsToUpdate.staffId;

    try {
        const [result] = await pool.query('UPDATE staff SET ? WHERE staffId = ?', [fieldsToUpdate, id]);
        if (result.affectedRows > 0) {
            const [rows] = await pool.query('SELECT * FROM staff WHERE staffId = ?', [id]);
            res.status(200).json(rows[0]);
        } else {
            res.status(404).json({ message: 'Staff member not found' });
        }
    } catch (error) {
        console.error('Error updating staff member:', error);
        res.status(500).json({ message: 'Error updating staff member', error: error.message });
    }
});

/**
 * @route DELETE /api/users/staff/:id
 * @description Delete a staff member from the staff table.
 */
router.delete('/staff/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [result] = await pool.query('DELETE FROM staff WHERE staffId = ?', [id]);
        if (result.affectedRows > 0) {
            res.status(204).send();
        } else {
            res.status(404).json({ message: 'Staff member not found' });
        }
    } catch (error) {
        console.error('Error deleting staff member:', error);
        res.status(500).json({ message: 'Error deleting staff member', error: error.message });
    }
});

// --- CRUD Operations for project_roles ---

/**
 * @route GET /api/users/project_roles
 * @description Get all project roles from the project_roles table.
 */
router.get('/project_roles', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM project_roles');
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching project roles:', error);
        res.status(500).json({ message: 'Error fetching project roles', error: error.message });
    }
});

/**
 * @route GET /api/users/project_roles/:id
 * @description Get a single project role by role_id from the project_roles table.
 */
router.get('/project_roles/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await pool.query('SELECT * FROM project_roles WHERE roleId = ?', [id]);
        if (rows.length > 0) {
            res.status(200).json(rows[0]);
        } else {
            res.status(404).json({ message: 'Project role not found' });
        }
    } catch (error) {
        console.error('Error fetching project role:', error);
        res.status(500).json({ message: 'Error fetching project role', error: error.message });
    }
});

/**
 * @route POST /api/users/project_roles
 * @description Create a new project role in the project_roles table.
 */
router.post('/project_roles', async (req, res) => {
    const newProjectRole = {
        ...req.body
    };
    delete newProjectRole.roleId;

    try {
        const [result] = await pool.query('INSERT INTO project_roles SET ?', newProjectRole);
        const insertedRoleId = result.insertId;
        const [rows] = await pool.query('SELECT * FROM project_roles WHERE roleId = ?', [insertedRoleId]);
        res.status(201).json(rows[0]);
    }
    catch (error) {
        console.error('Error creating project role:', error);
        res.status(500).json({ message: 'Error creating project role', error: error.message });
    }
});

/**
 * @route PUT /api/users/project_roles/:id
 * @description Update an existing project role in the project_roles table.
 */
router.put('/project_roles/:id', async (req, res) => {
    const { id } = req.params;
    const fieldsToUpdate = { ...req.body };
    delete fieldsToUpdate.roleId;

    try {
        const [result] = await pool.query('UPDATE project_roles SET ? WHERE roleId = ?', [fieldsToUpdate, id]);
        if (result.affectedRows > 0) {
            const [rows] = await pool.query('SELECT * FROM project_roles WHERE roleId = ?', [id]);
            res.status(200).json(rows[0]);
        } else {
            res.status(404).json({ message: 'Project role not found' });
        }
    } catch (error) {
        console.error('Error updating project role:', error);
        res.status(500).json({ message: 'Error updating project role', error: error.message });
    }
});

/**
 * @route DELETE /api/users/project_roles/:id
 * @description Delete a project role from the project_roles table.
 */
router.delete('/project_roles/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [result] = await pool.query('DELETE FROM project_roles WHERE roleId = ?', [id]);
        if (result.affectedRows > 0) {
            res.status(204).send();
        } else {
            res.status(404).json({ message: 'Project role not found' });
        }
    } catch (error) {
        console.error('Error deleting project role:', error);
        res.status(500).json({ message: 'Error deleting project role', error: error.message });
    }
});

// --- CRUD Operations for project_staff_assignments ---

/**
 * @route GET /api/users/project_staff_assignments
 * @description Get all project staff assignments from the project_staff_assignments table.
 */
router.get('/project_staff_assignments', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM project_staff_assignments');
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching project staff assignments:', error);
        res.status(500).json({ message: 'Error fetching project staff assignments', error: error.message });
    }
});

/**
 * @route GET /api/users/project_staff_assignments/:id
 * @description Get a single project staff assignment by assignment_id from the project_staff_assignments table.
 */
router.get('/project_staff_assignments/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await pool.query('SELECT * FROM project_staff_assignments WHERE assignmentId = ?', [id]);
        if (rows.length > 0) {
            res.status(200).json(rows[0]);
        } else {
            res.status(404).json({ message: 'Project staff assignment not found' });
        }
    } catch (error) {
        console.error('Error fetching project staff assignment:', error);
        res.status(500).json({ message: 'Error fetching project staff assignment', error: error.message });
    }
});

/**
 * @route POST /api/users/project_staff_assignments
 * @description Create a new project staff assignment in the project_staff_assignments table.
 */
router.post('/project_staff_assignments', async (req, res) => {
    const newAssignment = {
        createdAt: new Date(),
        ...req.body
    };
    delete newAssignment.assignmentId;

    try {
        const [result] = await pool.query('INSERT INTO project_staff_assignments SET ?', newAssignment);
        const insertedAssignmentId = result.insertId;
        const [rows] = await pool.query('SELECT * FROM project_staff_assignments WHERE assignmentId = ?', [insertedAssignmentId]);
        res.status(201).json(rows[0]);
    } catch (error) {
        console.error('Error creating project staff assignment:', error);
        res.status(500).json({ message: 'Error creating project staff assignment', error: error.message });
    }
});

/**
 * @route PUT /api/users/project_staff_assignments/:id
 * @description Update an existing project staff assignment in the project_staff_assignments table.
 */
router.put('/project_staff_assignments/:id', async (req, res) => {
    const { id } = req.params;
    const fieldsToUpdate = { ...req.body };
    delete fieldsToUpdate.assignmentId;

    try {
        const [result] = await pool.query('UPDATE project_staff_assignments SET ? WHERE assignmentId = ?', [fieldsToUpdate, id]);
        if (result.affectedRows > 0) {
            const [rows] = await pool.query('SELECT * FROM project_staff_assignments WHERE assignmentId = ?', [id]);
            res.status(200).json(rows[0]);
        } else {
            res.status(404).json({ message: 'Project staff assignment not found' });
        }
    } catch (error) {
        console.error('Error updating project staff assignment:', error);
        res.status(500).json({ message: 'Error updating project staff assignment', error: error.message });
    }
});

/**
 * @route DELETE /api/users/project_staff_assignments/:id
 * @description Delete a project staff assignment from the project_staff_assignments table.
 */
router.delete('/project_staff_assignments/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [result] = await pool.query('DELETE FROM project_staff_assignments WHERE assignmentId = ?', [id]);
        if (result.affectedRows > 0) {
            res.status(204).send();
        } else {
            res.status(404).json({ message: 'Project staff assignment not found' });
        }
    } catch (error) {
        console.error('Error deleting project staff assignment:', error);
        res.status(500).json({ message: 'Error deleting project staff assignment', error: error.message });
    }
});

// --- CRUD Operations for websitepublicprofiles ---

/**
 * @route GET /api/users/website_public_profiles
 * @description Get all website public profiles from the websitepublicprofiles table.
 */
router.get('/website_public_profiles', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM websitepublicprofiles');
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching website public profiles:', error);
        res.status(500).json({ message: 'Error fetching website public profiles', error: error.message });
    }
});

/**
 * @route GET /api/users/website_public_profiles/:id
 * @description Get a single website public profile by ProfileID from the websitepublicprofiles table.
 */
router.get('/website_public_profiles/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await pool.query('SELECT * FROM websitepublicprofiles WHERE ProfileID = ?', [id]);
        if (rows.length > 0) {
            res.status(200).json(rows[0]);
        } else {
            res.status(404).json({ message: 'Website public profile not found' });
        }
    } catch (error) {
        console.error('Error fetching website public profile:', error);
        res.status(500).json({ message: 'Error fetching website public profile', error: error.message });
    }
});

/**
 * @route POST /api/users/website_public_profiles
 * @description Create a new website public profile in the websitepublicprofiles table.
 */
router.post('/website_public_profiles', async (req, res) => {
    const newProfile = {
        voided: req.body.voided !== undefined ? req.body.voided : false,
        voidedBy: req.body.voidedBy !== undefined ? req.body.voidedBy : null,
        ...req.body
    };
    delete newProfile.ProfileID;

    try {
        const [result] = await pool.query('INSERT INTO websitepublicprofiles SET ?', newProfile);
        const insertedProfileID = result.insertId;
        const [rows] = await pool.query('SELECT * FROM websitepublicprofiles WHERE ProfileID = ?', [insertedProfileID]);
        res.status(201).json(rows[0]);
    } catch (error) {
        console.error('Error creating website public profile:', error);
        res.status(500).json({ message: 'Error creating website public profile', error: error.message });
    }
});

/**
 * @route PUT /api/users/website_public_profiles/:id
 * @description Update an existing website public profile in the websitepublicprofiles table.
 */
router.put('/website_public_profiles/:id', async (req, res) => {
    const { id } = req.params;
    const fieldsToUpdate = { ...req.body };
    delete fieldsToUpdate.ProfileID;

    try {
        const [result] = await pool.query('UPDATE websitepublicprofiles SET ? WHERE ProfileID = ?', [fieldsToUpdate, id]);
        if (result.affectedRows > 0) {
            const [rows] = await pool.query('SELECT * FROM websitepublicprofiles WHERE ProfileID = ?', [id]);
            res.status(200).json(rows[0]);
        } else {
            res.status(404).json({ message: 'Website public profile not found' });
        }
    } catch (error) {
        console.error('Error updating website public profile:', error);
        res.status(500).json({ message: 'Error updating website public profile', error: error.message });
    }
});

/**
 * @route DELETE /api/users/website_public_profiles/:id
 * @description Delete a website public profile from the websitepublicprofiles table.
 */
router.delete('/website_public_profiles/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [result] = await pool.query('DELETE FROM websitepublicprofiles WHERE ProfileID = ?', [id]);
        if (result.affectedRows > 0) {
            res.status(204).send();
        } else {
            res.status(404).json({ message: 'Website public profile not found' });
        }
    } catch (error) {
        console.error('Error deleting website public profile:', error);
        res.status(500).json({ message: 'Error deleting website public profile', error: error.message });
    }
});

// --- User Approval Management Routes ---

/**
 * @route GET /api/users/pending
 * @description Get all pending users (users with isActive = false)
 * @access Protected - requires user.read or user.approve privilege or admin role
 */
router.get('/pending', async (req, res) => {
    try {
        const DB_TYPE = process.env.DB_TYPE || 'mysql';
        let query;
        
        if (DB_TYPE === 'postgresql') {
            query = `
                SELECT 
                    u.userid AS "userId", 
                    u.username, 
                    u.email, 
                    u.firstname AS "firstName", 
                    u.lastname AS "lastName", 
                    u.id_number AS "idNumber", 
                    u.employee_number AS "employeeNumber",
                    u.createdat AS "createdAt", 
                    u.updatedat AS "updatedAt", 
                    u.isactive AS "isActive", 
                    u.roleid AS "roleId", 
                    r.name AS role,
                    u.ministry, 
                    u.state_department AS "stateDepartment", 
                    u.agency_id AS "agencyId", 
                    a.agency_name AS "agencyName"
                FROM users u
                LEFT JOIN roles r ON u.roleid = r.roleid
                LEFT JOIN agencies a ON u.agency_id = a.id
                WHERE u.voided = false AND u.isactive = false
                ORDER BY u.createdat DESC
            `;
        } else {
            query = `
                SELECT 
                    u.userId, 
                    u.username, 
                    u.email,
                    u.firstName, 
                    u.lastName, 
                    u.idNumber, 
                    u.employeeNumber,
                    u.createdAt, 
                    u.updatedAt, 
                    u.isActive, 
                    u.roleId, 
                    r.roleName AS role,
                    u.ministry, 
                    u.state_department AS stateDepartment, 
                    u.agency_id AS agencyId, 
                    a.agency_name AS agencyName
                FROM users u
                LEFT JOIN roles r ON u.roleId = r.roleId
                LEFT JOIN agencies a ON u.agency_id = a.id
                WHERE u.voided = 0 AND u.isActive = 0
                ORDER BY u.createdAt DESC
            `;
        }
        
        const result = await pool.query(query);
        const rows = DB_TYPE === 'postgresql' ? (result.rows || result) : (Array.isArray(result) ? result[0] : result);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching pending users:', error);
        res.status(500).json({ message: 'Error fetching pending users', error: error.message });
    }
});

/**
 * @route GET /api/users/approved/summary
 * @description Get summary of approved users (users with isActive = true)
 * @query approvedBy - Optional: Filter by user ID who approved (if tracking is available)
 * @access Protected - requires user.read or user.approve privilege or admin role
 */
router.get('/approved/summary', async (req, res) => {
    try {
        const DB_TYPE = process.env.DB_TYPE || 'mysql';
        const { approvedBy, startDate, endDate } = req.query;
        let query;
        let params = [];
        
        if (DB_TYPE === 'postgresql') {
            let whereConditions = ['u.voided = false', 'u.isactive = true'];
            
            if (startDate) {
                whereConditions.push(`u.updatedat >= $${params.length + 1}`);
                params.push(startDate);
            }
            if (endDate) {
                whereConditions.push(`u.updatedat <= $${params.length + 1}`);
                params.push(endDate);
            }
            
            query = `
                SELECT 
                    COUNT(*) AS "totalApproved",
                    COUNT(CASE WHEN u.updatedat >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) AS "approvedLast30Days",
                    COUNT(CASE WHEN u.updatedat >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) AS "approvedLast7Days",
                    COUNT(DISTINCT u.roleid) AS "uniqueRoles",
                    COUNT(DISTINCT u.ministry) AS "uniqueMinistries"
                FROM users u
                WHERE ${whereConditions.join(' AND ')}
            `;
        } else {
            let whereConditions = ['u.voided = 0', 'u.isActive = 1'];
            
            if (startDate) {
                whereConditions.push('u.updatedAt >= ?');
                params.push(startDate);
            }
            if (endDate) {
                whereConditions.push('u.updatedAt <= ?');
                params.push(endDate);
            }
            
            query = `
                SELECT 
                    COUNT(*) AS totalApproved,
                    COUNT(CASE WHEN u.updatedAt >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) AS approvedLast30Days,
                    COUNT(CASE WHEN u.updatedAt >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END) AS approvedLast7Days,
                    COUNT(DISTINCT u.roleId) AS uniqueRoles,
                    COUNT(DISTINCT u.ministry) AS uniqueMinistries
                FROM users u
                WHERE ${whereConditions.join(' AND ')}
            `;
        }
        
        const result = await pool.query(query, params);
        const rows = DB_TYPE === 'postgresql' ? (result.rows || result) : (Array.isArray(result) ? result[0] : result);
        
        // Get breakdown by role
        let roleBreakdownQuery;
        if (DB_TYPE === 'postgresql') {
            roleBreakdownQuery = `
                SELECT 
                    r.name AS role,
                    COUNT(*) AS count
                FROM users u
                LEFT JOIN roles r ON u.roleid = r.roleid
                WHERE u.voided = false AND u.isactive = true
                GROUP BY r.name
                ORDER BY count DESC
            `;
        } else {
            roleBreakdownQuery = `
                SELECT 
                    r.roleName AS role,
                    COUNT(*) AS count
                FROM users u
                LEFT JOIN roles r ON u.roleId = r.roleId
                WHERE u.voided = 0 AND u.isActive = 1
                GROUP BY r.roleName
                ORDER BY count DESC
            `;
        }
        
        const roleBreakdownResult = await pool.query(roleBreakdownQuery);
        const roleBreakdown = DB_TYPE === 'postgresql' 
            ? (roleBreakdownResult.rows || roleBreakdownResult) 
            : (Array.isArray(roleBreakdownResult) ? roleBreakdownResult[0] : roleBreakdownResult);
        
        const summary = Array.isArray(rows) ? rows[0] : rows;
        summary.roleBreakdown = Array.isArray(roleBreakdown) ? roleBreakdown : [roleBreakdown];
        
        res.status(200).json(summary);
    } catch (error) {
        console.error('Error fetching approved users summary:', error);
        res.status(500).json({ message: 'Error fetching approved users summary', error: error.message });
    }
});

function requireSuperAdmin(req, res, next) {
    if (!isSuperAdminRequester(req.user)) {
        return res.status(403).json({ message: 'Super Admin access required.' });
    }
    return next();
}

/** Shorter comparable string must be at least this many characters for prefix-only match (reduces noise). */
const ORG_INTEGRITY_PREFIX_MIN_LEN = 5;

/** Fullwidth parentheses → ASCII for SQL translate(..., from, to). */
const SQL_UNICODE_FW_PARENS = '\uFF08\uFF09';

/**
 * Normalized ministry fingerprint: fullwidth parens → ASCII, strip "Ministry of", strip trailing
 * parenthetical blocks (e.g. "(MICDE)"), treat "&" like whitespace, drop filler words (the/and/of/for),
 * then remove any remaining parenthetical segments, then alphanumeric-only. Aligns names with/without
 * trailing abbreviations and punctuation variants.
 */
const ministryComparableExpr = (expr) => `
    regexp_replace(
        regexp_replace(
            regexp_replace(
                regexp_replace(
                    regexp_replace(
                        regexp_replace(
                            translate(LOWER(btrim(COALESCE(${expr}, ''))), '${SQL_UNICODE_FW_PARENS}', '()'),
                            '^ministry\\s+of\\s+', '', 'gi'
                        ),
                        '(?:\\\\s*\\\\([^)]*\\\\))+\\\\s*$', '', ''
                    ),
                    '&', ' ', 'g'
                ),
                '\\\\m(the|and|of|for)\\\\M', '', 'gi'
            ),
            '\\\\s*\\\\([^)]*\\\\)\\\\s*', '', 'g'
        ),
        '[^a-z0-9]+',
        '',
        'g'
    )
`;

/**
 * Same fingerprint idea as ministries for state department names (after leading "State Department of/for" strip).
 */
const stateDeptComparableExpr = (expr) => `
    regexp_replace(
        regexp_replace(
            regexp_replace(
                regexp_replace(
                    regexp_replace(
                        regexp_replace(
                            translate(LOWER(btrim(COALESCE(${expr}, ''))), '${SQL_UNICODE_FW_PARENS}', '()'),
                            '^state\\\\s+department\\\\s+(of|for)\\\\s+', '', 'gi'
                        ),
                        '(?:\\\\s*\\\\([^)]*\\\\))+\\\\s*$', '', ''
                    ),
                    '&', ' ', 'g'
                ),
                '\\\\m(the|and|of|for)\\\\M', '', 'gi'
            ),
            '\\\\s*\\\\([^)]*\\\\)\\\\s*', '', 'g'
        ),
        '[^a-z0-9]+',
        '',
        'g'
    )
`;

/** Prefer exact → alias → normalized equality → prefix on normalized strings (e.g. registry "Defence" vs user "Ministry of Defence"). */
function ministryMatchPriorityCase(sourceField, nameField, aliasField) {
    const sm = ministryComparableExpr(sourceField);
    const nm = ministryComparableExpr(nameField);
    const L = ORG_INTEGRITY_PREFIX_MIN_LEN;
    return `
        CASE
            WHEN LOWER(TRIM(COALESCE(${sourceField}, ''))) = LOWER(TRIM(COALESCE(${nameField}, ''))) THEN 1
            WHEN EXISTS (
                SELECT 1
                FROM unnest(string_to_array(COALESCE(${aliasField}, ''), ',')) AS ma(token)
                WHERE LOWER(TRIM(COALESCE(${sourceField}, ''))) = LOWER(TRIM(COALESCE(ma.token, '')))
            ) THEN 2
            WHEN (${sm}) = (${nm}) THEN 3
            WHEN LENGTH(${sm}) >= ${L}
                 AND LENGTH(${nm}) >= ${L}
                 AND ((${nm}) LIKE (${sm}) || '%' OR (${sm}) LIKE (${nm}) || '%')
                THEN 4
            ELSE 5
        END
    `;
}

function stateDeptMatchPriorityCase(sourceField, nameField, aliasField) {
    const sd = stateDeptComparableExpr(sourceField);
    const nd = stateDeptComparableExpr(nameField);
    const L = ORG_INTEGRITY_PREFIX_MIN_LEN;
    return `
        CASE
            WHEN LOWER(TRIM(COALESCE(${sourceField}, ''))) = LOWER(TRIM(COALESCE(${nameField}, ''))) THEN 1
            WHEN EXISTS (
                SELECT 1
                FROM unnest(string_to_array(COALESCE(${aliasField}, ''), ',')) AS da(token)
                WHERE LOWER(TRIM(COALESCE(${sourceField}, ''))) = LOWER(TRIM(COALESCE(da.token, '')))
            ) THEN 2
            WHEN (${sd}) = (${nd}) THEN 3
            WHEN LENGTH(${sd}) >= ${L}
                 AND LENGTH(${nd}) >= ${L}
                 AND ((${nd}) LIKE (${sd}) || '%' OR (${sd}) LIKE (${nd}) || '%')
                THEN 4
            ELSE 5
        END
    `;
}

const ministryMatchesClause = (sourceExpr, nameExpr, aliasExpr) => {
    const sm = ministryComparableExpr(sourceExpr);
    const nm = ministryComparableExpr(nameExpr);
    const L = ORG_INTEGRITY_PREFIX_MIN_LEN;
    return `
    (
        LOWER(TRIM(COALESCE(${sourceExpr}, ''))) = LOWER(TRIM(COALESCE(${nameExpr}, '')))
        OR EXISTS (
            SELECT 1
            FROM unnest(string_to_array(COALESCE(${aliasExpr}, ''), ',')) AS ma(token)
            WHERE LOWER(TRIM(COALESCE(${sourceExpr}, ''))) = LOWER(TRIM(COALESCE(ma.token, '')))
        )
        OR (${sm}) = (${nm})
        OR (
            LENGTH(${sm}) >= ${L}
            AND LENGTH(${nm}) >= ${L}
            AND ((${nm}) LIKE (${sm}) || '%' OR (${sm}) LIKE (${nm}) || '%')
        )
    )
`;
};

const stateDepartmentMatchesClause = (sourceExpr, nameExpr, aliasExpr) => {
    const sd = stateDeptComparableExpr(sourceExpr);
    const nd = stateDeptComparableExpr(nameExpr);
    const L = ORG_INTEGRITY_PREFIX_MIN_LEN;
    return `
    (
        LOWER(TRIM(COALESCE(${sourceExpr}, ''))) = LOWER(TRIM(COALESCE(${nameExpr}, '')))
        OR EXISTS (
            SELECT 1
            FROM unnest(string_to_array(COALESCE(${aliasExpr}, ''), ',')) AS da(token)
            WHERE LOWER(TRIM(COALESCE(${sourceExpr}, ''))) = LOWER(TRIM(COALESCE(da.token, '')))
        )
        OR (${sd}) = (${nd})
        OR (
            LENGTH(${sd}) >= ${L}
            AND LENGTH(${nd}) >= ${L}
            AND ((${nd}) LIKE (${sd}) || '%' OR (${sd}) LIKE (${nd}) || '%')
        )
    )
`;
};

/** CTEs ending in user_final: misaligned users with current vs proposed ministry/state (registry names). */
function buildUserOrgMisalignedCte() {
    return `
        user_ministry_rank AS (
            SELECT
                u.userid,
                m.name AS proposed_ministry,
                ROW_NUMBER() OVER (
                    PARTITION BY u.userid
                    ORDER BY
                        ${ministryMatchPriorityCase('u.ministry', 'm.name', 'm.alias')},
                        m.name
                ) AS rn
            FROM users u
            INNER JOIN ministries m ON COALESCE(m.voided, false) = false
                AND (${ministryMatchesClause('u.ministry', 'm.name', 'm.alias')})
            WHERE COALESCE(u.voided, false) = false
              AND NULLIF(TRIM(COALESCE(u.ministry, '')), '') IS NOT NULL
        ),
        user_ministry_best AS (
            SELECT userid, proposed_ministry FROM user_ministry_rank WHERE rn = 1
        ),
        user_state_rank AS (
            SELECT
                u.userid,
                d.name AS proposed_state_department,
                ROW_NUMBER() OVER (
                    PARTITION BY u.userid
                    ORDER BY
                        ${stateDeptMatchPriorityCase('u.state_department', 'd.name', 'd.alias')},
                        d.name
                ) AS rn
            FROM users u
            INNER JOIN user_ministry_best umb ON umb.userid = u.userid
            INNER JOIN ministries m ON COALESCE(m.voided, false) = false
                AND LOWER(TRIM(m.name)) = LOWER(TRIM(umb.proposed_ministry))
            INNER JOIN departments d ON d."ministryId" = m."ministryId" AND COALESCE(d.voided, false) = false
            WHERE COALESCE(u.voided, false) = false
              AND NULLIF(TRIM(COALESCE(u.state_department, '')), '') IS NOT NULL
              AND (${stateDepartmentMatchesClause('u.state_department', 'd.name', 'd.alias')})
        ),
        user_state_best AS (
            SELECT userid, proposed_state_department FROM user_state_rank WHERE rn = 1
        ),
        user_final AS (
            SELECT
                u.userid,
                u.username,
                u.ministry AS current_ministry,
                u.state_department AS current_state_department,
                umb.proposed_ministry,
                usb.proposed_state_department,
                CASE
                    WHEN umb.proposed_ministry IS NULL THEN 'unknown_ministry'
                    WHEN COALESCE(TRIM(u.ministry), '') IS DISTINCT FROM COALESCE(TRIM(umb.proposed_ministry), '') THEN 'ministry_would_change'
                    WHEN NULLIF(TRIM(COALESCE(u.state_department, '')), '') IS NOT NULL
                         AND usb.proposed_state_department IS NULL THEN 'unknown_state_department'
                    WHEN NULLIF(TRIM(COALESCE(u.state_department, '')), '') IS NOT NULL
                         AND COALESCE(TRIM(u.state_department), '') IS DISTINCT FROM COALESCE(TRIM(usb.proposed_state_department), '')
                        THEN 'state_department_would_change'
                    ELSE 'aligned'
                END AS issue
            FROM users u
            LEFT JOIN user_ministry_best umb ON umb.userid = u.userid
            LEFT JOIN user_state_best usb ON usb.userid = u.userid
            WHERE COALESCE(u.voided, false) = false
              AND (
                    (umb.proposed_ministry IS NULL AND NULLIF(TRIM(COALESCE(u.ministry, '')), '') IS NOT NULL)
                    OR COALESCE(TRIM(u.ministry), '') IS DISTINCT FROM COALESCE(TRIM(umb.proposed_ministry), '')
                    OR (
                        NULLIF(TRIM(COALESCE(u.state_department, '')), '') IS NOT NULL
                        AND (
                            usb.proposed_state_department IS NULL
                            OR COALESCE(TRIM(u.state_department), '') IS DISTINCT FROM COALESCE(TRIM(usb.proposed_state_department), '')
                        )
                    )
              )
        )
    `;
}

function buildScopeOrgMisalignedCte() {
    return `
        scope_ministry_rank AS (
            SELECT
                s.id,
                m.name AS proposed_ministry,
                ROW_NUMBER() OVER (
                    PARTITION BY s.id
                    ORDER BY
                        ${ministryMatchPriorityCase('s.ministry', 'm.name', 'm.alias')},
                        m.name
                ) AS rn
            FROM user_organization_scope s
            INNER JOIN ministries m ON COALESCE(m.voided, false) = false
                AND (${ministryMatchesClause('s.ministry', 'm.name', 'm.alias')})
            WHERE s.scope_type IN ('MINISTRY_ALL', 'STATE_DEPARTMENT_ALL')
              AND NULLIF(TRIM(COALESCE(s.ministry, '')), '') IS NOT NULL
        ),
        scope_ministry_best AS (
            SELECT id, proposed_ministry FROM scope_ministry_rank WHERE rn = 1
        ),
        scope_state_rank AS (
            SELECT
                s.id,
                d.name AS proposed_state_department,
                ROW_NUMBER() OVER (
                    PARTITION BY s.id
                    ORDER BY
                        ${stateDeptMatchPriorityCase('s.state_department', 'd.name', 'd.alias')},
                        d.name
                ) AS rn
            FROM user_organization_scope s
            INNER JOIN scope_ministry_best smb ON smb.id = s.id
            INNER JOIN ministries m ON COALESCE(m.voided, false) = false
                AND LOWER(TRIM(m.name)) = LOWER(TRIM(smb.proposed_ministry))
            INNER JOIN departments d ON d."ministryId" = m."ministryId" AND COALESCE(d.voided, false) = false
            WHERE s.scope_type = 'STATE_DEPARTMENT_ALL'
              AND NULLIF(TRIM(COALESCE(s.state_department, '')), '') IS NOT NULL
              AND (${stateDepartmentMatchesClause('s.state_department', 'd.name', 'd.alias')})
        ),
        scope_state_best AS (
            SELECT id, proposed_state_department FROM scope_state_rank WHERE rn = 1
        ),
        scope_final AS (
            SELECT
                s.id,
                s.user_id,
                u.username,
                s.scope_type,
                s.ministry AS current_ministry,
                s.state_department AS current_state_department,
                smb.proposed_ministry,
                ssb.proposed_state_department,
                CASE
                    WHEN smb.proposed_ministry IS NULL THEN 'unknown_ministry'
                    WHEN COALESCE(TRIM(s.ministry), '') IS DISTINCT FROM COALESCE(TRIM(smb.proposed_ministry), '') THEN 'ministry_would_change'
                    WHEN s.scope_type = 'STATE_DEPARTMENT_ALL'
                         AND NULLIF(TRIM(COALESCE(s.state_department, '')), '') IS NOT NULL
                         AND ssb.proposed_state_department IS NULL THEN 'unknown_state_department'
                    WHEN s.scope_type = 'STATE_DEPARTMENT_ALL'
                         AND NULLIF(TRIM(COALESCE(s.state_department, '')), '') IS NOT NULL
                         AND COALESCE(TRIM(s.state_department), '') IS DISTINCT FROM COALESCE(TRIM(ssb.proposed_state_department), '')
                        THEN 'state_department_would_change'
                    ELSE 'aligned'
                END AS issue
            FROM user_organization_scope s
            LEFT JOIN users u ON u.userid = s.user_id
            LEFT JOIN scope_ministry_best smb ON smb.id = s.id
            LEFT JOIN scope_state_best ssb ON ssb.id = s.id
            WHERE s.scope_type IN ('MINISTRY_ALL', 'STATE_DEPARTMENT_ALL')
              AND (
                    (smb.proposed_ministry IS NULL AND NULLIF(TRIM(COALESCE(s.ministry, '')), '') IS NOT NULL)
                    OR COALESCE(TRIM(s.ministry), '') IS DISTINCT FROM COALESCE(TRIM(smb.proposed_ministry), '')
                    OR (
                        s.scope_type = 'STATE_DEPARTMENT_ALL'
                        AND NULLIF(TRIM(COALESCE(s.state_department, '')), '') IS NOT NULL
                        AND (
                            ssb.proposed_state_department IS NULL
                            OR COALESCE(TRIM(s.state_department), '') IS DISTINCT FROM COALESCE(TRIM(ssb.proposed_state_department), '')
                        )
                    )
              )
        )
    `;
}

function buildProjectOrgMisalignedCte() {
    return `
        project_ministry_rank AS (
            SELECT
                p.project_id,
                m.name AS proposed_ministry,
                ROW_NUMBER() OVER (
                    PARTITION BY p.project_id
                    ORDER BY
                        ${ministryMatchPriorityCase('p.ministry', 'm.name', 'm.alias')},
                        m.name
                ) AS rn
            FROM projects p
            INNER JOIN ministries m ON COALESCE(m.voided, false) = false
                AND (${ministryMatchesClause('p.ministry', 'm.name', 'm.alias')})
            WHERE COALESCE(p.voided, false) = false
              AND NULLIF(TRIM(COALESCE(p.ministry, '')), '') IS NOT NULL
        ),
        project_ministry_best AS (
            SELECT project_id, proposed_ministry FROM project_ministry_rank WHERE rn = 1
        ),
        project_state_rank AS (
            SELECT
                p.project_id,
                d.name AS proposed_state_department,
                ROW_NUMBER() OVER (
                    PARTITION BY p.project_id
                    ORDER BY
                        ${stateDeptMatchPriorityCase('p.state_department', 'd.name', 'd.alias')},
                        d.name
                ) AS rn
            FROM projects p
            INNER JOIN project_ministry_best pmb ON pmb.project_id = p.project_id
            INNER JOIN ministries m ON COALESCE(m.voided, false) = false
                AND LOWER(TRIM(m.name)) = LOWER(TRIM(pmb.proposed_ministry))
            INNER JOIN departments d ON d."ministryId" = m."ministryId" AND COALESCE(d.voided, false) = false
            WHERE COALESCE(p.voided, false) = false
              AND NULLIF(TRIM(COALESCE(p.state_department, '')), '') IS NOT NULL
              AND (${stateDepartmentMatchesClause('p.state_department', 'd.name', 'd.alias')})
        ),
        project_state_best AS (
            SELECT project_id, proposed_state_department FROM project_state_rank WHERE rn = 1
        ),
        project_final AS (
            SELECT
                p.project_id,
                p.name,
                p.ministry AS current_ministry,
                p.state_department AS current_state_department,
                pmb.proposed_ministry,
                psb.proposed_state_department,
                CASE
                    WHEN pmb.proposed_ministry IS NULL THEN 'unknown_ministry'
                    WHEN COALESCE(TRIM(p.ministry), '') IS DISTINCT FROM COALESCE(TRIM(pmb.proposed_ministry), '') THEN 'ministry_would_change'
                    WHEN NULLIF(TRIM(COALESCE(p.state_department, '')), '') IS NOT NULL
                         AND psb.proposed_state_department IS NULL THEN 'unknown_state_department'
                    WHEN NULLIF(TRIM(COALESCE(p.state_department, '')), '') IS NOT NULL
                         AND COALESCE(TRIM(p.state_department), '') IS DISTINCT FROM COALESCE(TRIM(psb.proposed_state_department), '')
                        THEN 'state_department_would_change'
                    ELSE 'aligned'
                END AS issue
            FROM projects p
            LEFT JOIN project_ministry_best pmb ON pmb.project_id = p.project_id
            LEFT JOIN project_state_best psb ON psb.project_id = p.project_id
            WHERE COALESCE(p.voided, false) = false
              AND (
                    NULLIF(TRIM(COALESCE(p.ministry, '')), '') IS NULL
                    OR pmb.proposed_ministry IS NULL
                    OR COALESCE(TRIM(p.ministry), '') IS DISTINCT FROM COALESCE(TRIM(pmb.proposed_ministry), '')
                    OR (
                        NULLIF(TRIM(COALESCE(p.state_department, '')), '') IS NOT NULL
                        AND (
                            psb.proposed_state_department IS NULL
                            OR COALESCE(TRIM(p.state_department), '') IS DISTINCT FROM COALESCE(TRIM(psb.proposed_state_department), '')
                        )
                    )
              )
        )
    `;
}

async function getOrgIntegrityPreview(limit = 50) {
    const previewLimit = Math.max(1, Math.min(parseInt(String(limit), 10) || 50, 500));

    const userCte = buildUserOrgMisalignedCte();
    const scopeCte = buildScopeOrgMisalignedCte();
    const projectCte = buildProjectOrgMisalignedCte();

    const userCountSql = `WITH ${userCte}
        SELECT
            COUNT(*)::int AS "totalMisaligned",
            COUNT(*) FILTER (WHERE issue = 'unknown_ministry')::int AS "unknownMinistry",
            COUNT(*) FILTER (WHERE issue = 'ministry_would_change')::int AS "ministryWouldChange",
            COUNT(*) FILTER (WHERE issue = 'unknown_state_department')::int AS "unknownStateDepartment",
            COUNT(*) FILTER (WHERE issue = 'state_department_would_change')::int AS "stateWouldChange"
        FROM user_final`;

    const userRowsSql = `WITH ${userCte}
        SELECT
            userid AS "userId",
            username,
            current_ministry AS "currentMinistry",
            current_state_department AS "currentStateDepartment",
            proposed_ministry AS "proposedMinistry",
            proposed_state_department AS "proposedStateDepartment",
            issue
        FROM user_final
        ORDER BY userid
        LIMIT $1`;

    const scopeCountSql = `WITH ${scopeCte}
        SELECT
            COUNT(*)::int AS "totalMisaligned",
            COUNT(*) FILTER (WHERE issue = 'unknown_ministry')::int AS "unknownMinistry",
            COUNT(*) FILTER (WHERE issue = 'ministry_would_change')::int AS "ministryWouldChange",
            COUNT(*) FILTER (WHERE issue = 'unknown_state_department')::int AS "unknownStateDepartment",
            COUNT(*) FILTER (WHERE issue = 'state_department_would_change')::int AS "stateWouldChange"
        FROM scope_final`;

    const scopeRowsSql = `WITH ${scopeCte}
        SELECT
            id AS "scopeId",
            user_id AS "userId",
            username,
            scope_type AS "scopeType",
            current_ministry AS "currentMinistry",
            current_state_department AS "currentStateDepartment",
            proposed_ministry AS "proposedMinistry",
            proposed_state_department AS "proposedStateDepartment",
            issue
        FROM scope_final
        ORDER BY user_id, id
        LIMIT $1`;

    const projectCountSql = `WITH ${projectCte}
        SELECT
            COUNT(*)::int AS "totalMisaligned",
            COUNT(*) FILTER (WHERE issue = 'unknown_ministry')::int AS "unknownMinistry",
            COUNT(*) FILTER (WHERE issue = 'ministry_would_change')::int AS "ministryWouldChange",
            COUNT(*) FILTER (WHERE issue = 'unknown_state_department')::int AS "unknownStateDepartment",
            COUNT(*) FILTER (WHERE issue = 'state_department_would_change')::int AS "stateWouldChange"
        FROM project_final`;

    const projectRowsSql = `WITH ${projectCte}
        SELECT
            project_id AS "projectId",
            name AS "projectName",
            current_ministry AS "currentMinistry",
            current_state_department AS "currentStateDepartment",
            proposed_ministry AS "proposedMinistry",
            proposed_state_department AS "proposedStateDepartment",
            issue
        FROM project_final
        ORDER BY project_id
        LIMIT $1`;

    const [
        userCountRes,
        userRowsRes,
        scopeCountRes,
        scopeRowsRes,
        projectCountRes,
        projectRowsRes,
    ] = await Promise.all([
        pool.query(userCountSql),
        pool.query(userRowsSql, [previewLimit]),
        pool.query(scopeCountSql),
        pool.query(scopeRowsSql, [previewLimit]),
        pool.query(projectCountSql),
        pool.query(projectRowsSql, [previewLimit]),
    ]);

    const uc = userCountRes.rows?.[0] || {};
    const sc = scopeCountRes.rows?.[0] || {};
    const pc = projectCountRes.rows?.[0] || {};

    return {
        summary: {
            usersMisaligned: uc.totalMisaligned ?? 0,
            usersUnknownMinistry: uc.unknownMinistry ?? 0,
            usersMinistryWouldChange: uc.ministryWouldChange ?? 0,
            usersUnknownStateDepartment: uc.unknownStateDepartment ?? 0,
            usersStateWouldChange: uc.stateWouldChange ?? 0,
            scopesMisaligned: sc.totalMisaligned ?? 0,
            scopesUnknownMinistry: sc.unknownMinistry ?? 0,
            scopesMinistryWouldChange: sc.ministryWouldChange ?? 0,
            scopesUnknownStateDepartment: sc.unknownStateDepartment ?? 0,
            scopesStateWouldChange: sc.stateWouldChange ?? 0,
            projectsMisaligned: pc.totalMisaligned ?? 0,
            projectsUnknownMinistry: pc.unknownMinistry ?? 0,
            projectsMinistryWouldChange: pc.ministryWouldChange ?? 0,
            projectsUnknownStateDepartment: pc.unknownStateDepartment ?? 0,
            projectsStateWouldChange: pc.stateWouldChange ?? 0,
        },
        misaligned: {
            users: userRowsRes.rows || [],
            scopes: scopeRowsRes.rows || [],
            projects: projectRowsRes.rows || [],
        },
    };
}

/** Ministry string has no registry match (empty allowed). */
function ministryMisalignedWhereClause(sourceTableAlias) {
    const col = `${sourceTableAlias}.ministry`;
    return `
    (
        NULLIF(TRIM(COALESCE(${col}, '')), '') IS NULL
        OR NOT EXISTS (
            SELECT 1 FROM ministries m
            WHERE COALESCE(m.voided, false) = false
              AND (${ministryMatchesClause(col, 'm.name', 'm.alias')})
        )
    )`;
}

/** State department string has no registry match (empty allowed). */
function stateDeptMisalignedWhereClause(sourceTableAlias) {
    const col = `${sourceTableAlias}.state_department`;
    return `
    (
        NULLIF(TRIM(COALESCE(${col}, '')), '') IS NULL
        OR NOT EXISTS (
            SELECT 1 FROM departments d
            INNER JOIN ministries m ON m."ministryId" = d."ministryId" AND COALESCE(m.voided, false) = false
            WHERE COALESCE(d.voided, false) = false
              AND (${stateDepartmentMatchesClause(col, 'd.name', 'd.alias')})
        )
    )`;
}

async function getMisalignedMinistryDistinct() {
    const uw = ministryMisalignedWhereClause('u');
    const sw = ministryMisalignedWhereClause('s');
    const pw = ministryMisalignedWhereClause('p');
    const userCte = buildUserOrgMisalignedCte();
    const scopeCte = buildScopeOrgMisalignedCte();
    const projectCte = buildProjectOrgMisalignedCte();

    const userSql = `
        SELECT TRIM(COALESCE(u.ministry, '')) AS "ministryKey", COUNT(*)::int AS n
        FROM users u
        WHERE COALESCE(u.voided, false) = false AND ${uw}
        GROUP BY TRIM(COALESCE(u.ministry, ''))`;

    const scopeSql = `
        SELECT TRIM(COALESCE(s.ministry, '')) AS "ministryKey", COUNT(*)::int AS n
        FROM user_organization_scope s
        WHERE s.scope_type IN ('MINISTRY_ALL', 'STATE_DEPARTMENT_ALL')
          AND ${sw}
        GROUP BY TRIM(COALESCE(s.ministry, ''))`;

    const projectSql = `
        SELECT TRIM(COALESCE(p.ministry, '')) AS "ministryKey", COUNT(*)::int AS n
        FROM projects p
        WHERE COALESCE(p.voided, false) = false AND ${pw}
        GROUP BY TRIM(COALESCE(p.ministry, ''))`;

    const userWouldChangeSql = `WITH ${userCte}
        SELECT TRIM(COALESCE(current_ministry, '')) AS "ministryKey", COUNT(*)::int AS n
        FROM user_final
        WHERE issue = 'ministry_would_change'
        GROUP BY TRIM(COALESCE(current_ministry, ''))`;

    const scopeWouldChangeSql = `WITH ${scopeCte}
        SELECT TRIM(COALESCE(current_ministry, '')) AS "ministryKey", COUNT(*)::int AS n
        FROM scope_final
        WHERE issue = 'ministry_would_change'
        GROUP BY TRIM(COALESCE(current_ministry, ''))`;

    const projectWouldChangeSql = `WITH ${projectCte}
        SELECT TRIM(COALESCE(current_ministry, '')) AS "ministryKey", COUNT(*)::int AS n
        FROM project_final
        WHERE issue = 'ministry_would_change'
        GROUP BY TRIM(COALESCE(current_ministry, ''))`;

    const [ur, sr, pr, uwr, swr, pwr] = await Promise.all([
        pool.query(userSql),
        pool.query(scopeSql),
        pool.query(projectSql),
        pool.query(userWouldChangeSql),
        pool.query(scopeWouldChangeSql),
        pool.query(projectWouldChangeSql),
    ]);

    const merged = new Map();
    const bump = (key, field, n) => {
        const k = key == null ? '' : String(key);
        const isEmpty = k === '';
        const cur = merged.get(k) || {
            ministryKey: k,
            displayMinistry: isEmpty ? '(empty / unspecified)' : k,
            isEmpty,
            userCount: 0,
            scopeCount: 0,
            projectCount: 0,
        };
        cur[field] += n;
        merged.set(k, cur);
    };

    for (const r of ur.rows || []) bump(r.ministryKey, 'userCount', r.n || 0);
    for (const r of sr.rows || []) bump(r.ministryKey, 'scopeCount', r.n || 0);
    for (const r of pr.rows || []) bump(r.ministryKey, 'projectCount', r.n || 0);
    for (const r of uwr.rows || []) bump(r.ministryKey, 'userCount', r.n || 0);
    for (const r of swr.rows || []) bump(r.ministryKey, 'scopeCount', r.n || 0);
    for (const r of pwr.rows || []) bump(r.ministryKey, 'projectCount', r.n || 0);

    const list = Array.from(merged.values());
    list.sort((a, b) => {
        if (a.isEmpty !== b.isEmpty) return a.isEmpty ? -1 : 1;
        return String(a.ministryKey).localeCompare(String(b.ministryKey), undefined, { sensitivity: 'base' });
    });
    return list;
}

async function getMisalignedStateDepartmentDistinct() {
    const uw = stateDeptMisalignedWhereClause('u');
    const sw = stateDeptMisalignedWhereClause('s');
    const pw = stateDeptMisalignedWhereClause('p');
    const userCte = buildUserOrgMisalignedCte();
    const scopeCte = buildScopeOrgMisalignedCte();
    const projectCte = buildProjectOrgMisalignedCte();

    const userSql = `
        SELECT TRIM(COALESCE(u.state_department, '')) AS "stateDepartmentKey", COUNT(*)::int AS n
        FROM users u
        WHERE COALESCE(u.voided, false) = false AND ${uw}
        GROUP BY TRIM(COALESCE(u.state_department, ''))`;

    const scopeSql = `
        SELECT TRIM(COALESCE(s.state_department, '')) AS "stateDepartmentKey", COUNT(*)::int AS n
        FROM user_organization_scope s
        WHERE s.scope_type = 'STATE_DEPARTMENT_ALL'
          AND ${sw}
        GROUP BY TRIM(COALESCE(s.state_department, ''))`;

    const projectSql = `
        SELECT TRIM(COALESCE(p.state_department, '')) AS "stateDepartmentKey", COUNT(*)::int AS n
        FROM projects p
        WHERE COALESCE(p.voided, false) = false AND ${pw}
        GROUP BY TRIM(COALESCE(p.state_department, ''))`;

    const userWouldChangeSql = `WITH ${userCte}
        SELECT TRIM(COALESCE(current_state_department, '')) AS "stateDepartmentKey", COUNT(*)::int AS n
        FROM user_final
        WHERE issue = 'state_department_would_change'
        GROUP BY TRIM(COALESCE(current_state_department, ''))`;

    const scopeWouldChangeSql = `WITH ${scopeCte}
        SELECT TRIM(COALESCE(current_state_department, '')) AS "stateDepartmentKey", COUNT(*)::int AS n
        FROM scope_final
        WHERE issue = 'state_department_would_change'
        GROUP BY TRIM(COALESCE(current_state_department, ''))`;

    const projectWouldChangeSql = `WITH ${projectCte}
        SELECT TRIM(COALESCE(current_state_department, '')) AS "stateDepartmentKey", COUNT(*)::int AS n
        FROM project_final
        WHERE issue = 'state_department_would_change'
        GROUP BY TRIM(COALESCE(current_state_department, ''))`;

    const [ur, sr, pr, uwr, swr, pwr] = await Promise.all([
        pool.query(userSql),
        pool.query(scopeSql),
        pool.query(projectSql),
        pool.query(userWouldChangeSql),
        pool.query(scopeWouldChangeSql),
        pool.query(projectWouldChangeSql),
    ]);

    const merged = new Map();
    const bump = (key, field, n) => {
        const k = key == null ? '' : String(key);
        const isEmpty = k === '';
        const cur = merged.get(k) || {
            stateDepartmentKey: k,
            displayStateDepartment: isEmpty ? '(empty / unspecified)' : k,
            isEmpty,
            userCount: 0,
            scopeCount: 0,
            projectCount: 0,
        };
        cur[field] += n;
        merged.set(k, cur);
    };

    for (const r of ur.rows || []) bump(r.stateDepartmentKey, 'userCount', r.n || 0);
    for (const r of sr.rows || []) bump(r.stateDepartmentKey, 'scopeCount', r.n || 0);
    for (const r of pr.rows || []) bump(r.stateDepartmentKey, 'projectCount', r.n || 0);
    for (const r of uwr.rows || []) bump(r.stateDepartmentKey, 'userCount', r.n || 0);
    for (const r of swr.rows || []) bump(r.stateDepartmentKey, 'scopeCount', r.n || 0);
    for (const r of pwr.rows || []) bump(r.stateDepartmentKey, 'projectCount', r.n || 0);

    const list = Array.from(merged.values());
    list.sort((a, b) => {
        if (a.isEmpty !== b.isEmpty) return a.isEmpty ? -1 : 1;
        return String(a.stateDepartmentKey).localeCompare(String(b.stateDepartmentKey), undefined, { sensitivity: 'base' });
    });
    return list;
}

async function resolveCanonicalMinistryName(conn, name) {
    const t = String(name || '').trim();
    if (!t) return null;
    const r = await conn.query(
        `SELECT name FROM ministries WHERE COALESCE(voided, false) = false AND TRIM(name) = $1 LIMIT 1`,
        [t]
    );
    return r.rows?.[0]?.name || null;
}

async function resolveCanonicalDepartmentName(conn, name) {
    const t = String(name || '').trim();
    if (!t) return null;
    const r = await conn.query(
        `SELECT d.name FROM departments d
         WHERE COALESCE(d.voided, false) = false AND TRIM(d.name) = $1 LIMIT 1`,
        [t]
    );
    return r.rows?.[0]?.name || null;
}

router.get('/organization-integrity/preview', requireSuperAdmin, async (req, res) => {
    try {
        const DB_TYPE = process.env.DB_TYPE || 'mysql';
        if (DB_TYPE !== 'postgresql') {
            return res.status(400).json({ message: 'Organization integrity tooling is only available for PostgreSQL.' });
        }
        const report = await getOrgIntegrityPreview(req.query.limit || 50);
        return res.status(200).json(report);
    } catch (error) {
        console.error('Error generating organization integrity preview:', error);
        return res.status(500).json({ message: 'Failed to generate preview', error: error.message });
    }
});

router.post('/organization-integrity/reconcile', requireSuperAdmin, async (req, res) => {
    const DB_TYPE = process.env.DB_TYPE || 'mysql';
    if (DB_TYPE !== 'postgresql') {
        return res.status(400).json({ message: 'Organization integrity tooling is only available for PostgreSQL.' });
    }

    const dryRun = req.body?.dryRun !== false;
    if (dryRun) {
        try {
            const report = await getOrgIntegrityPreview(req.body?.limit || 50);
            return res.status(200).json({ dryRun: true, ...report });
        } catch (error) {
            console.error('Error in organization integrity dry-run:', error);
            return res.status(500).json({ message: 'Failed to run dry-run', error: error.message });
        }
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const updateUsersMinistrySql = `
            UPDATE users u
            SET ministry = m.name,
                updatedat = CURRENT_TIMESTAMP
            FROM ministries m
            WHERE COALESCE(u.voided, false) = false
              AND COALESCE(m.voided, false) = false
              AND NULLIF(TRIM(COALESCE(u.ministry, '')), '') IS NOT NULL
              AND ${ministryMatchesClause('u.ministry', 'm.name', 'm.alias')}
              AND COALESCE(u.ministry, '') <> COALESCE(m.name, '')
        `;

        const updateUsersStateSql = `
            UPDATE users u
            SET state_department = d.name,
                updatedat = CURRENT_TIMESTAMP
            FROM ministries m
            JOIN departments d ON d."ministryId" = m."ministryId" AND COALESCE(d.voided, false) = false
            WHERE COALESCE(u.voided, false) = false
              AND COALESCE(m.voided, false) = false
              AND NULLIF(TRIM(COALESCE(u.ministry, '')), '') IS NOT NULL
              AND NULLIF(TRIM(COALESCE(u.state_department, '')), '') IS NOT NULL
              AND ${ministryMatchesClause('u.ministry', 'm.name', 'm.alias')}
              AND ${stateDepartmentMatchesClause('u.state_department', 'd.name', 'd.alias')}
              AND COALESCE(u.state_department, '') <> COALESCE(d.name, '')
        `;

        const updateScopesMinistrySql = `
            UPDATE user_organization_scope s
            SET ministry = m.name
            FROM ministries m
            WHERE COALESCE(m.voided, false) = false
              AND s.scope_type IN ('MINISTRY_ALL', 'STATE_DEPARTMENT_ALL')
              AND NULLIF(TRIM(COALESCE(s.ministry, '')), '') IS NOT NULL
              AND ${ministryMatchesClause('s.ministry', 'm.name', 'm.alias')}
              AND COALESCE(s.ministry, '') <> COALESCE(m.name, '')
        `;

        const updateScopesStateSql = `
            UPDATE user_organization_scope s
            SET state_department = d.name
            FROM ministries m
            JOIN departments d ON d."ministryId" = m."ministryId" AND COALESCE(d.voided, false) = false
            WHERE COALESCE(m.voided, false) = false
              AND s.scope_type = 'STATE_DEPARTMENT_ALL'
              AND NULLIF(TRIM(COALESCE(s.ministry, '')), '') IS NOT NULL
              AND NULLIF(TRIM(COALESCE(s.state_department, '')), '') IS NOT NULL
              AND ${ministryMatchesClause('s.ministry', 'm.name', 'm.alias')}
              AND ${stateDepartmentMatchesClause('s.state_department', 'd.name', 'd.alias')}
              AND COALESCE(s.state_department, '') <> COALESCE(d.name, '')
        `;

        const updateProjectsMinistrySql = `
            UPDATE projects p
            SET ministry = m.name,
                updated_at = CURRENT_TIMESTAMP
            FROM ministries m
            WHERE COALESCE(p.voided, false) = false
              AND COALESCE(m.voided, false) = false
              AND NULLIF(TRIM(COALESCE(p.ministry, '')), '') IS NOT NULL
              AND ${ministryMatchesClause('p.ministry', 'm.name', 'm.alias')}
              AND COALESCE(p.ministry, '') <> COALESCE(m.name, '')
        `;

        const updateProjectsStateSql = `
            UPDATE projects p
            SET state_department = d.name,
                updated_at = CURRENT_TIMESTAMP
            FROM ministries m
            JOIN departments d ON d."ministryId" = m."ministryId" AND COALESCE(d.voided, false) = false
            WHERE COALESCE(p.voided, false) = false
              AND COALESCE(m.voided, false) = false
              AND NULLIF(TRIM(COALESCE(p.ministry, '')), '') IS NOT NULL
              AND NULLIF(TRIM(COALESCE(p.state_department, '')), '') IS NOT NULL
              AND ${ministryMatchesClause('p.ministry', 'm.name', 'm.alias')}
              AND ${stateDepartmentMatchesClause('p.state_department', 'd.name', 'd.alias')}
              AND COALESCE(p.state_department, '') <> COALESCE(d.name, '')
        `;

        const usersMinistry = await conn.query(updateUsersMinistrySql);
        const usersState = await conn.query(updateUsersStateSql);
        const scopesMinistry = await conn.query(updateScopesMinistrySql);
        const scopesState = await conn.query(updateScopesStateSql);
        const projectsMinistry = await conn.query(updateProjectsMinistrySql);
        const projectsState = await conn.query(updateProjectsStateSql);

        await conn.commit();

        return res.status(200).json({
            dryRun: false,
            changed: {
                usersMinistry: usersMinistry.rowCount || 0,
                usersStateDepartment: usersState.rowCount || 0,
                scopesMinistry: scopesMinistry.rowCount || 0,
                scopesStateDepartment: scopesState.rowCount || 0,
                projectsMinistry: projectsMinistry.rowCount || 0,
                projectsStateDepartment: projectsState.rowCount || 0,
            },
        });
    } catch (error) {
        try {
            await conn.rollback();
        } catch (rollbackError) {
            console.warn('organization-integrity reconcile rollback failed:', rollbackError.message);
        }
        console.error('Error reconciling organization integrity:', error);
        return res.status(500).json({ message: 'Failed to reconcile organization data', error: error.message });
    } finally {
        conn.release();
    }
});

router.get('/organization-integrity/misaligned-distinct', requireSuperAdmin, async (req, res) => {
    const DB_TYPE = process.env.DB_TYPE || 'mysql';
    if (DB_TYPE !== 'postgresql') {
        return res.status(400).json({ message: 'Organization integrity tooling is only available for PostgreSQL.' });
    }
    try {
        const [misalignedMinistries, misalignedStateDepartments] = await Promise.all([
            getMisalignedMinistryDistinct(),
            getMisalignedStateDepartmentDistinct(),
        ]);
        return res.status(200).json({ misalignedMinistries, misalignedStateDepartments });
    } catch (error) {
        console.error('Error loading misaligned distinct org strings:', error);
        return res.status(500).json({ message: 'Failed to load misaligned ministry/state lists', error: error.message });
    }
});

router.post('/organization-integrity/manual-map', requireSuperAdmin, async (req, res) => {
    const DB_TYPE = process.env.DB_TYPE || 'mysql';
    if (DB_TYPE !== 'postgresql') {
        return res.status(400).json({ message: 'Organization integrity tooling is only available for PostgreSQL.' });
    }

    const ministryMappings = Array.isArray(req.body?.ministryMappings) ? req.body.ministryMappings : [];
    const stateDepartmentMappings = Array.isArray(req.body?.stateDepartmentMappings) ? req.body.stateDepartmentMappings : [];
    if (ministryMappings.length + stateDepartmentMappings.length > 500) {
        return res.status(400).json({ message: 'Too many mappings in one request (max 500 combined).' });
    }

    const conn = await pool.getConnection();
    const changed = {
        usersMinistry: 0,
        scopesMinistry: 0,
        projectsMinistry: 0,
        usersStateDepartment: 0,
        scopesStateDepartment: 0,
        projectsStateDepartment: 0,
    };

    try {
        await conn.beginTransaction();

        for (const row of ministryMappings) {
            const toName = String(row?.toMinistryName || '').trim();
            if (!toName) continue;
            const canonical = await resolveCanonicalMinistryName(conn, toName);
            if (!canonical) {
                throw new Error(`Target ministry not found in registry: "${toName}"`);
            }
            const isEmpty = row?.isEmptyMinistry === true || row?.ministryKey === '' || row?.ministryKey == null;
            if (isEmpty) {
                const u = await conn.query(
                    `UPDATE users SET ministry = $1, updatedat = CURRENT_TIMESTAMP
                     WHERE COALESCE(voided, false) = false
                       AND (ministry IS NULL OR TRIM(COALESCE(ministry, '')) = '')`,
                    [canonical]
                );
                changed.usersMinistry += u.rowCount || 0;

                const s = await conn.query(
                    `UPDATE user_organization_scope SET ministry = $1
                     WHERE scope_type IN ('MINISTRY_ALL', 'STATE_DEPARTMENT_ALL')
                       AND (ministry IS NULL OR TRIM(COALESCE(ministry, '')) = '')`,
                    [canonical]
                );
                changed.scopesMinistry += s.rowCount || 0;

                const p = await conn.query(
                    `UPDATE projects SET ministry = $1, updated_at = CURRENT_TIMESTAMP
                     WHERE COALESCE(voided, false) = false
                       AND (ministry IS NULL OR TRIM(COALESCE(ministry, '')) = '')`,
                    [canonical]
                );
                changed.projectsMinistry += p.rowCount || 0;
            } else {
                const fromKey = String(row.ministryKey).trim();
                const u = await conn.query(
                    `UPDATE users SET ministry = $1, updatedat = CURRENT_TIMESTAMP
                     WHERE COALESCE(voided, false) = false AND TRIM(COALESCE(ministry, '')) = $2`,
                    [canonical, fromKey]
                );
                changed.usersMinistry += u.rowCount || 0;

                const s = await conn.query(
                    `UPDATE user_organization_scope SET ministry = $1
                     WHERE scope_type IN ('MINISTRY_ALL', 'STATE_DEPARTMENT_ALL')
                       AND TRIM(COALESCE(ministry, '')) = $2`,
                    [canonical, fromKey]
                );
                changed.scopesMinistry += s.rowCount || 0;

                const p = await conn.query(
                    `UPDATE projects SET ministry = $1, updated_at = CURRENT_TIMESTAMP
                     WHERE COALESCE(voided, false) = false AND TRIM(COALESCE(ministry, '')) = $2`,
                    [canonical, fromKey]
                );
                changed.projectsMinistry += p.rowCount || 0;
            }
        }

        for (const row of stateDepartmentMappings) {
            const toName = String(row?.toDepartmentName || '').trim();
            if (!toName) continue;
            const canonicalDept = await resolveCanonicalDepartmentName(conn, toName);
            if (!canonicalDept) {
                throw new Error(`Target state department not found in registry: "${toName}"`);
            }
            const isEmpty = row?.isEmptyStateDepartment === true || row?.stateDepartmentKey === '' || row?.stateDepartmentKey == null;
            if (isEmpty) {
                const u = await conn.query(
                    `UPDATE users SET state_department = $1, updatedat = CURRENT_TIMESTAMP
                     WHERE COALESCE(voided, false) = false
                       AND (state_department IS NULL OR TRIM(COALESCE(state_department, '')) = '')`,
                    [canonicalDept]
                );
                changed.usersStateDepartment += u.rowCount || 0;

                const s = await conn.query(
                    `UPDATE user_organization_scope SET state_department = $1
                     WHERE scope_type = 'STATE_DEPARTMENT_ALL'
                       AND (state_department IS NULL OR TRIM(COALESCE(state_department, '')) = '')`,
                    [canonicalDept]
                );
                changed.scopesStateDepartment += s.rowCount || 0;

                const p = await conn.query(
                    `UPDATE projects SET state_department = $1, updated_at = CURRENT_TIMESTAMP
                     WHERE COALESCE(voided, false) = false
                       AND (state_department IS NULL OR TRIM(COALESCE(state_department, '')) = '')`,
                    [canonicalDept]
                );
                changed.projectsStateDepartment += p.rowCount || 0;
            } else {
                const fromKey = String(row.stateDepartmentKey).trim();
                const u = await conn.query(
                    `UPDATE users SET state_department = $1, updatedat = CURRENT_TIMESTAMP
                     WHERE COALESCE(voided, false) = false AND TRIM(COALESCE(state_department, '')) = $2`,
                    [canonicalDept, fromKey]
                );
                changed.usersStateDepartment += u.rowCount || 0;

                const s = await conn.query(
                    `UPDATE user_organization_scope SET state_department = $1
                     WHERE scope_type = 'STATE_DEPARTMENT_ALL'
                       AND TRIM(COALESCE(state_department, '')) = $2`,
                    [canonicalDept, fromKey]
                );
                changed.scopesStateDepartment += s.rowCount || 0;

                const p = await conn.query(
                    `UPDATE projects SET state_department = $1, updated_at = CURRENT_TIMESTAMP
                     WHERE COALESCE(voided, false) = false AND TRIM(COALESCE(state_department, '')) = $2`,
                    [canonicalDept, fromKey]
                );
                changed.projectsStateDepartment += p.rowCount || 0;
            }
        }

        await conn.commit();
        return res.status(200).json({ ok: true, changed });
    } catch (error) {
        try {
            await conn.rollback();
        } catch (rollbackError) {
            console.warn('organization-integrity manual-map rollback failed:', rollbackError.message);
        }
        console.error('Error applying manual organization map:', error);
        return res.status(500).json({ message: error.message || 'Failed to apply manual mappings', error: error.message });
    } finally {
        conn.release();
    }
});

module.exports = router;