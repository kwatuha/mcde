const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const orgScope = require('../services/organizationScopeService');

// --- CRUD Operations for users ---

/**
 * @route GET /api/users/users
 * @description Get all users from the users table.
 */
router.get('/users', async (req, res) => {
    try {
        const DB_TYPE = process.env.DB_TYPE || 'mysql';
        let query;
        
        if (DB_TYPE === 'postgresql') {
            // PostgreSQL: base users listing, optionally include phone_number if column exists
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
            // MySQL users listing
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

        res.status(200).json(payload);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ message: 'Error fetching users', error: error.message });
    }
});

/**
 * @route GET /api/users/users/:id
 * @description Get a single user by user_id from the users table.
 */
router.get('/users/:id', async (req, res) => {
    const { id } = req.params;
    try {
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
        ministry, state_department, agency_id, phoneNumber, phone_number,
        organizationScopes: organizationScopesBody,
        organization_scopes: organization_scopes_snake,
    } = req.body;
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

        let insertedUserId;
        if (DB_TYPE === 'postgresql') {
            const insertResult = await pool.query(
                `INSERT INTO users (username, email, passwordhash, firstname, lastname, roleid, id_number, employee_number, ministry, state_department, agency_id, createdat, updatedat, isactive, voided)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $12, false)
                RETURNING userid`,
                [username, email, passwordHash, firstName, lastName, roleId, idNumber || null, employeeNumber || null, ministry || null, state_department || null, agency_id || null, true]
            );
            insertedUserId = insertResult.rows[0].userid;
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
            return res.status(201).json({ ...created, organizationScopes });
        }

        res.status(201).json(created);
    } catch (error) {
        console.error('Error creating user:', error);
        if (error.code === 'ER_DUP_ENTRY' || error.code === '23505') {
            return res.status(400).json({ error: 'User with that username or email already exists.' });
        }
        res.status(500).json({ message: 'Error creating user', error: error.message });
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
    const requesterRole = String(req.user?.roleName || req.user?.role || '').trim().toLowerCase();
    const isSuperAdmin = requesterRole === 'super admin';
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
    
    if (password && password.trim() !== '') {
        const salt = await bcrypt.genSalt(10);
        otherFieldsToUpdate.passwordHash = await bcrypt.hash(password, salt);
    }
    delete otherFieldsToUpdate.userId;

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
                phoneNumber: 'phone_number'
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
        const requesterRole = String(req.user?.roleName || req.user?.role || '').trim().toLowerCase();
        if (requesterRole !== 'super admin') {
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
        const requesterRole = String(req.user?.roleName || req.user?.role || '').trim().toLowerCase();
        if (requesterRole !== 'super admin') {
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
    const { roleName, name, description } = req.body;
    const roleNameValue = roleName || name; // Support both field names

    if (!roleNameValue) {
        return res.status(400).json({ error: 'Role name is required' });
    }

    try {
        const DB_TYPE = process.env.DB_TYPE || 'mysql';
        let insertedRoleId;
        
        if (DB_TYPE === 'postgresql') {
            const insertResult = await pool.query(
                'INSERT INTO roles (name, description, createdat, updatedat, voided) VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, false) RETURNING roleid',
                [roleNameValue, description || null]
            );
            insertedRoleId = insertResult.rows[0].roleid;
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
            return res.status(400).json({ error: 'Role with that name already exists.' });
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

module.exports = router;