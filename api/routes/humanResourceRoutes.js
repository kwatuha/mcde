const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { mapRows } = require('../utils/camelSnakeKeys');

async function pgq(sql, params) {
    const r = await db.query(sql, params || []);
    if (r.rows) r.rows = mapRows(r.rows);
    return r;
}
const notVoided = (alias = '') =>
    `COALESCE(${alias ? `${alias}.` : ''}voided::text, '0') IN ('0', 'false', 'f')`;
const auth = require('../middleware/authenticate');
const privilege = require('../middleware/privilegeMiddleware');
const ExcelJS = require('exceljs');
const puppeteer = require('puppeteer');
const path = require('path');
const { getPuppeteerLaunchOptions } = require('../utils/puppeteerLaunch');

// Helper function to format dates for PostgreSQL / ISO date (YYYY-MM-DD)
const formatDate = (dateString) => {
    if (!dateString) return null;
    try {
        return new Date(dateString).toISOString().slice(0, 10);
    } catch (e) {
        console.error('Invalid date format:', dateString);
        return null;
    }
};

/** MUI forms often send '' for unset Selects; Postgres integer columns reject ''. */
const intOrNull = (v) => {
    if (v === '' || v === undefined || v === null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

/** RHS of `s.department_id = …` — legacy uses "departmentId", HR migration uses department_id */
let departmentsPkJoinMemo;
async function departmentsPkJoinExpr() {
    if (departmentsPkJoinMemo !== undefined) return departmentsPkJoinMemo;
    try {
        const { rows } = await db.query(
            `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'departments'`
        );
        const cols = new Set(rows.map((r) => r.column_name));
        if (cols.size === 0) {
            departmentsPkJoinMemo = 'd."departmentId"';
        } else {
            departmentsPkJoinMemo = cols.has('departmentId') ? 'd."departmentId"' : 'd.department_id';
        }
    } catch (e) {
        console.error('departmentsPkJoinExpr:', e);
        departmentsPkJoinMemo = 'd."departmentId"';
    }
    return departmentsPkJoinMemo;
}

/** job_groups title column: legacy quoted "groupName", some schemas use group_name only */
let jobGroupTitleMemo;
async function jobGroupTitleSelectFragment() {
    if (jobGroupTitleMemo !== undefined) return jobGroupTitleMemo;
    try {
        const { rows } = await db.query(
            `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'job_groups'`
        );
        const cols = new Set(rows.map((r) => r.column_name));
        if (cols.has('groupName')) jobGroupTitleMemo = 'jg."groupName"';
        else if (cols.has('group_name')) jobGroupTitleMemo = 'jg.group_name';
        else jobGroupTitleMemo = 'NULL::text';
    } catch (e) {
        console.error('jobGroupTitleSelectFragment:', e);
        jobGroupTitleMemo = 'NULL::text';
    }
    return jobGroupTitleMemo;
}

function resetHrJoinSchemaMemo() {
    departmentsPkJoinMemo = undefined;
    jobGroupTitleMemo = undefined;
}

// --- Employee Management ---
router.get('/employees', auth, privilege(['employee.read_all', 'hr.access'], { anyOf: true }), async (req, res) => {
    const fallbackSql = `
        SELECT s.*, NULL::text AS department, NULL::text AS title
        FROM staff s
        WHERE ${notVoided('s')}
        ORDER BY s.first_name NULLS LAST, s.last_name NULLS LAST
    `;
    try {
        const dPk = await departmentsPkJoinExpr();
        const jgTitle = await jobGroupTitleSelectFragment();
        const sql = `
            SELECT
                s.*,
                d.name AS department,
                ${jgTitle} AS title
            FROM staff s
            LEFT JOIN departments d ON s.department_id = ${dPk} AND ${notVoided('d')}
            LEFT JOIN job_groups jg ON s.job_group_id = jg.id
            WHERE ${notVoided('s')}
            ORDER BY s.first_name NULLS LAST, s.last_name NULLS LAST
        `;
        try {
            const { rows } = await pgq(sql);
            return res.json(rows);
        } catch (joinErr) {
            console.error('GET /hr/employees joined query failed, retrying staff-only:', joinErr.message);
            resetHrJoinSchemaMemo();
            const { rows } = await pgq(fallbackSql);
            return res.json(rows);
        }
    } catch (err) {
        console.error('Error fetching employees:', err);
        res.status(500).json({ message: err.message || 'Error fetching employees' });
    }
});

// NEW: Export employees to Excel
router.post('/export/employees-excel', auth, privilege(['employee.read_all', 'hr.access'], { anyOf: true }), async (req, res) => {
    try {
        const { headers } = req.body;
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Employees');

        const dPk = await departmentsPkJoinExpr();
        const jgTitle = await jobGroupTitleSelectFragment();
        const sql = `
            SELECT
                s.*,
                d.name AS department,
                ${jgTitle} AS title,
                CONCAT(m.first_name, ' ', m.last_name) AS manager_name
            FROM staff s
            LEFT JOIN departments d ON s.department_id = ${dPk} AND ${notVoided('d')}
            LEFT JOIN job_groups jg ON s.job_group_id = jg.id
            LEFT JOIN staff m ON s.manager_id = m.staff_id
            WHERE ${notVoided('s')}
            ORDER BY s.first_name, s.last_name
        `;
        let employees;
        try {
            ({ rows: employees } = await pgq(sql));
        } catch (e) {
            console.error('employees-excel joined query failed, staff-only fallback:', e.message);
            resetHrJoinSchemaMemo();
            ({ rows: employees } = await pgq(`
                SELECT s.*, NULL::text AS department, NULL::text AS title,
                    CONCAT(m.first_name, ' ', m.last_name) AS manager_name
                FROM staff s
                LEFT JOIN staff m ON s.manager_id = m.staff_id
                WHERE ${notVoided('s')}
                ORDER BY s.first_name, s.last_name
            `));
        }

        const columns = Object.keys(headers).map(key => ({
            header: headers[key],
            key,
            width: 25
        }));
        worksheet.columns = columns;

        employees.forEach(emp => {
            const rowData = {};
            rowData.manager = emp.managerName || emp.manager_name || 'N/A';
            Object.keys(emp).forEach(key => {
                rowData[key] = emp[key];
            });
            worksheet.addRow(rowData);
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=employees_export.xlsx');
        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error('Error exporting employees to Excel:', err);
        res.status(500).send('Error exporting employees to Excel');
    }
});

// NEW: Export employees to PDF
router.post(
    '/export/employees-pdf',
    auth,
    privilege(['employee.read_all', 'hr.access'], { anyOf: true }),
    async (req, res) => {
        let browser;
        try {
            const { tableHtml } = req.body;
            if (!tableHtml || typeof tableHtml !== 'string') {
                return res.status(400).json({ message: 'tableHtml is required.' });
            }

            browser = await puppeteer.launch(getPuppeteerLaunchOptions());
            const page = await browser.newPage();
            // Full document + domcontentloaded: networkidle0 often hangs or times out on static HTML (no network).
            const wrappedHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Employees</title>
</head>
<body>
${tableHtml}
</body>
</html>`;
            await page.setContent(wrappedHtml, { waitUntil: 'domcontentloaded', timeout: 45000 });
            const pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true,
                margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
            });

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename=employees_report.pdf');
            res.send(pdfBuffer);
        } catch (err) {
            console.error('Error exporting employees to PDF:', err);
            res.status(500).json({ message: err.message || 'Error exporting employees to PDF' });
        } finally {
            if (browser) {
                try {
                    await browser.close();
                } catch (closeErr) {
                    console.warn('employees-pdf: browser.close failed:', closeErr.message);
                }
            }
        }
    }
);

router.post('/employees', auth, privilege(['employee.create']), async (req, res) => {
    const { firstName, lastName, email, phoneNumber, departmentId, jobGroupId, gender, dateOfBirth, employmentStatus, startDate, emergencyContactName, emergencyContactRelationship, emergencyContactPhone, nationality, maritalStatus, employmentType, managerId, role, placeOfBirth, bloodType, religion, nationalId, kraPin, userId } = req.body;
    
    const sql = `
        INSERT INTO staff (
            first_name, last_name, email, phone_number, department_id, job_group_id, gender, date_of_birth, employment_status, start_date, emergency_contact_name,
            emergency_contact_relationship, emergency_contact_phone, nationality, marital_status, employment_type, manager_id, role, place_of_birth, blood_type, religion,
            national_id, kra_pin, user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING staff_id
    `;
    
    try {
        const result = await pgq(sql, [
            firstName, lastName, email, phoneNumber, intOrNull(departmentId), intOrNull(jobGroupId), gender, formatDate(dateOfBirth), employmentStatus, formatDate(startDate),
            emergencyContactName, emergencyContactRelationship, emergencyContactPhone, nationality, maritalStatus, employmentType, intOrNull(managerId), role ?? null,
            placeOfBirth, bloodType, religion, nationalId, kraPin, intOrNull(userId)
        ]);
        res.status(201).json({ staffId: result.rows[0].staffId, message: 'Employee added successfully' });
    } catch (err) {
        console.error('Error adding employee:', err);
        res.status(500).json({ message: err.message || 'Error adding employee' });
    }
});

router.put('/employees/:id', auth, privilege(['employee.update']), async (req, res) => {
    const { id } = req.params;
    const { firstName, lastName, email, phoneNumber, departmentId, jobGroupId, gender, dateOfBirth, employmentStatus, startDate, emergencyContactName, emergencyContactRelationship, emergencyContactPhone, nationality, maritalStatus, employmentType, managerId, role, placeOfBirth, bloodType, religion, nationalId, kraPin, userId } = req.body;
    
    const sql = `
        UPDATE staff SET
            first_name = ?, last_name = ?, email = ?, phone_number = ?, department_id = ?, job_group_id = ?, gender = ?, date_of_birth = ?, employment_status = ?,
            start_date = ?, emergency_contact_name = ?, emergency_contact_relationship = ?, emergency_contact_phone = ?, nationality = ?, marital_status = ?,
            employment_type = ?, manager_id = ?, role = ?, place_of_birth = ?, blood_type = ?, religion = ?, national_id = ?, kra_pin = ?, user_id = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE staff_id = ?
    `;
    
    try {
        const result = await pgq(sql, [
            firstName, lastName, email, phoneNumber, intOrNull(departmentId), intOrNull(jobGroupId), gender, formatDate(dateOfBirth), employmentStatus, formatDate(startDate),
            emergencyContactName, emergencyContactRelationship, emergencyContactPhone, nationality, maritalStatus, employmentType, intOrNull(managerId), role ?? null,
            placeOfBirth, bloodType, religion, nationalId, kraPin, intOrNull(userId), id
        ]);
        
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Employee not found.' });
        }
        res.status(200).json({ message: 'Employee updated successfully' });
    } catch (err) {
        console.error('Error updating employee:', err);
        res.status(500).json({ message: err.message || 'Error updating employee' });
    }
});

router.delete('/employees/:id', auth, privilege(['employee.delete']), async (req, res) => {
    const { id } = req.params;
    const sql = 'UPDATE staff SET voided = 1, updated_at = CURRENT_TIMESTAMP WHERE staff_id = ?';
    try {
        const result = await pgq(sql, [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Employee not found.' });
        }
        res.status(200).json({ message: 'Employee deleted successfully' });
    } catch (err) {
        console.error('Error deleting employee:', err);
        res.status(500).send('Error deleting employee');
    }
});

// --- Employee 360 View ---
router.get('/employees/:id/360', auth, privilege(['employee.read_all', 'employee.read_360']), async (req, res) => {
    const { id } = req.params;
    try {
        const dPk = await departmentsPkJoinExpr();
        const jgTitle = await jobGroupTitleSelectFragment();
        const sql = `
            SELECT
                s.*,
                d.name AS department_name,
                ${jgTitle} AS job_group_name
            FROM staff s
            LEFT JOIN departments d ON s.department_id = ${dPk} AND ${notVoided('d')}
            LEFT JOIN job_groups jg ON s.job_group_id = jg.id
            WHERE s.staff_id = ? AND ${notVoided('s')}
        `;
        let employeeRows;
        try {
            ({ rows: employeeRows } = await pgq(sql, [id]));
        } catch (e) {
            console.error('employee 360 profile joined query failed, fallback:', e.message);
            resetHrJoinSchemaMemo();
            ({ rows: employeeRows } = await pgq(
                `SELECT s.*, NULL::text AS department_name, NULL::text AS job_group_name
                 FROM staff s WHERE s.staff_id = ? AND ${notVoided('s')}`,
                [id]
            ));
        }

        if (employeeRows.length === 0) {
            return res.status(404).json({ message: 'Employee not found.' });
        }
        const profile = employeeRows[0];

        const dataPromises = [
            pgq('SELECT * FROM employee_performance WHERE staff_id = ? AND voided = 0 ORDER BY review_date DESC', [id]),
            pgq('SELECT * FROM employee_compensation WHERE staff_id = ? AND voided = 0', [id]),
            pgq('SELECT * FROM employee_training WHERE staff_id = ? AND voided = 0 ORDER BY completion_date DESC', [id]),
            pgq('SELECT * FROM employee_disciplinary WHERE staff_id = ? AND voided = 0 ORDER BY action_date DESC', [id]),
            pgq('SELECT * FROM employee_contracts WHERE staff_id = ? AND voided = 0 ORDER BY contract_start_date DESC', [id]),
            pgq('SELECT * FROM employee_retirements WHERE staff_id = ? AND voided = 0', [id]),
            pgq('SELECT * FROM employee_loans WHERE staff_id = ? AND voided = 0', [id]),
            pgq('SELECT * FROM monthly_payroll WHERE staff_id = ? AND voided = 0 ORDER BY pay_period DESC', [id]),
            pgq('SELECT * FROM employee_dependants WHERE staff_id = ? AND voided = 0', [id]),
            pgq('SELECT * FROM employee_terminations WHERE staff_id = ? AND voided = 0', [id]),
            pgq('SELECT * FROM employee_bank_details WHERE staff_id = ? AND voided = 0', [id]),
            pgq('SELECT * FROM employee_memberships WHERE staff_id = ? AND voided = 0', [id]),
            pgq('SELECT * FROM employee_benefits WHERE staff_id = ? AND voided = 0', [id]),
            pgq('SELECT * FROM assigned_assets WHERE staff_id = ? AND voided = 0', [id]),
            pgq('SELECT * FROM employee_promotions WHERE staff_id = ? AND voided = 0 ORDER BY promotion_date DESC', [id]),
            pgq('SELECT * FROM employee_project_assignments WHERE staff_id = ? AND voided = 0', [id]),
            pgq(`
                SELECT
                    la.*,
                    lt.name as leave_type_name,
                    hs.first_name AS handover_first_name,
                    hs.last_name AS handover_last_name
                FROM leave_applications la
                JOIN leave_types lt ON la.leave_type_id = lt.id AND ${notVoided('lt')}
                LEFT JOIN staff hs ON la.handover_staff_id = hs.staff_id
                WHERE la.staff_id = ? AND ${notVoided('la')}
                ORDER BY la.start_date DESC
            `, [id]),
            pgq(`SELECT * FROM job_groups WHERE ${notVoided()}`)
        ];

        const results = await Promise.all(dataPromises);

        res.json({
            profile: profile,
            performanceReviews: results[0].rows,
            compensations: results[1].rows,
            trainings: results[2].rows,
            disciplinaries: results[3].rows,
            contracts: results[4].rows,
            retirements: results[5].rows,
            loans: results[6].rows,
            payrolls: results[7].rows,
            dependants: results[8].rows,
            terminations: results[9].rows,
            bankDetails: results[10].rows,
            memberships: results[11].rows,
            benefits: results[12].rows,
            assignedAssets: results[13].rows,
            promotions: results[14].rows,
            projectAssignments: results[15].rows,
            leaveApplications: results[16].rows,
            jobGroups: results[17].rows,
        });

    } catch (err) {
        console.error('Error fetching employee 360 view:', err);
        res.status(500).send('Error fetching employee 360 view');
    }
});

// --- Performance Management ---
router.post('/employees/performance', auth, privilege(['employee.performance.create']), async (req, res) => {
    const { staffId, reviewDate, reviewScore, comments, reviewerId } = req.body;
    try {
        const result = await pgq('INSERT INTO employee_performance (staff_id, review_date, review_score, comments, reviewer_id) VALUES (?, ?, ?, ?, ?) RETURNING id', [staffId, formatDate(reviewDate), reviewScore, comments, reviewerId]);
        res.status(201).json({ id: result.rows[0].id, message: 'Performance review added successfully' });
    } catch (err) {
        console.error('Error adding performance review:', err);
        res.status(500).send('Error adding performance review');
    }
});

router.put('/employees/performance/:id', auth, privilege(['employee.performance.update']), async (req, res) => {
    const { id } = req.params;
    const { reviewDate, reviewScore, comments, reviewerId } = req.body;
    const sql = 'UPDATE employee_performance SET review_date = ?, review_score = ?, comments = ?, reviewer_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
    try {
        const result = await pgq(sql, [formatDate(reviewDate), reviewScore, comments, reviewerId, id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Performance review not found.' });
        }
        res.status(200).json({ message: 'Performance review updated successfully' });
    } catch (err) {
        console.error('Error updating performance review:', err);
        res.status(500).send('Error updating performance review');
    }
});

router.delete('/employees/performance/:id', auth, privilege(['employee.performance.delete']), async (req, res) => {
    const { id } = req.params;
    const sql = 'UPDATE employee_performance SET voided = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
    try {
        const result = await pgq(sql, [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Performance review not found.' });
        }
        res.status(200).json({ message: 'Performance review deleted successfully' });
    } catch (err) {
        console.error('Error deleting performance review:', err);
        res.status(500).send('Error deleting performance review');
    }
});

// --- Leave Types Management ---
router.get('/leave-types', async (req, res) => {
    try {
        const { rows } = await pgq(`SELECT * FROM leave_types WHERE ${notVoided()}`);
        res.json(rows);
    } catch (err) {
        console.error('Error fetching leave types:', err);
        res.status(500).send('Error fetching leave types');
    }
});

router.post('/leave-types', auth, privilege(['leave.type.create']), async (req, res) => {
    const { name, description, numberOfDays, userId } = req.body;
    try {
        const result = await pgq('INSERT INTO leave_types (name, description, number_of_days, user_id) VALUES (?, ?, ?, ?) RETURNING id', [name, description, numberOfDays, userId]);
        res.status(201).json({ id: result.rows[0].id, message: 'Leave type added successfully' });
    } catch (err) {
        console.error('Error adding leave type:', err);
        res.status(500).send('Error adding leave type');
    }
});

router.put('/leave-types/:id', auth, privilege(['leave.type.update']), async (req, res) => {
    const { id } = req.params;
    const { name, description, numberOfDays, userId } = req.body;
    const sql = 'UPDATE leave_types SET name = ?, description = ?, number_of_days = ?, user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
    try {
        const result = await pgq(sql, [name, description, numberOfDays, userId, id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Leave type not found.' });
        }
        res.status(200).json({ message: 'Leave type updated successfully' });
    } catch (err) {
        console.error('Error updating leave type:', err);
        res.status(500).send('Error updating leave type');
    }
});

router.delete('/leave-types/:id', auth, privilege(['leave.type.delete']), async (req, res) => {
    const { id } = req.params;
    const sql = 'UPDATE leave_types SET voided = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
    try {
        const result = await pgq(sql, [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Leave type not found.' });
        }
        res.status(200).json({ message: 'Leave type deleted successfully' });
    } catch (err) {
        console.error('Error deleting leave type:', err);
        res.status(500).send('Error deleting leave type');
    }
});


// --- Leave Application Management ---
router.get('/leave-applications', auth, privilege(['leave.read_all']), async (req, res) => {
    const sql = `
        SELECT la.id, la.staff_id, la.leave_type_id, la.handover_staff_id, la.start_date, la.end_date, la.number_of_days, la.reason, la.handover_comments, la.status, la.approved_start_date, la.approved_end_date, la.actual_return_date, s.first_name, s.last_name, lt.name AS leave_type_name, hs.first_name AS handover_first_name, hs.last_name AS handover_last_name
        FROM leave_applications la
        JOIN staff s ON la.staff_id = s.staff_id AND ${notVoided('s')}
        JOIN leave_types lt ON la.leave_type_id = lt.id AND ${notVoided('lt')}
        LEFT JOIN staff hs ON la.handover_staff_id = hs.staff_id
        WHERE ${notVoided('la')}
        ORDER BY la.created_at DESC
    `;
    try {
        const { rows } = await pgq(sql);
        res.json(rows);
    } catch (err) {
        console.error('Error fetching leave applications:', err);
        res.status(500).json({ message: err.message || 'Error fetching leave applications' });
    }
});

router.post('/leave-applications', auth, privilege(['leave.apply']), async (req, res) => {
    const { staffId, leaveTypeId, startDate, endDate, numberOfDays, reason, handoverStaffId, handoverComments, userId } = req.body;
    const sid = intOrNull(staffId);
    const lid = intOrNull(leaveTypeId);
    const sd = formatDate(startDate);
    const ed = formatDate(endDate);
    if (sid == null || lid == null) {
        return res.status(400).json({ message: 'staffId and leaveTypeId are required.' });
    }
    if (!sd || !ed) {
        return res.status(400).json({ message: 'startDate and endDate are required.' });
    }
    const days =
        numberOfDays === '' || numberOfDays === undefined || numberOfDays === null
            ? null
            : Number(numberOfDays);
    const daysParam = Number.isFinite(days) ? days : null;
    const sql =
        'INSERT INTO leave_applications (staff_id, leave_type_id, start_date, end_date, number_of_days, reason, handover_staff_id, handover_comments, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id';
    try {
        const result = await pgq(sql, [
            sid,
            lid,
            sd,
            ed,
            daysParam,
            reason ?? null,
            intOrNull(handoverStaffId),
            handoverComments ?? null,
            intOrNull(userId),
        ]);
        res.status(201).json({ id: result.rows[0].id, message: 'Leave application submitted' });
    } catch (err) {
        console.error('Error submitting leave application:', err);
        res.status(500).json({ message: err.message || 'Error submitting leave application' });
    }
});

router.put('/leave-applications/:id', auth, privilege(['leave.approve']), async (req, res) => {
    const { status, approvedStartDate, approvedEndDate, userId } = req.body;
    const { id } = req.params;

    let sql, params;
    if (status === 'Approved') {
        sql = 'UPDATE leave_applications SET status = ?, approved_start_date = ?, approved_end_date = ?, user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
        params = [status, formatDate(approvedStartDate), formatDate(approvedEndDate), intOrNull(userId), id];
    } else {
        sql = 'UPDATE leave_applications SET status = ?, user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
        params = [status, intOrNull(userId), id];
    }

    try {
        await pgq(sql, params);
        res.status(200).json({ message: 'Leave status updated successfully' });
    } catch (err) {
        console.error('Error updating leave status:', err);
        res.status(500).send('Error updating leave status');
    }
});

router.put('/leave-applications/:id/edit', auth, privilege(['leave.update']), async (req, res) => {
    const { staffId, leaveTypeId, startDate, endDate, numberOfDays, reason, handoverStaffId, handoverComments, userId } = req.body;
    const { id } = req.params;
    const days =
        numberOfDays === '' || numberOfDays === undefined || numberOfDays === null
            ? null
            : Number(numberOfDays);
    const daysParam = Number.isFinite(days) ? days : null;
    const sql = 'UPDATE leave_applications SET staff_id = ?, leave_type_id = ?, start_date = ?, end_date = ?, number_of_days = ?, reason = ?, handover_staff_id = ?, handover_comments = ?, user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
    try {
        const result = await pgq(sql, [
            intOrNull(staffId),
            intOrNull(leaveTypeId),
            formatDate(startDate),
            formatDate(endDate),
            daysParam,
            reason ?? null,
            intOrNull(handoverStaffId),
            handoverComments ?? null,
            intOrNull(userId),
            id,
        ]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Leave application not found.' });
        }
        res.status(200).json({ message: 'Leave application updated successfully' });
    } catch (err) {
        console.error('Error updating leave application:', err);
        res.status(500).json({ message: err.message || 'Error updating leave application' });
    }
});

router.put('/leave-applications/:id/return', auth, privilege(['leave.complete']), async (req, res) => {
    const { actualReturnDate, userId } = req.body;
    const { id } = req.params;
    const sql = "UPDATE leave_applications SET actual_return_date = ?, status = 'Completed', user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?";
    try {
        await pgq(sql, [formatDate(actualReturnDate), intOrNull(userId), id]);
        res.status(200).json({ message: 'Actual return date recorded successfully' });
    } catch (err) {
        console.error('Error recording actual return date:', err);
        res.status(500).send('Error recording actual return date');
    }
});

router.delete('/leave-applications/:id', auth, privilege(['leave.delete']), async (req, res) => {
    const { id } = req.params;
    const sql = 'UPDATE leave_applications SET voided = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
    try {
        const result = await pgq(sql, [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Leave application not found.' });
        }
        res.status(200).json({ message: 'Leave application deleted successfully' });
    } catch (err) {
        console.error('Error deleting leave application:', err);
        res.status(500).send('Error deleting leave application');
    }
});


// --- Attendance Management ---
router.get('/attendance/today', auth, privilege(['attendance.read_all']), async (req, res) => {
    const sql = `
        SELECT id, staff_id, date, check_in_time, check_out_time, user_id, created_at, updated_at FROM attendance
        WHERE date = CURRENT_DATE AND voided = 0 ORDER BY check_in_time DESC
    `;
    try {
        const { rows } = await pgq(sql);
        res.json(rows);
    } catch (err) {
        console.error("Error fetching today's attendance:", err);
        res.status(500).send("Error fetching today's attendance");
    }
});

router.post('/attendance/check-in', auth, privilege(['attendance.create']), async (req, res) => {
    const { staffId, userId } = req.body;
    try {
        const result = await pgq('INSERT INTO attendance (staff_id, date, check_in_time, user_id) VALUES (?, CURRENT_DATE, NOW(), ?) RETURNING id', [staffId, userId]);
        res.status(201).json({ id: result.rows[0].id, message: 'Check-in recorded successfully' });
    } catch (err) {
        console.error('Error recording check-in:', err);
        res.status(500).send('Error recording check-in');
    }
});

router.put('/attendance/check-out/:id', auth, privilege(['attendance.create']), async (req, res) => {
    const { id } = req.params;
    const { userId } = req.body;
    try {
        const result = await pgq('UPDATE attendance SET check_out_time = NOW(), user_id = ?, updated_at = NOW() WHERE id = ?', [userId, id]);
        if (result.rowCount === 0) {
            return res.status(404).send('Attendance record not found.');
        }
        res.status(200).json({ message: 'Check-out recorded successfully' });
    } catch (err) {
        console.error('Error recording check-out:', err);
        res.status(500).send('Error recording check-out');
    }
});

// --- Employee Compensation ---
router.post('/employee-compensation', auth, privilege(['compensation.create']), async (req, res) => {
    const { staffId, baseSalary, allowances, bonuses, bankName, accountNumber, payFrequency, userId } = req.body;
    try {
        const result = await pgq('INSERT INTO employee_compensation (staff_id, base_salary, allowances, bonuses, bank_name, account_number, pay_frequency, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id', [staffId, baseSalary, allowances, bonuses, bankName, accountNumber, payFrequency, userId]);
        res.status(201).json({ id: result.rows[0].id, message: 'Compensation record added successfully' });
    } catch (err) {
        console.error('Error adding compensation record:', err);
        res.status(500).send('Error adding compensation record');
    }
});

router.put('/employee-compensation/:id', auth, privilege(['compensation.update']), async (req, res) => {
    const { id } = req.params;
    const { staffId, baseSalary, allowances, bonuses, bankName, accountNumber, payFrequency, userId } = req.body;
    try {
        const result = await pgq('UPDATE employee_compensation SET staff_id = ?, base_salary = ?, allowances = ?, bonuses = ?, bank_name = ?, account_number = ?, pay_frequency = ?, user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [staffId, baseSalary, allowances, bonuses, bankName, accountNumber, payFrequency, userId, id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Compensation record not found.' });
        }
        res.status(200).json({ message: 'Compensation record updated successfully' });
    } catch (err) {
        console.error('Error updating compensation record:', err);
        res.status(500).send('Error updating compensation record');
    }
});

router.delete('/employee-compensation/:id', auth, privilege(['compensation.delete']), async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pgq('UPDATE employee_compensation SET voided = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Compensation record not found.' });
        }
        res.status(200).json({ message: 'Compensation record deleted successfully' });
    } catch (err) {
        console.error('Error deleting compensation record:', err);
        res.status(500).send('Error deleting compensation record');
    }
});

// --- Employee Training ---
router.post('/employee-training', auth, privilege(['training.create']), async (req, res) => {
    const { staffId, courseName, institution, certificationName, completionDate, expiryDate, userId } = req.body;
    try {
        const result = await pgq('INSERT INTO employee_training (staff_id, course_name, institution, certification_name, completion_date, expiry_date, user_id) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id', [staffId, courseName, institution, certificationName, formatDate(completionDate), formatDate(expiryDate), userId]);
        res.status(201).json({ id: result.rows[0].id, message: 'Training record added successfully' });
    } catch (err) {
        console.error('Error adding training record:', err);
        res.status(500).send('Error adding training record');
    }
});

router.put('/employee-training/:id', auth, privilege(['training.update']), async (req, res) => {
    const { id } = req.params;
    const { staffId, courseName, institution, certificationName, completionDate, expiryDate, userId } = req.body;
    try {
        const result = await pgq('UPDATE employee_training SET staff_id = ?, course_name = ?, institution = ?, certification_name = ?, completion_date = ?, expiry_date = ?, user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [staffId, courseName, institution, certificationName, formatDate(completionDate), formatDate(expiryDate), userId, id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Training record not found.' });
        }
        res.status(200).json({ message: 'Training record updated successfully' });
    } catch (err) {
        console.error('Error updating training record:', err);
        res.status(500).send('Error updating training record');
    }
});

router.delete('/employee-training/:id', auth, privilege(['training.delete']), async (req, res) => {
    const { id } = req.params;
    const sql = 'UPDATE employee_training SET voided = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
    try {
        const result = await pgq(sql, [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Training record not found.' });
        }
        res.status(200).json({ message: 'Training record deleted successfully' });
    } catch (err) {
        console.error('Error deleting training record:', err);
        res.status(500).send('Error deleting training record');
    }
});

// --- Job Groups ---
router.get('/job-groups', auth, privilege(['job_group.read_all']), async (req, res) => {
    try {
        const { rows } = await pgq(`SELECT * FROM job_groups WHERE ${notVoided()}`);
        res.json(rows);
    } catch (err) {
        console.error('Error fetching job groups:', err);
        res.status(500).send('Error fetching job groups');
    }
});

router.post('/job-groups', auth, privilege(['job_group.create']), async (req, res) => {
    const { groupName, salaryScale, description, userId } = req.body;
    const scale =
        salaryScale === '' || salaryScale === undefined || salaryScale === null
            ? null
            : Number(salaryScale);
    const salaryParam = Number.isFinite(scale) ? scale : null;
    try {
        // Legacy DBs define id INTEGER NOT NULL without SERIAL/default; supply next id explicitly.
        const result = await pgq(
            `INSERT INTO job_groups (id, "groupName", "salaryScale", description, "userId")
             SELECT COALESCE((SELECT MAX(id) FROM job_groups), 0) + 1, ?, ?, ?, ?
             RETURNING id`,
            [groupName, salaryParam, description ?? null, userId ?? null]
        );
        res.status(201).json({ id: result.rows[0].id, message: 'Job group added successfully' });
    } catch (err) {
        console.error('Error adding job group:', err);
        res.status(500).json({ message: err.message || 'Error adding job group' });
    }
});

router.put('/job-groups/:id', auth, privilege(['job_group.update']), async (req, res) => {
    const { id } = req.params;
    const { groupName, salaryScale, description, userId } = req.body;
    try {
        const result = await pgq(
            'UPDATE job_groups SET "groupName" = ?, "salaryScale" = ?, description = ?, "userId" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ?',
            [groupName, salaryScale, description ?? null, userId ?? null, id]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Job group not found.' });
        }
        res.status(200).json({ message: 'Job group updated successfully' });
    } catch (err) {
        console.error('Error updating job group:', err);
        res.status(500).json({ message: err.message || 'Error updating job group' });
    }
});

router.delete('/job-groups/:id', auth, privilege(['job_group.delete']), async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pgq('UPDATE job_groups SET voided = 1 WHERE id = ?', [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Job group not found.' });
        }
        res.status(200).json({ message: 'Job group deleted successfully' });
    } catch (err) {
        console.error('Error deleting job group:', err);
        res.status(500).send('Error deleting job group');
    }
});

// --- Employee Promotions ---
router.post('/employee-promotions', auth, privilege(['promotion.create']), async (req, res) => {
    const { staffId, oldJobGroupId, newJobGroupId, promotionDate, comments, userId } = req.body;
    try {
        const result = await pgq('INSERT INTO employee_promotions (staff_id, old_job_group_id, new_job_group_id, promotion_date, comments, user_id) VALUES (?, ?, ?, ?, ?, ?) RETURNING id', [staffId, oldJobGroupId, newJobGroupId, formatDate(promotionDate), comments, userId]);
        res.status(201).json({ id: result.rows[0].id, message: 'Promotion record added successfully' });
    } catch (err) {
        console.error('Error adding promotion record:', err);
        res.status(500).send('Error adding promotion record');
    }
});

router.put('/employee-promotions/:id', auth, privilege(['promotion.update']), async (req, res) => {
    const { id } = req.params;
    const { staffId, oldJobGroupId, newJobGroupId, promotionDate, comments, userId } = req.body;
    try {
        const result = await pgq('UPDATE employee_promotions SET staff_id = ?, old_job_group_id = ?, new_job_group_id = ?, promotion_date = ?, comments = ?, user_id = ? WHERE id = ?', [staffId, oldJobGroupId, newJobGroupId, formatDate(promotionDate), comments, userId, id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Promotion record not found.' });
        }
        res.status(200).json({ message: 'Promotion record updated successfully' });
    } catch (err) {
        console.error('Error updating promotion record:', err);
        res.status(500).send('Error updating promotion record');
    }
});

router.delete('/employee-promotions/:id', auth, privilege(['promotion.delete']), async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pgq('UPDATE employee_promotions SET voided = 1 WHERE id = ?', [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Promotion record not found.' });
        }
        res.status(200).json({ message: 'Promotion record deleted successfully' });
    } catch (err) {
        console.error('Error deleting promotion record:', err);
        res.status(500).send('Error deleting promotion record');
    }
});

// --- Employee Disciplinary ---
router.post('/employee-disciplinary', auth, privilege(['disciplinary.create']), async (req, res) => {
    const { staffId, actionType, actionDate, reason, comments, userId } = req.body;
    try {
        const result = await pgq('INSERT INTO employee_disciplinary (staff_id, action_type, action_date, reason, comments, user_id) VALUES (?, ?, ?, ?, ?, ?) RETURNING id', [staffId, actionType, formatDate(actionDate), reason, comments, userId]);
        res.status(201).json({ id: result.rows[0].id, message: 'Disciplinary action added successfully' });
    } catch (err) {
        console.error('Error adding disciplinary action:', err);
        res.status(500).send('Error adding disciplinary action');
    }
});

router.put('/employee-disciplinary/:id', auth, privilege(['disciplinary.update']), async (req, res) => {
    const { id } = req.params;
    const { staffId, actionType, actionDate, reason, comments, userId } = req.body;
    try {
        const result = await pgq('UPDATE employee_disciplinary SET staff_id = ?, action_type = ?, action_date = ?, reason = ?, comments = ?, user_id = ? WHERE id = ?', [staffId, actionType, formatDate(actionDate), reason, comments, userId, id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Disciplinary record not found.' });
        }
        res.status(200).json({ message: 'Disciplinary action updated successfully' });
    } catch (err) {
        console.error('Error updating disciplinary action:', err);
        res.status(500).send('Error updating disciplinary action');
    }
});

router.delete('/employee-disciplinary/:id', auth, privilege(['disciplinary.delete']), async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pgq('UPDATE employee_disciplinary SET voided = 1 WHERE id = ?', [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Disciplinary record not found.' });
        }
        res.status(200).json({ message: 'Disciplinary action deleted successfully' });
    } catch (err) {
        console.error('Error deleting disciplinary action:', err);
        res.status(500).send('Error deleting disciplinary action');
    }
});

// --- Employee Contracts ---
router.post('/employee-contracts', auth, privilege(['contracts.create']), async (req, res) => {
    const { staffId, contractType, contractStartDate, contractEndDate, status, userId } = req.body;
    try {
        const result = await pgq('INSERT INTO employee_contracts (staff_id, contract_type, contract_start_date, contract_end_date, status, user_id) VALUES (?, ?, ?, ?, ?, ?) RETURNING id', [staffId, contractType, formatDate(contractStartDate), formatDate(contractEndDate), status, userId]);
        res.status(201).json({ id: result.rows[0].id, message: 'Contract added successfully' });
    } catch (err) {
        console.error('Error adding contract:', err);
        res.status(500).send('Error adding contract');
    }
});

router.put('/employee-contracts/:id', auth, privilege(['contracts.update']), async (req, res) => {
    const { id } = req.params;
    const { staffId, contractType, contractStartDate, contractEndDate, status, userId } = req.body;
    try {
        const result = await pgq('UPDATE employee_contracts SET staff_id = ?, contract_type = ?, contract_start_date = ?, contract_end_date = ?, status = ?, user_id = ? WHERE id = ?', [staffId, contractType, formatDate(contractStartDate), formatDate(contractEndDate), status, userId, id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Contract not found.' });
        }
        res.status(200).json({ message: 'Contract updated successfully' });
    } catch (err) {
        console.error('Error updating contract:', err);
        res.status(500).send('Error updating contract');
    }
});

router.delete('/employee-contracts/:id', auth, privilege(['contracts.delete']), async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pgq('UPDATE employee_contracts SET voided = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Contract not found.' });
        }
        res.status(200).json({ message: 'Contract deleted successfully' });
    } catch (err) {
        console.error('Error deleting contract:', err);
        res.status(500).send('Error deleting contract');
    }
});

// --- Employee Retirements ---
router.post('/employee-retirements', auth, privilege(['retirements.create']), async (req, res) => {
    const { staffId, retirementDate, retirementType, comments, userId } = req.body;
    try {
        const result = await pgq('INSERT INTO employee_retirements (staff_id, retirement_date, retirement_type, comments, user_id) VALUES (?, ?, ?, ?, ?) RETURNING id', [staffId, formatDate(retirementDate), retirementType, comments, userId]);
        res.status(201).json({ id: result.rows[0].id, message: 'Retirement record added successfully' });
    } catch (err) {
        console.error('Error adding retirement record:', err);
        res.status(500).send('Error adding retirement record');
    }
});

router.put('/employee-retirements/:id', auth, privilege(['retirements.update']), async (req, res) => {
    const { id } = req.params;
    const { staffId, retirementDate, retirementType, comments, userId } = req.body;
    try {
        const result = await pgq('UPDATE employee_retirements SET staff_id = ?, retirement_date = ?, retirement_type = ?, comments = ?, user_id = ? WHERE id = ?', [staffId, formatDate(retirementDate), retirementType, comments, userId, id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Retirement record not found.' });
        }
        res.status(200).json({ message: 'Retirement record updated successfully' });
    } catch (err) {
        console.error('Error updating retirement record:', err);
        res.status(500).send('Error updating retirement record');
    }
});

router.delete('/employee-retirements/:id', auth, privilege(['retirements.delete']), async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pgq('UPDATE employee_retirements SET voided = 1 WHERE id = ?', [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Retirement record not found.' });
        }
        res.status(200).json({ message: 'Retirement record deleted successfully' });
    } catch (err) {
        console.error('Error deleting retirement record:', err);
        res.status(500).send('Error deleting retirement record');
    }
});

// --- Employee Loans ---
router.post('/employee-loans', auth, privilege(['loans.create']), async (req, res) => {
    const { staffId, loanAmount, loanDate, status, repaymentSchedule, userId } = req.body;
    try {
        const result = await pgq('INSERT INTO employee_loans (staff_id, loan_amount, loan_date, status, repayment_schedule, user_id) VALUES (?, ?, ?, ?, ?, ?) RETURNING id', [staffId, loanAmount, formatDate(loanDate), status, repaymentSchedule, userId]);
        res.status(201).json({ id: result.rows[0].id, message: 'Loan record added successfully' });
    } catch (err) {
        console.error('Error adding loan record:', err);
        res.status(500).send('Error adding loan record');
    }
});

router.put('/employee-loans/:id', auth, privilege(['loans.update']), async (req, res) => {
    const { id } = req.params;
    const { staffId, loanAmount, loanDate, status, repaymentSchedule, userId } = req.body;
    try {
        const result = await pgq('UPDATE employee_loans SET staff_id = ?, loan_amount = ?, loan_date = ?, status = ?, repayment_schedule = ?, user_id = ? WHERE id = ?', [staffId, loanAmount, formatDate(loanDate), status, repaymentSchedule, userId, id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Loan record not found.' });
        }
        res.status(200).json({ message: 'Loan record updated successfully' });
    } catch (err) {
        console.error('Error updating loan record:', err);
        res.status(500).send('Error updating loan record');
    }
});

router.delete('/employee-loans/:id', auth, privilege(['loans.delete']), async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pgq('UPDATE employee_loans SET voided = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Loan record not found.' });
        }
        res.status(200).json({ message: 'Loan record deleted successfully' });
    } catch (err) {
        console.error('Error deleting loan record:', err);
        res.status(500).send('Error deleting loan record');
    }
});

// --- Monthly Payroll ---
router.post('/monthly-payroll', auth, privilege(['payroll.create']), async (req, res) => {
    const { staffId, payPeriod, grossSalary, netSalary, allowances, deductions, userId } = req.body;
    try {
        const result = await pgq('INSERT INTO monthly_payroll (staff_id, pay_period, gross_salary, net_salary, allowances, deductions, user_id) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id', [staffId, formatDate(payPeriod), grossSalary, netSalary, allowances, deductions, userId]);
        res.status(201).json({ id: result.rows[0].id, message: 'Payroll record added successfully' });
    } catch (err) {
        console.error('Error adding payroll record:', err);
        res.status(500).send('Error adding payroll record');
    }
});

router.put('/monthly-payroll/:id', auth, privilege(['payroll.update']), async (req, res) => {
    const { id } = req.params;
    const { staffId, payPeriod, grossSalary, netSalary, allowances, deductions, userId } = req.body;
    try {
        const result = await pgq('UPDATE monthly_payroll SET staff_id = ?, pay_period = ?, gross_salary = ?, net_salary = ?, allowances = ?, deductions = ?, user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [staffId, formatDate(payPeriod), grossSalary, netSalary, allowances, deductions, userId, id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Payroll record not found.' });
        }
        res.status(200).json({ message: 'Payroll record updated successfully' });
    } catch (err) {
        console.error('Error updating payroll record:', err);
        res.status(500).send('Error updating payroll record');
    }
});

router.delete('/monthly-payroll/:id', auth, privilege(['payroll.delete']), async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pgq('UPDATE monthly_payroll SET voided = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Payroll record not found.' });
        }
        res.status(200).json({ message: 'Payroll record deleted successfully' });
    } catch (err) {
        console.error('Error deleting payroll record:', err);
        res.status(500).send('Error deleting payroll record');
    }
});

// --- Employee Dependants ---
router.post('/employee-dependants', auth, privilege(['dependants.create']), async (req, res) => {
    const { staffId, dependantName, relationship, dateOfBirth, userId } = req.body;
    try {
        const result = await pgq('INSERT INTO employee_dependants (staff_id, dependant_name, relationship, date_of_birth, user_id) VALUES (?, ?, ?, ?, ?) RETURNING id', [staffId, dependantName, relationship, formatDate(dateOfBirth), userId]);
        res.status(201).json({ id: result.rows[0].id, message: 'Dependant record added successfully' });
    } catch (err) {
        console.error('Error adding dependant record:', err);
        res.status(500).send('Error adding dependant record');
    }
});

router.put('/employee-dependants/:id', auth, privilege(['dependants.update']), async (req, res) => {
    const { id } = req.params;
    const { staffId, dependantName, relationship, dateOfBirth, userId } = req.body;
    try {
        const result = await pgq('UPDATE employee_dependants SET staff_id = ?, dependant_name = ?, relationship = ?, date_of_birth = ?, user_id = ? WHERE id = ?', [staffId, dependantName, relationship, formatDate(dateOfBirth), userId, id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Dependant record not found.' });
        }
        res.status(200).json({ message: 'Dependant record updated successfully' });
    } catch (err) {
        console.error('Error updating dependant record:', err);
        res.status(500).send('Error updating dependant record');
    }
});

router.delete('/employee-dependants/:id', auth, privilege(['dependants.delete']), async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pgq('UPDATE employee_dependants SET voided = 1 WHERE id = ?', [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Dependant record not found.' });
        }
        res.status(200).json({ message: 'Dependant record deleted successfully' });
    } catch (err) {
        console.error('Error deleting dependant record:', err);
        res.status(500).send('Error deleting dependant record');
    }
});

// --- Employee Terminations ---
router.post('/employee-terminations', auth, privilege(['terminations.create']), async (req, res) => {
    const { staffId, exitDate, reason, exitInterviewDetails, userId } = req.body;
    try {
        const result = await pgq('INSERT INTO employee_terminations (staff_id, exit_date, reason, exit_interview_details, user_id) VALUES (?, ?, ?, ?, ?) RETURNING id', [staffId, formatDate(exitDate), reason, exitInterviewDetails, userId]);
        res.status(201).json({ id: result.rows[0].id, message: 'Termination record added successfully' });
    } catch (err) {
        console.error('Error adding termination record:', err);
        res.status(500).send('Error adding termination record');
    }
});

router.put('/employee-terminations/:id', auth, privilege(['terminations.update']), async (req, res) => {
    const { id } = req.params;
    const { staffId, exitDate, reason, exitInterviewDetails, userId } = req.body;
    try {
        const result = await pgq('UPDATE employee_terminations SET staff_id = ?, exit_date = ?, reason = ?, exit_interview_details = ?, user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [staffId, formatDate(exitDate), reason, exitInterviewDetails, userId, id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Termination record not found.' });
        }
        res.status(200).json({ message: 'Termination record updated successfully' });
    } catch (err) {
        console.error('Error updating termination record:', err);
        res.status(500).send('Error updating termination record');
    }
});

router.delete('/employee-terminations/:id', auth, privilege(['terminations.delete']), async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pgq('UPDATE employee_terminations SET voided = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Termination record not found.' });
        }
        res.status(200).json({ message: 'Termination record deleted successfully' });
    } catch (err) {
        console.error('Error deleting termination record:', err);
        res.status(500).send('Error deleting termination record');
    }
});

// --- Employee Bank Details ---
router.post('/employee-bank-details', auth, privilege(['bank_details.create']), async (req, res) => {
    const { staffId, bankName, accountNumber, branchName, isPrimary, userId } = req.body;
    try {
        const result = await pgq('INSERT INTO employee_bank_details (staff_id, bank_name, account_number, branch_name, is_primary, user_id) VALUES (?, ?, ?, ?, ?, ?) RETURNING id', [staffId, bankName, accountNumber, branchName, isPrimary, userId]);
        res.status(201).json({ id: result.rows[0].id, message: 'Bank details added successfully' });
    } catch (err) {
        console.error('Error adding bank details:', err);
        res.status(500).send('Error adding bank details');
    }
});

router.put('/employee-bank-details/:id', auth, privilege(['bank_details.update']), async (req, res) => {
    const { id } = req.params;
    const { staffId, bankName, accountNumber, branchName, isPrimary, userId } = req.body;
    try {
        const result = await pgq('UPDATE employee_bank_details SET staff_id = ?, bank_name = ?, account_number = ?, branch_name = ?, is_primary = ?, user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [staffId, bankName, accountNumber, branchName, isPrimary, userId, id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Bank details not found.' });
        }
        res.status(200).json({ message: 'Bank details updated successfully' });
    } catch (err) {
        console.error('Error updating bank details:', err);
        res.status(500).send('Error updating bank details');
    }
});

router.delete('/employee-bank-details/:id', auth, privilege(['bank_details.delete']), async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pgq('UPDATE employee_bank_details SET voided = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Bank details not found.' });
        }
        res.status(200).json({ message: 'Bank details deleted successfully' });
    } catch (err) {
        console.error('Error deleting bank details:', err);
        res.status(500).send('Error deleting bank details');
    }
});

// --- Employee Memberships ---
router.post('/employee-memberships', auth, privilege(['memberships.create']), async (req, res) => {
    const { staffId, organizationName, membershipNumber, startDate, endDate, userId } = req.body;
    try {
        const result = await pgq('INSERT INTO employee_memberships (staff_id, organization_name, membership_number, start_date, end_date, user_id) VALUES (?, ?, ?, ?, ?, ?) RETURNING id', [staffId, organizationName, membershipNumber, formatDate(startDate), formatDate(endDate), userId]);
        res.status(201).json({ id: result.rows[0].id, message: 'Membership record added successfully' });
    } catch (err) {
        console.error('Error adding membership record:', err);
        res.status(500).send('Error adding membership record');
    }
});

router.put('/employee-memberships/:id', auth, privilege(['memberships.update']), async (req, res) => {
    const { id } = req.params;
    const { staffId, organizationName, membershipNumber, startDate, endDate, userId } = req.body;
    try {
        const result = await pgq('UPDATE employee_memberships SET staff_id = ?, organization_name = ?, membership_number = ?, start_date = ?, end_date = ?, user_id = ? WHERE id = ?', [staffId, organizationName, membershipNumber, formatDate(startDate), formatDate(endDate), userId, id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Membership record not found.' });
        }
        res.status(200).json({ message: 'Membership record updated successfully' });
    } catch (err) {
        console.error('Error updating membership record:', err);
        res.status(500).send('Error updating membership record');
    }
});

router.delete('/employee-memberships/:id', auth, privilege(['memberships.delete']), async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pgq('UPDATE employee_memberships SET voided = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Membership record not found.' });
        }
        res.status(200).json({ message: 'Membership record deleted successfully' });
    } catch (err) {
        console.error('Error deleting membership record:', err);
        res.status(500).send('Error deleting membership record');
    }
});

// --- Employee Benefits ---
router.post('/employee-benefits', auth, privilege(['benefits.create']), async (req, res) => {
    const { staffId, benefitName, enrollmentDate, status, userId } = req.body;
    try {
        const result = await pgq('INSERT INTO employee_benefits (staff_id, benefit_name, enrollment_date, status, user_id) VALUES (?, ?, ?, ?, ?) RETURNING id', [staffId, benefitName, formatDate(enrollmentDate), status, userId]);
        res.status(201).json({ id: result.rows[0].id, message: 'Benefit record added successfully' });
    } catch (err) {
        console.error('Error adding benefit record:', err);
        res.status(500).send('Error adding benefit record');
    }
});

router.put('/employee-benefits/:id', auth, privilege(['benefits.update']), async (req, res) => {
    const { id } = req.params;
    const { staffId, benefitName, enrollmentDate, status, userId } = req.body;
    try {
        const result = await pgq('UPDATE employee_benefits SET staff_id = ?, benefit_name = ?, enrollment_date = ?, status = ?, user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [staffId, benefitName, formatDate(enrollmentDate), status, userId, id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Benefit record not found.' });
        }
        res.status(200).json({ message: 'Benefit record updated successfully' });
    } catch (err) {
        console.error('Error updating benefit record:', err);
        res.status(500).send('Error updating benefit record');
    }
});

router.delete('/employee-benefits/:id', auth, privilege(['benefits.delete']), async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pgq('UPDATE employee_benefits SET voided = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Benefit record not found.' });
        }
        res.status(200).json({ message: 'Benefit record deleted successfully' });
    } catch (err) {
        console.error('Error deleting benefit record:', err);
        res.status(500).send('Error deleting benefit record');
    }
});

// --- Assigned Assets ---
router.post('/assigned-assets', auth, privilege(['assets.create']), async (req, res) => {
    const { staffId, assetName, serialNumber, assignmentDate, returnDate, condition, userId } = req.body;
    try {
        const sql = 'INSERT INTO assigned_assets (staff_id, asset_name, serial_number, assignment_date, return_date, asset_condition, user_id) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id';
        const result = await pgq(sql, [staffId, assetName, serialNumber, formatDate(assignmentDate), formatDate(returnDate), condition, userId]);
        res.status(201).json({ id: result.rows[0].id, message: 'Asset assignment recorded successfully' });
    } catch (err) {
        console.error('Error adding asset assignment:', err);
        res.status(500).send('Error adding asset assignment');
    }
});

router.put('/assigned-assets/:id', auth, privilege(['assets.update']), async (req, res) => {
    const { id } = req.params;
    const { staffId, assetName, serialNumber, assignmentDate, returnDate, condition, userId } = req.body;
    try {
        const sql = 'UPDATE assigned_assets SET staff_id = ?, asset_name = ?, serial_number = ?, assignment_date = ?, return_date = ?, asset_condition = ?, user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
        const result = await pgq(sql, [staffId, assetName, serialNumber, formatDate(assignmentDate), formatDate(returnDate), condition, userId, id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Asset assignment not found.' });
        }
        res.status(200).json({ message: 'Asset assignment updated successfully' });
    } catch (err) {
        console.error('Error updating asset assignment:', err);
        res.status(500).send('Error updating asset assignment');
    }
});

router.delete('/assigned-assets/:id', auth, privilege(['assets.delete']), async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pgq('UPDATE assigned_assets SET voided = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Asset assignment not found.' });
        }
        res.status(200).json({ message: 'Asset assignment deleted successfully' });
    } catch (err) {
        console.error('Error deleting asset assignment:', err);
        res.status(500).send('Error deleting asset assignment');
    }
});

// --- Employee Project Assignments ---
router.post('/project-assignments', auth, privilege(['project.assignments.create']), async (req, res) => {
    const { staffId, projectId, milestoneName, role, status, dueDate, userId } = req.body;
    try {
        const sql = 'INSERT INTO employee_project_assignments (staff_id, project_id, milestone_name, role, status, due_date, user_id) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id';
        const result = await pgq(sql, [staffId, projectId, milestoneName, role, status, formatDate(dueDate), userId]);
        res.status(201).json({ id: result.rows[0].id, message: 'Project assignment added successfully' });
    } catch (err) {
        console.error('Error adding project assignment:', err);
        res.status(500).send('Error adding project assignment');
    }
});

router.put('/project-assignments/:id', auth, privilege(['project.assignments.update']), async (req, res) => {
    const { id } = req.params;
    const { staffId, projectId, milestoneName, role, status, dueDate, userId } = req.body;
    try {
        const sql = 'UPDATE employee_project_assignments SET staff_id = ?, project_id = ?, milestone_name = ?, role = ?, status = ?, due_date = ?, user_id = ? WHERE id = ?';
        const result = await pgq(sql, [staffId, projectId, milestoneName, role, status, formatDate(dueDate), userId, id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Project assignment not found.' });
        }
        res.status(200).json({ message: 'Project assignment updated successfully' });
    } catch (err) {
        console.error('Error updating project assignment:', err);
        res.status(500).send('Error updating project assignment');
    }
});

router.delete('/project-assignments/:id', auth, privilege(['project.assignments.delete']), async (req, res) => {
    const { id } = req.params;
    try {
        const sql = 'UPDATE employee_project_assignments SET voided = 1 WHERE id = ?';
        const result = await pgq(sql, [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Project assignment not found.' });
        }
        res.status(200).json({ message: 'Project assignment deleted successfully' });
    } catch (err) {
        console.error('Error deleting project assignment:', err);
        res.status(500).send('Error deleting project assignment');
    }
});

// NEW: --- Leave Entitlements ---
router.get('/employees/:id/leave-entitlements', auth, privilege(['leave.entitlement.read']), async (req, res) => {
    const { id } = req.params;
    try {
        const sql = `
            SELECT le.*, lt.name as leave_type_name
            FROM employee_leave_entitlements le
            JOIN leave_types lt ON le.leave_type_id = lt.id
            WHERE le.staff_id = ? AND le.voided = 0
            ORDER BY le.year DESC, lt.name ASC
        `;
        const { rows: entitlements } = await pgq(sql, [id]);
        res.json(entitlements);
    } catch (err) {
        console.error('Error fetching leave entitlements:', err);
        res.status(500).send('Error fetching leave entitlements');
    }
});

router.post('/leave-entitlements', auth, privilege(['leave.entitlement.create']), async (req, res) => {
    const { staffId, leaveTypeId, year, allocatedDays, userId } = req.body;
    try {
        const sql = 'INSERT INTO employee_leave_entitlements (staff_id, leave_type_id, year, allocated_days, user_id) VALUES (?, ?, ?, ?, ?) RETURNING id';
        const result = await pgq(sql, [staffId, leaveTypeId, year, allocatedDays, userId]);
        res.status(201).json({ id: result.rows[0].id, message: 'Leave entitlement added successfully' });
    } catch (err) {
        console.error('Error adding leave entitlement:', err);
        res.status(500).send('Error adding leave entitlement');
    }
});

router.put('/leave-entitlements/:id', auth, privilege(['leave.entitlement.update']), async (req, res) => {
    const { id } = req.params;
    const { staffId, leaveTypeId, year, allocatedDays, userId } = req.body;
    try {
        const sql = 'UPDATE employee_leave_entitlements SET staff_id = ?, leave_type_id = ?, year = ?, allocated_days = ?, user_id = ? WHERE id = ?';
        const result = await pgq(sql, [staffId, leaveTypeId, year, allocatedDays, userId, id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Leave entitlement not found.' });
        }
        res.status(200).json({ message: 'Leave entitlement updated successfully' });
    } catch (err) {
        console.error('Error updating leave entitlement:', err);
        res.status(500).send('Error updating leave entitlement');
    }
});

router.delete('/leave-entitlements/:id', auth, privilege(['leave.entitlement.delete']), async (req, res) => {
    const { id } = req.params;
    try {
        const sql = 'UPDATE employee_leave_entitlements SET voided = 1 WHERE id = ?';
        const result = await pgq(sql, [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Leave entitlement not found.' });
        }
        res.status(200).json({ message: 'Leave entitlement deleted successfully' });
    } catch (err) {
        console.error('Error deleting leave entitlement:', err);
        res.status(500).send('Error deleting leave entitlement');
    }
});

// NEW: Route to fetch calculated leave balances for an employee
router.get('/employees/:id/leave-balance', auth, async (req, res) => {
    const { id } = req.params;
    const year = req.query.year || new Date().getFullYear(); // Default to current year

    try {
        const sql = `
            SELECT
                lt.id AS leave_type_id,
                lt.name AS leave_type_name,
                COALESCE(le.allocated_days, 0) AS allocated,
                COALESCE(SUM(la.number_of_days), 0) AS taken,
                (COALESCE(le.allocated_days, 0) - COALESCE(SUM(la.number_of_days), 0)) AS balance
            FROM
                leave_types lt
            LEFT JOIN
                employee_leave_entitlements le ON lt.id = le.leave_type_id
                AND le.staff_id = ?
                AND le.year = ?
            LEFT JOIN
                leave_applications la ON lt.id = la.leave_type_id
                AND la.staff_id = ?
                AND EXTRACT(YEAR FROM la.start_date)::int = ?
                AND la.status IN ('Approved', 'Completed')
            WHERE
                lt.voided = 0
            GROUP BY
                lt.id, lt.name, le.allocated_days
        `;
        const { rows: balances } = await pgq(sql, [id, year, id, year]);
        res.json(balances);
    } catch (err) {
        console.error('Error fetching leave balance:', err);
        res.status(500).send('Error fetching leave balance');
    }
});

// NEW: Route to calculate working days excluding weekends and public holidays
router.get('/calculate-working-days', auth, async (req, res) => {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
        return res.status(400).send('startDate and endDate are required.');
    }

    try {
        const { rows: holidays } = await pgq(
            'SELECT holiday_date FROM public_holidays WHERE holiday_date BETWEEN ? AND ?',
            [startDate, endDate]
        );
        const holidaySet = new Set(holidays.map((h) => new Date(h.holidayDate).toISOString().slice(0, 10)));

        let workingDays = 0;
        let currentDate = new Date(startDate);
        const finalDate = new Date(endDate);

        while (currentDate <= finalDate) {
            const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 6 = Saturday
            const dateString = currentDate.toISOString().slice(0, 10);

            if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidaySet.has(dateString)) {
                workingDays++;
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }
        res.json({ workingDays });
    } catch (err) {
        console.error('Error calculating working days:', err);
        res.status(500).send('Error calculating working days');
    }
});

// --- Public Holidays Management ---
router.get('/public-holidays', auth, privilege(['holiday.read']), async (req, res) => {
    try {
        const { rows } = await pgq('SELECT * FROM public_holidays WHERE voided = 0 ORDER BY holiday_date DESC');
        res.json(rows);
    } catch (err) {
        console.error('Error fetching public holidays:', err);
        res.status(500).send('Error fetching public holidays');
    }
});

router.post('/public-holidays', auth, privilege(['holiday.create']), async (req, res) => {
    const { holidayName, holidayDate, userId } = req.body;
    try {
        const sql = 'INSERT INTO public_holidays (holiday_name, holiday_date, user_id) VALUES (?, ?, ?) RETURNING id';
        const result = await pgq(sql, [holidayName, formatDate(holidayDate), userId]);
        res.status(201).json({ id: result.rows[0].id, message: 'Public holiday added successfully' });
    } catch (err) {
        console.error('Error adding public holiday:', err);
        res.status(500).send('Error adding public holiday');
    }
});

router.put('/public-holidays/:id', auth, privilege(['holiday.update']), async (req, res) => {
    const { id } = req.params;
    const { holidayName, holidayDate, userId } = req.body;
    try {
        const sql = 'UPDATE public_holidays SET holiday_name = ?, holiday_date = ?, user_id = ? WHERE id = ?';
        const result = await pgq(sql, [holidayName, formatDate(holidayDate), userId, id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Public holiday not found.' });
        }
        res.status(200).json({ message: 'Public holiday updated successfully' });
    } catch (err) {
        console.error('Error updating public holiday:', err);
        res.status(500).send('Error updating public holiday');
    }
});

router.delete('/public-holidays/:id', auth, privilege(['holiday.delete']), async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pgq('UPDATE public_holidays SET voided = 1 WHERE id = ?', [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Public holiday not found.' });
        }
        res.status(200).json({ message: 'Public holiday deleted successfully' });
    } catch (err) {
        console.error('Error deleting public holiday:', err);
        res.status(500).send('Error deleting public holiday');
    }
});

module.exports = router;