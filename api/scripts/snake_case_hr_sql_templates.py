#!/usr/bin/env python3
"""Rewrite camelCase column/table refs to snake_case inside `...` template literals that look like SQL."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / "routes" / "humanResourceRoutes.js"
text = path.read_text(encoding="utf-8")

# Longest-first to avoid partial replacements
PAIRS = [
    ("emergencyContactRelationship", "emergency_contact_relationship"),
    ("emergencyContactPhone", "emergency_contact_phone"),
    ("emergencyContactName", "emergency_contact_name"),
    ("approvedStartDate", "approved_start_date"),
    ("approvedEndDate", "approved_end_date"),
    ("actualReturnDate", "actual_return_date"),
    ("handoverStaffId", "handover_staff_id"),
    ("handoverComments", "handover_comments"),
    ("leaveTypeName", "leave_type_name"),
    ("leaveTypeId", "leave_type_id"),
    ("employmentStatus", "employment_status"),
    ("numberOfDays", "number_of_days"),
    ("contractStartDate", "contract_start_date"),
    ("contractEndDate", "contract_end_date"),
    ("certificationName", "certification_name"),
    ("completionDate", "completion_date"),
    ("oldJobGroupId", "old_job_group_id"),
    ("newJobGroupId", "new_job_group_id"),
    ("promotionDate", "promotion_date"),
    ("repaymentSchedule", "repayment_schedule"),
    ("exitInterviewDetails", "exit_interview_details"),
    ("payFrequency", "pay_frequency"),
    ("accountNumber", "account_number"),
    ("grossSalary", "gross_salary"),
    ("netSalary", "net_salary"),
    ("dependantName", "dependant_name"),
    ("enrollmentDate", "enrollment_date"),
    ("assignmentDate", "assignment_date"),
    ("serialNumber", "serial_number"),
    ("organizationName", "organization_name"),
    ("membershipNumber", "membership_number"),
    ("assetName", "asset_name"),
    ("milestoneName", "milestone_name"),
    ("holidayName", "holiday_name"),
    ("holidayDate", "holiday_date"),
    ("departmentId", "department_id"),
    ("phoneNumber", "phone_number"),
    ("dateOfBirth", "date_of_birth"),
    ("maritalStatus", "marital_status"),
    ("employmentType", "employment_type"),
    ("managerId", "manager_id"),
    ("placeOfBirth", "place_of_birth"),
    ("bloodType", "blood_type"),
    ("nationalId", "national_id"),
    ("kraPin", "kra_pin"),
    ("userId", "user_id"),
    ("createdAt", "created_at"),
    ("updatedAt", "updated_at"),
    ("checkInTime", "check_in_time"),
    ("checkOutTime", "check_out_time"),
    ("groupName", "group_name"),
    ("salaryScale", "salary_scale"),
    ("reviewDate", "review_date"),
    ("reviewScore", "review_score"),
    ("reviewerId", "reviewer_id"),
    ("baseSalary", "base_salary"),
    ("bankName", "bank_name"),
    ("actionType", "action_type"),
    ("actionDate", "action_date"),
    ("contractType", "contract_type"),
    ("retirementDate", "retirement_date"),
    ("retirementType", "retirement_type"),
    ("loanAmount", "loan_amount"),
    ("loanDate", "loan_date"),
    ("payPeriod", "pay_period"),
    ("branchName", "branch_name"),
    ("isPrimary", "is_primary"),
    ("benefitName", "benefit_name"),
    ("allocatedDays", "allocated_days"),
    ("firstName", "first_name"),
    ("lastName", "last_name"),
    ("staffId", "staff_id"),
    ("jobGroupId", "job_group_id"),
    ("jobGroupName", "job_group_name"),
    ("departmentName", "department_name"),
    ("startDate", "start_date"),
    ("endDate", "end_date"),
    ("projectId", "project_id"),
    ("dueDate", "due_date"),
]

SQLISH = re.compile(r"`([^`]*)`", re.DOTALL)


def maybe_snake_sql(body: str) -> str:
    if not any(k in body for k in ("SELECT", "INSERT", "UPDATE", "DELETE", "FROM", "JOIN", "SET", "WHERE")):
        return body
    s = body
    for camel, snake in PAIRS:
        s = re.sub(r"\b" + re.escape(camel) + r"\b", snake, s)
    return s


def repl(m):
    inner = m.group(1)
    return "`" + maybe_snake_sql(inner) + "`"


new_text = SQLISH.sub(repl, text)
path.write_text(new_text, encoding="utf-8")
print("Updated", path)
