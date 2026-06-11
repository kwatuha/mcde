-- Scope down HR module privileges.
-- PostgreSQL only. Safe to re-run.
--
-- This complements the frontend menu scope-down flag by voiding the HR
-- privileges and their role mappings on deployments that use RBAC data.

BEGIN;

CREATE TEMP TABLE tmp_hr_scope_down_privileges (
  privilege_name text PRIMARY KEY
);

INSERT INTO tmp_hr_scope_down_privileges (privilege_name) VALUES
  ('hr.access'),
  ('employee.read_all'),
  ('employee.create'),
  ('employee.update'),
  ('employee.delete'),
  ('employee.read_360'),
  ('employee.performance.create'),
  ('employee.performance.update'),
  ('employee.performance.delete'),
  ('leave.type.read_all'),
  ('leave.type.create'),
  ('leave.type.update'),
  ('leave.type.delete'),
  ('leave.read_all'),
  ('leave.apply'),
  ('leave.approve'),
  ('leave.complete'),
  ('leave.update'),
  ('leave.delete'),
  ('leave.entitlement.read'),
  ('leave.entitlement.create'),
  ('leave.entitlement.update'),
  ('leave.entitlement.delete'),
  ('attendance.read_all'),
  ('attendance.create'),
  ('job_group.read_all'),
  ('job_group.create'),
  ('job_group.update'),
  ('job_group.delete'),
  ('compensation.read_all'),
  ('compensation.create'),
  ('compensation.update'),
  ('compensation.delete'),
  ('training.read_all'),
  ('training.create'),
  ('training.update'),
  ('training.delete'),
  ('promotion.create'),
  ('promotion.update'),
  ('promotion.delete'),
  ('disciplinary.create'),
  ('disciplinary.update'),
  ('disciplinary.delete'),
  ('holiday.read'),
  ('holiday.create'),
  ('holiday.update'),
  ('holiday.delete')
ON CONFLICT DO NOTHING;

UPDATE role_privileges rp
SET voided = true,
    updatedat = CURRENT_TIMESTAMP
WHERE COALESCE(rp.voided, false) = false
  AND rp.privilegeid IN (
    SELECT p.privilegeid
    FROM privileges p
    JOIN tmp_hr_scope_down_privileges t
      ON LOWER(TRIM(p.privilegename)) = LOWER(TRIM(t.privilege_name))
    WHERE COALESCE(p.voided, false) = false
  );

UPDATE privileges p
SET voided = true,
    updatedat = CURRENT_TIMESTAMP
WHERE COALESCE(p.voided, false) = false
  AND EXISTS (
    SELECT 1
    FROM tmp_hr_scope_down_privileges t
    WHERE LOWER(TRIM(p.privilegename)) = LOWER(TRIM(t.privilege_name))
  );

COMMIT;

SELECT
  t.privilege_name AS requested_privilege,
  p.privilegeid,
  p.privilegename,
  COALESCE(p.voided, false) AS is_voided
FROM tmp_hr_scope_down_privileges t
LEFT JOIN privileges p
  ON LOWER(TRIM(p.privilegename)) = LOWER(TRIM(t.privilege_name))
ORDER BY t.privilege_name;
