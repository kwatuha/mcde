#!/usr/bin/env node
/**
 * One-shot: align humanResourceRoutes.js with PostgreSQL (pg pool result shape, snake_case SQL, RETURNING).
 */
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'routes', 'humanResourceRoutes.js');
let t = fs.readFileSync(file, 'utf8');

if (!t.includes('async function pgq')) {
  t = t.replace(
    "const db = require('../config/db');",
    `const db = require('../config/db');
const { mapRows } = require('../utils/camelSnakeKeys');

async function pgq(sql, params) {
    const r = await db.query(sql, params || []);
    if (r.rows) r.rows = mapRows(r.rows);
    return r;
}`
  );
}

t = t.replace(/\bawait db\.query\b/g, 'await pgq');

t = t.replace(/const \[rows\] = await pgq/g, 'const { rows } = await pgq');
t = t.replace(/const \[employees\] = await pgq/g, 'const { rows: employees } = await pgq');
t = t.replace(/const \[employeeRows\] = await pgq/g, 'const { rows: employeeRows } = await pgq');
t = t.replace(/const \[entitlements\] = await pgq/g, 'const { rows: entitlements } = await pgq');
t = t.replace(/const \[balances\] = await pgq/g, 'const { rows: balances } = await pgq');
t = t.replace(/const \[holidays\] = await pgq/g, 'const { rows: holidays } = await pgq');

t = t.replace(/const \[result\] = await pgq/g, 'const result = await pgq');

t = t.replace(/result\.affectedRows/g, 'result.rowCount');

t = t.replace(/results\[(\d+)\]\[0\]/g, 'results[$1].rows');

t = t.replace(
  /db\.query\('SELECT \* FROM employee_performance WHERE staffId = \? AND voided = 0 ORDER BY reviewDate DESC'/g,
  "pgq('SELECT * FROM employee_performance WHERE staff_id = ? AND voided = 0 ORDER BY review_date DESC'"
);
t = t.replace(
  /db\.query\('SELECT \* FROM employee_compensation WHERE staffId = \? AND voided = 0'/g,
  "pgq('SELECT * FROM employee_compensation WHERE staff_id = ? AND voided = 0'"
);
t = t.replace(
  /db\.query\('SELECT \* FROM employee_training WHERE staffId = \? AND voided = 0 ORDER BY completionDate DESC'/g,
  "pgq('SELECT * FROM employee_training WHERE staff_id = ? AND voided = 0 ORDER BY completion_date DESC'"
);
t = t.replace(
  /db\.query\('SELECT \* FROM employee_disciplinary WHERE staffId = \? AND voided = 0 ORDER BY actionDate DESC'/g,
  "pgq('SELECT * FROM employee_disciplinary WHERE staff_id = ? AND voided = 0 ORDER BY action_date DESC'"
);
t = t.replace(
  /db\.query\('SELECT \* FROM employee_contracts WHERE staffId = \? AND voided = 0 ORDER BY contractStartDate DESC'/g,
  "pgq('SELECT * FROM employee_contracts WHERE staff_id = ? AND voided = 0 ORDER BY contract_start_date DESC'"
);
t = t.replace(
  /db\.query\('SELECT \* FROM employee_retirements WHERE staffId = \? AND voided = 0'/g,
  "pgq('SELECT * FROM employee_retirements WHERE staff_id = ? AND voided = 0'"
);
t = t.replace(
  /db\.query\('SELECT \* FROM employee_loans WHERE staffId = \? AND voided = 0'/g,
  "pgq('SELECT * FROM employee_loans WHERE staff_id = ? AND voided = 0'"
);
t = t.replace(
  /db\.query\('SELECT \* FROM monthly_payroll WHERE staffId = \? AND voided = 0 ORDER BY payPeriod DESC'/g,
  "pgq('SELECT * FROM monthly_payroll WHERE staff_id = ? AND voided = 0 ORDER BY pay_period DESC'"
);
t = t.replace(
  /db\.query\('SELECT \* FROM employee_dependants WHERE staffId = \? AND voided = 0'/g,
  "pgq('SELECT * FROM employee_dependants WHERE staff_id = ? AND voided = 0'"
);
t = t.replace(
  /db\.query\('SELECT \* FROM employee_terminations WHERE staffId = \? AND voided = 0'/g,
  "pgq('SELECT * FROM employee_terminations WHERE staff_id = ? AND voided = 0'"
);
t = t.replace(
  /db\.query\('SELECT \* FROM employee_bank_details WHERE staffId = \? AND voided = 0'/g,
  "pgq('SELECT * FROM employee_bank_details WHERE staff_id = ? AND voided = 0'"
);
t = t.replace(
  /db\.query\('SELECT \* FROM employee_memberships WHERE staffId = \? AND voided = 0'/g,
  "pgq('SELECT * FROM employee_memberships WHERE staff_id = ? AND voided = 0'"
);
t = t.replace(
  /db\.query\('SELECT \* FROM employee_benefits WHERE staffId = \? AND voided = 0'/g,
  "pgq('SELECT * FROM employee_benefits WHERE staff_id = ? AND voided = 0'"
);
t = t.replace(
  /db\.query\('SELECT \* FROM assigned_assets WHERE staffId = \? AND voided = 0'/g,
  "pgq('SELECT * FROM assigned_assets WHERE staff_id = ? AND voided = 0'"
);
t = t.replace(
  /db\.query\('SELECT \* FROM employee_promotions WHERE staffId = \? AND voided = 0 ORDER BY promotionDate DESC'/g,
  "pgq('SELECT * FROM employee_promotions WHERE staff_id = ? AND voided = 0 ORDER BY promotion_date DESC'"
);
t = t.replace(
  /db\.query\('SELECT \* FROM employee_project_assignments WHERE staffId = \? AND voided = 0'/g,
  "pgq('SELECT * FROM employee_project_assignments WHERE staff_id = ? AND voided = 0'"
);
t = t.replace(/db\.query\(\`\s*SELECT/g, 'pgq(`\n                SELECT');
t = t.replace(/db\.query\('SELECT \* FROM job_groups WHERE voided = 0'\)/g, "pgq('SELECT * FROM job_groups WHERE voided = 0')");

t = t.replace(
  'UPDATE staff SET voided = 1, updatedAt = CURRENT_TIMESTAMP WHERE staffId = ?',
  'UPDATE staff SET voided = 1, updated_at = CURRENT_TIMESTAMP WHERE staff_id = ?'
);

t = t.replace(
  'UPDATE leave_applications SET actualReturnDate = ?, status = "Completed", userId = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
  "UPDATE leave_applications SET actual_return_date = ?, status = 'Completed', user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
);

t = t.replace('WHERE date = CURDATE() AND voided = 0 ORDER BY check_in_time DESC', 'WHERE date = CURRENT_DATE AND voided = 0 ORDER BY check_in_time DESC');

t = t.replace(
  "INSERT INTO attendance (staffId, date, checkInTime, userId) VALUES (?, CURDATE(), NOW(), ?)",
  'INSERT INTO attendance (staff_id, date, check_in_time, user_id) VALUES (?, CURRENT_DATE, NOW(), ?) RETURNING id'
);

t = t.replace(
  'UPDATE attendance SET checkOutTime = NOW(), userId = ?, updatedAt = NOW() WHERE id = ?',
  'UPDATE attendance SET check_out_time = NOW(), user_id = ?, updated_at = NOW() WHERE id = ?'
);

t = t.replace(
  'AND YEAR(la.start_date) = ?',
  'AND EXTRACT(YEAR FROM la.start_date)::int = ?'
);

t = t.replace(
  'INSERT INTO leave_applications (staffId, leaveTypeId, startDate, endDate, numberOfDays, reason, handoverStaffId, handoverComments, userId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  'INSERT INTO leave_applications (staff_id, leave_type_id, start_date, end_date, number_of_days, reason, handover_staff_id, handover_comments, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id'
);

t = t.replace(
  'UPDATE leave_applications SET status = ?, approvedStartDate = ?, approvedEndDate = ?, userId = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
  'UPDATE leave_applications SET status = ?, approved_start_date = ?, approved_end_date = ?, user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
);

t = t.replace(
  'UPDATE leave_applications SET status = ?, userId = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
  'UPDATE leave_applications SET status = ?, user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
);

t = t.replace(
  'UPDATE leave_applications SET staffId = ?, leaveTypeId = ?, startDate = ?, endDate = ?, numberOfDays = ?, reason = ?, handoverStaffId = ?, handoverComments = ?, userId = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
  'UPDATE leave_applications SET staff_id = ?, leave_type_id = ?, start_date = ?, end_date = ?, number_of_days = ?, reason = ?, handover_staff_id = ?, handover_comments = ?, user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
);

t = t.replace(
  'UPDATE leave_applications SET voided = 1, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
  'UPDATE leave_applications SET voided = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
);

t = t.replace(
  'SELECT * FROM public_holidays WHERE voided = 0 ORDER BY holidayDate DESC',
  'SELECT * FROM public_holidays WHERE voided = 0 ORDER BY holiday_date DESC'
);

t = t.replace(
  'UPDATE public_holidays SET voided = 1 WHERE id = ?',
  'UPDATE public_holidays SET voided = 1 WHERE id = ?'
);

t = t.replace(
  'INSERT INTO assigned_assets (staffId, assetName, serialNumber, assignmentDate, returnDate, `condition`, userId) VALUES (?, ?, ?, ?, ?, ?, ?)',
  'INSERT INTO assigned_assets (staff_id, asset_name, serial_number, assignment_date, return_date, asset_condition, user_id) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id'
);

t = t.replace(
  'UPDATE assigned_assets SET staffId = ?, assetName = ?, serialNumber = ?, assignmentDate = ?, returnDate = ?, `condition` = ?, userId = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
  'UPDATE assigned_assets SET staff_id = ?, asset_name = ?, serial_number = ?, assignment_date = ?, return_date = ?, asset_condition = ?, user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
);

t = t.replace(
  'UPDATE assigned_assets SET voided = 1, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
  'UPDATE assigned_assets SET voided = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
);

t = t.replace(
  'res.status(201).json({ staffId: result.insertId, message: \'Employee added successfully\' });',
  "res.status(201).json({ staffId: result.rows[0].staffId, message: 'Employee added successfully' });"
);

t = t.replace(
  '        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\n    `;',
  '        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\n        RETURNING staff_id\n    `;'
);

t = t.replace(
  "res.status(201).json({ id: result.insertId, message: 'Leave application submitted' });",
  "res.status(201).json({ id: result.rows[0].id, message: 'Leave application submitted' });"
);

const insertReturnId = [
  ['INSERT INTO employee_performance (staffId, reviewDate, reviewScore, comments, reviewerId) VALUES (?, ?, ?, ?, ?)', 'INSERT INTO employee_performance (staff_id, review_date, review_score, comments, reviewer_id) VALUES (?, ?, ?, ?, ?) RETURNING id'],
  ['INSERT INTO leave_types (name, description, numberOfDays, userId) VALUES (?, ?, ?, ?)', 'INSERT INTO leave_types (name, description, number_of_days, user_id) VALUES (?, ?, ?, ?) RETURNING id'],
  ['INSERT INTO employee_compensation (staffId, baseSalary, allowances, bonuses, bankName, accountNumber, payFrequency, userId) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', 'INSERT INTO employee_compensation (staff_id, base_salary, allowances, bonuses, bank_name, account_number, pay_frequency, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id'],
  ['INSERT INTO employee_training (staffId, courseName, institution, certificationName, completionDate, expiryDate, userId) VALUES (?, ?, ?, ?, ?, ?, ?)', 'INSERT INTO employee_training (staff_id, course_name, institution, certification_name, completion_date, expiry_date, user_id) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id'],
  ['INSERT INTO job_groups (groupName, salaryScale, description, userId) VALUES (?, ?, ?, ?)', 'INSERT INTO job_groups (group_name, salary_scale, description, user_id) VALUES (?, ?, ?, ?) RETURNING id'],
  ['INSERT INTO employee_promotions (staffId, oldJobGroupId, newJobGroupId, promotionDate, comments, userId) VALUES (?, ?, ?, ?, ?, ?)', 'INSERT INTO employee_promotions (staff_id, old_job_group_id, new_job_group_id, promotion_date, comments, user_id) VALUES (?, ?, ?, ?, ?, ?) RETURNING id'],
  ['INSERT INTO employee_disciplinary (staffId, actionType, actionDate, reason, comments, userId) VALUES (?, ?, ?, ?, ?, ?)', 'INSERT INTO employee_disciplinary (staff_id, action_type, action_date, reason, comments, user_id) VALUES (?, ?, ?, ?, ?, ?) RETURNING id'],
  ['INSERT INTO employee_contracts (staffId, contractType, contractStartDate, contractEndDate, status, userId) VALUES (?, ?, ?, ?, ?, ?)', 'INSERT INTO employee_contracts (staff_id, contract_type, contract_start_date, contract_end_date, status, user_id) VALUES (?, ?, ?, ?, ?, ?) RETURNING id'],
  ['INSERT INTO employee_retirements (staffId, retirementDate, retirementType, comments, userId) VALUES (?, ?, ?, ?, ?)', 'INSERT INTO employee_retirements (staff_id, retirement_date, retirement_type, comments, user_id) VALUES (?, ?, ?, ?, ?) RETURNING id'],
  ['INSERT INTO employee_loans (staffId, loanAmount, loanDate, status, repaymentSchedule, userId) VALUES (?, ?, ?, ?, ?, ?)', 'INSERT INTO employee_loans (staff_id, loan_amount, loan_date, status, repayment_schedule, user_id) VALUES (?, ?, ?, ?, ?, ?) RETURNING id'],
  ['INSERT INTO monthly_payroll (staffId, payPeriod, grossSalary, netSalary, allowances, deductions, userId) VALUES (?, ?, ?, ?, ?, ?, ?)', 'INSERT INTO monthly_payroll (staff_id, pay_period, gross_salary, net_salary, allowances, deductions, user_id) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id'],
  ['INSERT INTO employee_dependants (staffId, dependantName, relationship, dateOfBirth, userId) VALUES (?, ?, ?, ?, ?)', 'INSERT INTO employee_dependants (staff_id, dependant_name, relationship, date_of_birth, user_id) VALUES (?, ?, ?, ?, ?) RETURNING id'],
  ['INSERT INTO employee_terminations (staffId, exitDate, reason, exitInterviewDetails, userId) VALUES (?, ?, ?, ?, ?)', 'INSERT INTO employee_terminations (staff_id, exit_date, reason, exit_interview_details, user_id) VALUES (?, ?, ?, ?, ?) RETURNING id'],
  ['INSERT INTO employee_bank_details (staffId, bankName, accountNumber, branchName, isPrimary, userId) VALUES (?, ?, ?, ?, ?, ?)', 'INSERT INTO employee_bank_details (staff_id, bank_name, account_number, branch_name, is_primary, user_id) VALUES (?, ?, ?, ?, ?, ?) RETURNING id'],
  ['INSERT INTO employee_memberships (staffId, organizationName, membershipNumber, startDate, endDate, userId) VALUES (?, ?, ?, ?, ?, ?)', 'INSERT INTO employee_memberships (staff_id, organization_name, membership_number, start_date, end_date, user_id) VALUES (?, ?, ?, ?, ?, ?) RETURNING id'],
  ['INSERT INTO employee_benefits (staffId, benefitName, enrollmentDate, status, userId) VALUES (?, ?, ?, ?, ?)', 'INSERT INTO employee_benefits (staff_id, benefit_name, enrollment_date, status, user_id) VALUES (?, ?, ?, ?, ?) RETURNING id'],
  ['INSERT INTO employee_project_assignments (staffId, projectId, milestoneName, role, status, dueDate, userId) VALUES (?, ?, ?, ?, ?, ?, ?)', 'INSERT INTO employee_project_assignments (staff_id, project_id, milestone_name, role, status, due_date, user_id) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id'],
  ['INSERT INTO employee_leave_entitlements (staffId, leaveTypeId, year, allocatedDays, userId) VALUES (?, ?, ?, ?, ?)', 'INSERT INTO employee_leave_entitlements (staff_id, leave_type_id, year, allocated_days, user_id) VALUES (?, ?, ?, ?, ?) RETURNING id'],
  ['INSERT INTO public_holidays (holidayName, holidayDate, userId) VALUES (?, ?, ?)', 'INSERT INTO public_holidays (holiday_name, holiday_date, user_id) VALUES (?, ?, ?) RETURNING id'],
];

for (const [a, b] of insertReturnId) {
  t = t.split(a).join(b);
}

t = t.replace(/res\.status\(201\)\.json\(\{ id: result\.insertId/g, 'res.status(201).json({ id: result.rows[0].id');

t = t.replace(
  'UPDATE employee_performance SET reviewDate = ?, reviewScore = ?, comments = ?, reviewerId = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
  'UPDATE employee_performance SET review_date = ?, review_score = ?, comments = ?, reviewer_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
);

t = t.replace(
  'UPDATE employee_performance SET voided = 1, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
  'UPDATE employee_performance SET voided = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
);

t = t.replace(
  'UPDATE leave_types SET name = ?, description = ?, numberOfDays = ?, userId = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
  'UPDATE leave_types SET name = ?, description = ?, number_of_days = ?, user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
);

t = t.replace(
  'UPDATE leave_types SET voided = 1, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
  'UPDATE leave_types SET voided = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
);

t = t.replace(
  'UPDATE employee_compensation SET staffId = ?, baseSalary = ?, allowances = ?, bonuses = ?, bankName = ?, accountNumber = ?, payFrequency = ?, userId = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
  'UPDATE employee_compensation SET staff_id = ?, base_salary = ?, allowances = ?, bonuses = ?, bank_name = ?, account_number = ?, pay_frequency = ?, user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
);

t = t.replace(
  'UPDATE employee_compensation SET voided = 1, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
  'UPDATE employee_compensation SET voided = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
);

t = t.replace(
  'UPDATE employee_training SET staffId = ?, courseName = ?, institution = ?, certificationName = ?, completionDate = ?, expiryDate = ?, userId = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
  'UPDATE employee_training SET staff_id = ?, course_name = ?, institution = ?, certification_name = ?, completion_date = ?, expiry_date = ?, user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
);

t = t.replace(
  'UPDATE employee_training SET voided = 1, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
  'UPDATE employee_training SET voided = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
);

t = t.replace(
  'UPDATE job_groups SET groupName = ?, salaryScale = ?, description = ?, userId = ? WHERE id = ?',
  'UPDATE job_groups SET group_name = ?, salary_scale = ?, description = ?, user_id = ? WHERE id = ?'
);

t = t.replace(
  'UPDATE employee_promotions SET staffId = ?, oldJobGroupId = ?, newJobGroupId = ?, promotionDate = ?, comments = ?, userId = ? WHERE id = ?',
  'UPDATE employee_promotions SET staff_id = ?, old_job_group_id = ?, new_job_group_id = ?, promotion_date = ?, comments = ?, user_id = ? WHERE id = ?'
);

t = t.replace(
  'UPDATE employee_disciplinary SET staffId = ?, actionType = ?, actionDate = ?, reason = ?, comments = ?, userId = ? WHERE id = ?',
  'UPDATE employee_disciplinary SET staff_id = ?, action_type = ?, action_date = ?, reason = ?, comments = ?, user_id = ? WHERE id = ?'
);

t = t.replace(
  'UPDATE employee_contracts SET staffId = ?, contractType = ?, contractStartDate = ?, contractEndDate = ?, status = ?, userId = ? WHERE id = ?',
  'UPDATE employee_contracts SET staff_id = ?, contract_type = ?, contract_start_date = ?, contract_end_date = ?, status = ?, user_id = ? WHERE id = ?'
);

t = t.replace(
  'UPDATE employee_retirements SET staffId = ?, retirementDate = ?, retirementType = ?, comments = ?, userId = ? WHERE id = ?',
  'UPDATE employee_retirements SET staff_id = ?, retirement_date = ?, retirement_type = ?, comments = ?, user_id = ? WHERE id = ?'
);

t = t.replace(
  'UPDATE employee_loans SET staffId = ?, loanAmount = ?, loanDate = ?, status = ?, repaymentSchedule = ?, userId = ? WHERE id = ?',
  'UPDATE employee_loans SET staff_id = ?, loan_amount = ?, loan_date = ?, status = ?, repayment_schedule = ?, user_id = ? WHERE id = ?'
);

t = t.replace(
  'UPDATE monthly_payroll SET staffId = ?, payPeriod = ?, grossSalary = ?, netSalary = ?, allowances = ?, deductions = ?, userId = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
  'UPDATE monthly_payroll SET staff_id = ?, pay_period = ?, gross_salary = ?, net_salary = ?, allowances = ?, deductions = ?, user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
);

t = t.replace(
  'UPDATE employee_dependants SET staffId = ?, dependantName = ?, relationship = ?, dateOfBirth = ?, userId = ? WHERE id = ?',
  'UPDATE employee_dependants SET staff_id = ?, dependant_name = ?, relationship = ?, date_of_birth = ?, user_id = ? WHERE id = ?'
);

t = t.replace(
  'UPDATE employee_terminations SET staffId = ?, exitDate = ?, reason = ?, exitInterviewDetails = ?, userId = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
  'UPDATE employee_terminations SET staff_id = ?, exit_date = ?, reason = ?, exit_interview_details = ?, user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
);

t = t.replace(
  'UPDATE employee_bank_details SET staffId = ?, bankName = ?, accountNumber = ?, branchName = ?, isPrimary = ?, userId = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
  'UPDATE employee_bank_details SET staff_id = ?, bank_name = ?, account_number = ?, branch_name = ?, is_primary = ?, user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
);

t = t.replace(
  'UPDATE employee_memberships SET staffId = ?, organizationName = ?, membershipNumber = ?, startDate = ?, endDate = ?, userId = ? WHERE id = ?',
  'UPDATE employee_memberships SET staff_id = ?, organization_name = ?, membership_number = ?, start_date = ?, end_date = ?, user_id = ? WHERE id = ?'
);

t = t.replace(
  'UPDATE employee_benefits SET staffId = ?, benefitName = ?, enrollmentDate = ?, status = ?, userId = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
  'UPDATE employee_benefits SET staff_id = ?, benefit_name = ?, enrollment_date = ?, status = ?, user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
);

t = t.replace(
  'UPDATE employee_project_assignments SET staffId = ?, projectId = ?, milestoneName = ?, role = ?, status = ?, dueDate = ?, userId = ? WHERE id = ?',
  'UPDATE employee_project_assignments SET staff_id = ?, project_id = ?, milestone_name = ?, role = ?, status = ?, due_date = ?, user_id = ? WHERE id = ?'
);

t = t.replace(
  'UPDATE employee_leave_entitlements SET staffId = ?, leaveTypeId = ?, year = ?, allocatedDays = ?, userId = ? WHERE id = ?',
  'UPDATE employee_leave_entitlements SET staff_id = ?, leave_type_id = ?, year = ?, allocated_days = ?, user_id = ? WHERE id = ?'
);

t = t.replace(
  'UPDATE public_holidays SET holidayName = ?, holidayDate = ?, userId = ? WHERE id = ?',
  'UPDATE public_holidays SET holiday_name = ?, holiday_date = ?, user_id = ? WHERE id = ?'
);

t = t.replace(
  'res.status(201).json({ id: result.rows[0].id, message: \'Check-in recorded successfully\' });',
  "res.status(201).json({ id: result.rows[0].id, message: 'Check-in recorded successfully' });"
);

fs.writeFileSync(file, t);
console.log('Wrote', file);
