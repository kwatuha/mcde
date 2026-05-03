/**
 * Generic approval workflow engine (definitions, requests, steps, SLA escalation).
 * PostgreSQL-first; MySQL supported with simplified DDL where noted.
 */
const pool = require('../config/db');

const DB_TYPE = process.env.DB_TYPE || 'mysql';
const isPostgres = DB_TYPE === 'postgresql';

const rowsFromResult = (result) =>
  isPostgres ? result?.rows || [] : Array.isArray(result) ? result[0] || [] : [];
const firstRow = (result) => rowsFromResult(result)[0] || null;
const affectedRows = (result) =>
  isPostgres ? Number(result?.rowCount || 0) : Number(result?.[0]?.affectedRows || 0);

let tablesEnsured = false;
let ensurePromise = null;

async function runSafe(sql) {
  try {
    await pool.query(sql);
  } catch (e) {
    const code = String(e?.code || '');
    if (code === '42P07' || code === '42710' || code === '23505' || code === 'ER_TABLE_EXISTS_ERROR') return;
    throw e;
  }
}

async function ensureTables() {
  if (tablesEnsured) return;

  if (isPostgres) {
    await runSafe(`
      CREATE TABLE IF NOT EXISTS approval_workflow_definitions (
        definition_id BIGSERIAL PRIMARY KEY,
        entity_type TEXT NOT NULL,
        code TEXT NOT NULL DEFAULT 'default',
        version INT NOT NULL DEFAULT 1,
        name TEXT,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_awf_def UNIQUE (entity_type, code, version)
      )
    `);
    await runSafe(`
      CREATE TABLE IF NOT EXISTS approval_workflow_steps (
        definition_step_id BIGSERIAL PRIMARY KEY,
        definition_id BIGINT NOT NULL REFERENCES approval_workflow_definitions(definition_id) ON DELETE CASCADE,
        step_order INT NOT NULL,
        step_name TEXT,
        role_id BIGINT,
        sla_hours INT,
        escalation_role_id BIGINT,
        CONSTRAINT uq_awf_step UNIQUE (definition_id, step_order)
      )
    `);
    await runSafe(`
      CREATE TABLE IF NOT EXISTS approval_requests (
        request_id BIGSERIAL PRIMARY KEY,
        definition_id BIGINT NOT NULL REFERENCES approval_workflow_definitions(definition_id),
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        current_step_order INT NOT NULL DEFAULT 1,
        submitted_by BIGINT,
        payload_snapshot JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        resolved_at TIMESTAMPTZ
      )
    `);
    await runSafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_approval_one_pending_entity
      ON approval_requests (entity_type, entity_id)
      WHERE status = 'pending'
    `);
    await runSafe(`
      CREATE TABLE IF NOT EXISTS approval_step_instances (
        instance_id BIGSERIAL PRIMARY KEY,
        request_id BIGINT NOT NULL REFERENCES approval_requests(request_id) ON DELETE CASCADE,
        step_order INT NOT NULL,
        step_name TEXT,
        role_id BIGINT,
        sla_hours INT,
        escalation_role_id BIGINT,
        status TEXT NOT NULL DEFAULT 'waiting',
        due_at TIMESTAMPTZ,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        completed_by BIGINT,
        comment TEXT,
        CONSTRAINT uq_awf_inst UNIQUE (request_id, step_order)
      )
    `);
    await runSafe(`
      CREATE TABLE IF NOT EXISTS approval_actions (
        action_id BIGSERIAL PRIMARY KEY,
        request_id BIGINT NOT NULL REFERENCES approval_requests(request_id) ON DELETE CASCADE,
        step_instance_id BIGINT REFERENCES approval_step_instances(instance_id) ON DELETE SET NULL,
        actor_user_id BIGINT,
        action_type TEXT NOT NULL,
        comment TEXT,
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await runSafe(
      `ALTER TABLE approval_workflow_definitions ADD COLUMN IF NOT EXISTS link_template TEXT`
    );
  } else {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS approval_workflow_definitions (
        definition_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        entity_type VARCHAR(128) NOT NULL,
        code VARCHAR(64) NOT NULL DEFAULT 'default',
        version INT NOT NULL DEFAULT 1,
        name VARCHAR(255) NULL,
        active TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_awf_def (entity_type, code, version)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS approval_workflow_steps (
        definition_step_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        definition_id BIGINT NOT NULL,
        step_order INT NOT NULL,
        step_name VARCHAR(255) NULL,
        role_id BIGINT NULL,
        sla_hours INT NULL,
        escalation_role_id BIGINT NULL,
        UNIQUE KEY uq_awf_step (definition_id, step_order),
        CONSTRAINT fk_awf_steps_def FOREIGN KEY (definition_id) REFERENCES approval_workflow_definitions(definition_id) ON DELETE CASCADE
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS approval_requests (
        request_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        definition_id BIGINT NOT NULL,
        entity_type VARCHAR(128) NOT NULL,
        entity_id VARCHAR(64) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        current_step_order INT NOT NULL DEFAULT 1,
        submitted_by BIGINT NULL,
        payload_snapshot JSON NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        resolved_at DATETIME NULL,
        CONSTRAINT fk_awf_req_def FOREIGN KEY (definition_id) REFERENCES approval_workflow_definitions(definition_id)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS approval_step_instances (
        instance_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        request_id BIGINT NOT NULL,
        step_order INT NOT NULL,
        step_name VARCHAR(255) NULL,
        role_id BIGINT NULL,
        sla_hours INT NULL,
        escalation_role_id BIGINT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'waiting',
        due_at DATETIME NULL,
        started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME NULL,
        completed_by BIGINT NULL,
        comment TEXT NULL,
        UNIQUE KEY uq_awf_inst (request_id, step_order),
        CONSTRAINT fk_awf_inst_req FOREIGN KEY (request_id) REFERENCES approval_requests(request_id) ON DELETE CASCADE
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS approval_actions (
        action_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        request_id BIGINT NOT NULL,
        step_instance_id BIGINT NULL,
        actor_user_id BIGINT NULL,
        action_type VARCHAR(64) NOT NULL,
        comment TEXT NULL,
        metadata JSON NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_awf_act_req FOREIGN KEY (request_id) REFERENCES approval_requests(request_id) ON DELETE CASCADE
      )
    `);
    try {
      await pool.query(`ALTER TABLE approval_workflow_definitions ADD COLUMN link_template TEXT NULL`);
    } catch (e) {
      const msg = String(e?.message || '');
      if (e?.code !== 'ER_DUP_FIELDNAME' && !msg.includes('Duplicate column')) throw e;
    }
  }

  tablesEnsured = true;
}

function ensureReady() {
  if (!ensurePromise) ensurePromise = ensureTables();
  return ensurePromise;
}

async function listDefinitions(entityType) {
  await ensureReady();
  if (entityType) {
    const r = await pool.query(
      'SELECT * FROM approval_workflow_definitions WHERE entity_type = ? ORDER BY entity_type, code, version',
      [entityType]
    );
    return rowsFromResult(r);
  }
  const r = await pool.query('SELECT * FROM approval_workflow_definitions ORDER BY entity_type, code, version');
  return rowsFromResult(r);
}

async function getDefinitionSteps(definitionId) {
  await ensureReady();
  const r = await pool.query(
    'SELECT * FROM approval_workflow_steps WHERE definition_id = ? ORDER BY step_order ASC',
    [definitionId]
  );
  return rowsFromResult(r);
}

async function getDefinitionById(definitionId) {
  await ensureReady();
  const row = firstRow(
    await pool.query('SELECT * FROM approval_workflow_definitions WHERE definition_id = ?', [definitionId])
  );
  if (!row) return null;
  const steps = await getDefinitionSteps(definitionId);
  const uc = firstRow(
    await pool.query('SELECT COUNT(*) AS c FROM approval_requests WHERE definition_id = ?', [definitionId])
  );
  const used = Number(uc?.c ?? 0);
  return { ...row, steps, used_in_requests: used };
}

/**
 * Update a workflow definition. If any approval_requests reference it, only `name` and `active` may change.
 */
async function updateDefinition(definitionId, patch) {
  await ensureReady();
  const id = Number(definitionId);
  if (!Number.isFinite(id)) {
    const err = new Error('Invalid definition id');
    err.statusCode = 400;
    throw err;
  }
  const existing = firstRow(await pool.query('SELECT * FROM approval_workflow_definitions WHERE definition_id = ?', [id]));
  if (!existing) {
    const err = new Error('Definition not found');
    err.statusCode = 404;
    throw err;
  }

  const uc = firstRow(await pool.query('SELECT COUNT(*) AS c FROM approval_requests WHERE definition_id = ?', [id]));
  const usedCount = Number(uc?.c ?? 0);

  const {
    entity_type: entityTypeIn,
    code: codeIn,
    version: versionIn,
    name: nameIn,
    active: activeIn,
    steps: stepsIn,
    link_template: linkTemplateIn,
  } = patch;

  const now = new Date();
  const existingVersion = Number(existing.version);
  const existingActive = isPostgres ? Boolean(existing.active) : Number(existing.active) === 1;

  if (usedCount > 0) {
    const wantsStructural =
      (entityTypeIn != null && entityTypeIn !== existing.entity_type) ||
      (codeIn != null && codeIn !== existing.code) ||
      (versionIn != null && Number(versionIn) !== existingVersion) ||
      (stepsIn != null && Array.isArray(stepsIn));
    if (wantsStructural) {
      const err = new Error(
        'This definition is already referenced by approval requests. You can only change the display name and active flag. Create a new definition (new version or code) for other changes.'
      );
      err.statusCode = 409;
      throw err;
    }
    const nextName = nameIn !== undefined ? nameIn : existing.name;
    const nextActive = activeIn !== undefined ? activeIn !== false && activeIn !== 0 : existingActive;
    const nextLink =
      linkTemplateIn !== undefined
        ? linkTemplateIn === '' || linkTemplateIn === null
          ? null
          : String(linkTemplateIn).trim() || null
        : undefined;
    if (nextLink === undefined) {
      if (isPostgres) {
        await pool.query(
          `UPDATE approval_workflow_definitions SET name = ?, active = ?, updated_at = ? WHERE definition_id = ?`,
          [nextName || null, nextActive, now, id]
        );
      } else {
        await pool.query(
          `UPDATE approval_workflow_definitions SET name = ?, active = ?, updated_at = ? WHERE definition_id = ?`,
          [nextName || null, nextActive ? 1 : 0, now, id]
        );
      }
    } else if (isPostgres) {
      await pool.query(
        `UPDATE approval_workflow_definitions SET name = ?, active = ?, link_template = ?, updated_at = ? WHERE definition_id = ?`,
        [nextName || null, nextActive, nextLink, now, id]
      );
    } else {
      await pool.query(
        `UPDATE approval_workflow_definitions SET name = ?, active = ?, link_template = ?, updated_at = ? WHERE definition_id = ?`,
        [nextName || null, nextActive ? 1 : 0, nextLink, now, id]
      );
    }
    return getDefinitionById(id);
  }

  const et = entityTypeIn != null ? entityTypeIn : existing.entity_type;
  const cd = codeIn != null ? codeIn : existing.code;
  const ver = versionIn != null ? Number(versionIn) : existingVersion;
  const nm = nameIn !== undefined ? nameIn : existing.name;
  const nextActiveFull = activeIn !== undefined ? activeIn !== false && activeIn !== 0 : existingActive;
  const nextLinkFull =
    linkTemplateIn !== undefined
      ? linkTemplateIn === '' || linkTemplateIn === null
        ? null
        : String(linkTemplateIn).trim() || null
      : existing.link_template != null
        ? String(existing.link_template).trim() || null
        : null;

  const dup = firstRow(
    await pool.query(
      `SELECT definition_id FROM approval_workflow_definitions WHERE entity_type = ? AND code = ? AND version = ? AND definition_id != ?`,
      [et, cd, ver, id]
    )
  );
  if (dup) {
    const err = new Error('Another definition already uses this entity_type, code and version combination.');
    err.statusCode = 409;
    throw err;
  }

  if (isPostgres) {
    await pool.query(
      `UPDATE approval_workflow_definitions SET entity_type = ?, code = ?, version = ?, name = ?, active = ?, link_template = ?, updated_at = ? WHERE definition_id = ?`,
      [et, cd, ver, nm || null, nextActiveFull, nextLinkFull, now, id]
    );
  } else {
    await pool.query(
      `UPDATE approval_workflow_definitions SET entity_type = ?, code = ?, version = ?, name = ?, active = ?, link_template = ?, updated_at = ? WHERE definition_id = ?`,
      [et, cd, ver, nm || null, nextActiveFull ? 1 : 0, nextLinkFull, now, id]
    );
  }

  if (Array.isArray(stepsIn)) {
    if (stepsIn.length === 0) {
      const err = new Error('At least one workflow step is required.');
      err.statusCode = 400;
      throw err;
    }
    await pool.query('DELETE FROM approval_workflow_steps WHERE definition_id = ?', [id]);
    for (const s of stepsIn) {
      await pool.query(
        `INSERT INTO approval_workflow_steps (definition_id, step_order, step_name, role_id, sla_hours, escalation_role_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, s.step_order, s.step_name || null, s.role_id ?? null, s.sla_hours ?? null, s.escalation_role_id ?? null]
      );
    }
  }

  return getDefinitionById(id);
}

async function createDefinition({ entity_type, code = 'default', version = 1, name, active = true, steps = [], link_template = null }) {
  await ensureReady();
  const now = new Date();
  const linkVal =
    link_template === '' || link_template === null || link_template === undefined
      ? null
      : String(link_template).trim() || null;
  let definitionId;
  if (isPostgres) {
    const ins = await pool.query(
      `INSERT INTO approval_workflow_definitions (entity_type, code, version, name, active, link_template, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING definition_id`,
      [entity_type, code, version, name || null, active, linkVal, now, now]
    );
    definitionId = firstRow(ins)?.definition_id;
  } else {
    const [res] = await pool.query(
      'INSERT INTO approval_workflow_definitions SET ?',
      [
        {
          entity_type,
          code,
          version,
          name: name || null,
          active: active ? 1 : 0,
          link_template: linkVal,
          created_at: now,
          updated_at: now,
        },
      ]
    );
    definitionId = res.insertId;
  }
  for (const s of steps) {
    await pool.query(
      `INSERT INTO approval_workflow_steps (definition_id, step_order, step_name, role_id, sla_hours, escalation_role_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        definitionId,
        s.step_order,
        s.step_name || null,
        s.role_id ?? null,
        s.sla_hours ?? null,
        s.escalation_role_id ?? null,
      ]
    );
  }
  return { definition_id: definitionId };
}

async function getActiveDefinitionForEntityType(entityType, code = 'default') {
  await ensureReady();
  const r = await pool.query(
    `SELECT * FROM approval_workflow_definitions WHERE entity_type = ? AND code = ? AND active = ${isPostgres ? 'TRUE' : '1'} ORDER BY version DESC LIMIT 1`,
    [entityType, code]
  );
  const def = firstRow(r);
  if (!def) return null;
  const steps = await getDefinitionSteps(def.definition_id);
  return { ...def, steps };
}

async function logAction(requestId, stepInstanceId, actorUserId, actionType, comment, metadata) {
  const metaVal = metadata == null ? null : JSON.stringify(metadata);
  const ts = new Date();
  if (isPostgres) {
    await pool.query(
      `INSERT INTO approval_actions (request_id, step_instance_id, actor_user_id, action_type, comment, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, CAST(? AS JSONB), ?)`,
      [requestId, stepInstanceId, actorUserId, actionType, comment || null, metaVal || '{}', ts]
    );
  } else {
    await pool.query(
      `INSERT INTO approval_actions (request_id, step_instance_id, actor_user_id, action_type, comment, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [requestId, stepInstanceId, actorUserId, actionType, comment || null, metaVal, ts]
    );
  }
}

async function syncAnnualWorkplanStatus(workplanId, label) {
  try {
    const u = new Date();
    if (isPostgres) {
      await pool.query(
        `UPDATE annual_workplans SET "approvalStatus" = ?, "updatedAt" = ? WHERE "workplanId" = ?`,
        [label, u, workplanId]
      );
    } else {
      await pool.query(`UPDATE annual_workplans SET approvalStatus = ?, updatedAt = ? WHERE workplanId = ?`, [
        label,
        u,
        workplanId,
      ]);
    }
  } catch (e) {
    console.warn('syncAnnualWorkplanStatus skipped:', e.message);
  }
}

async function startRequest({ entityType, entityId, definitionId, submittedBy, payloadSnapshot }) {
  await ensureReady();
  const entityIdStr = String(entityId);

  const open = await pool.query(
    `SELECT * FROM approval_requests WHERE entity_type = ? AND entity_id = ? AND status = 'pending'`,
    [entityType, entityIdStr]
  );
  if (rowsFromResult(open).length) {
    const err = new Error('An approval request is already pending for this item.');
    err.statusCode = 409;
    throw err;
  }

  let def;
  if (definitionId) {
    const dr = await pool.query('SELECT * FROM approval_workflow_definitions WHERE definition_id = ?', [definitionId]);
    def = firstRow(dr);
  } else {
    def = firstRow(
      await pool.query(
        `SELECT * FROM approval_workflow_definitions WHERE entity_type = ? AND active = ${isPostgres ? 'TRUE' : '1'} ORDER BY version DESC LIMIT 1`,
        [entityType]
      )
    );
  }
  if (!def) {
    const err = new Error(`No active workflow definition for entity_type "${entityType}". Create one under approval workflow admin.`);
    err.statusCode = 400;
    throw err;
  }

  const steps = await getDefinitionSteps(def.definition_id);
  if (!steps.length) {
    const err = new Error('Workflow definition has no steps.');
    err.statusCode = 400;
    throw err;
  }

  const snap = payloadSnapshot ? JSON.stringify(payloadSnapshot) : null;
  const now = new Date();
  let requestId;

  if (isPostgres) {
    const ir = await pool.query(
      `INSERT INTO approval_requests (definition_id, entity_type, entity_id, status, current_step_order, submitted_by, payload_snapshot, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', 1, ?, CAST(? AS JSONB), ?, ?) RETURNING request_id`,
      [def.definition_id, entityType, entityIdStr, submittedBy || null, snap || '{}', now, now]
    );
    requestId = firstRow(ir)?.request_id;
  } else {
    const [ins] = await pool.query('INSERT INTO approval_requests SET ?', {
      definition_id: def.definition_id,
      entity_type: entityType,
      entity_id: entityIdStr,
      status: 'pending',
      current_step_order: 1,
      submitted_by: submittedBy || null,
      payload_snapshot: snap,
      created_at: now,
      updated_at: now,
    });
    requestId = ins.insertId;
  }

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const isFirst = i === 0;
    const status = isFirst ? 'pending' : 'waiting';
    let dueAt = null;
    if (isFirst && s.sla_hours != null && Number(s.sla_hours) > 0) {
      dueAt = new Date(now.getTime() + Number(s.sla_hours) * 3600000);
    }
    await pool.query(
      `INSERT INTO approval_step_instances (request_id, step_order, step_name, role_id, sla_hours, escalation_role_id, status, due_at, started_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        requestId,
        s.step_order,
        s.step_name || null,
        s.role_id ?? null,
        s.sla_hours ?? null,
        s.escalation_role_id ?? null,
        status,
        dueAt,
        now,
      ]
    );
  }

  await logAction(requestId, null, submittedBy || null, 'submit', 'Submitted for approval', { entityType, entityId: entityIdStr });

  if (entityType === 'annual_workplan') {
    await syncAnnualWorkplanStatus(entityIdStr, 'Pending approval');
  }

  return getRequestDetail(requestId);
}

/**
 * Enrich step rows with human-readable signer + role for completed approvals (PDF / UI).
 */
async function attachSignerDetailsToSteps(requestId, steps) {
  if (!steps || !steps.length) return steps;
  const sql = isPostgres
    ? `SELECT si.instance_id AS "instanceId",
              NULLIF(TRIM(CONCAT(COALESCE(u.firstname, ''), ' ', COALESCE(u.lastname, ''))), '') AS "signerFullName",
              NULLIF(TRIM(r.name), '') AS "stepApproverRoleName"
       FROM approval_step_instances si
       LEFT JOIN users u ON u.userid = si.completed_by
       LEFT JOIN roles r ON r.roleid = si.role_id
       WHERE si.request_id = ? AND si.status = 'approved'`
    : `SELECT si.instance_id AS instanceId,
              NULLIF(TRIM(CONCAT(COALESCE(u.firstName, ''), ' ', COALESCE(u.lastName, ''))), '') AS signerFullName,
              NULLIF(TRIM(r.roleName), '') AS stepApproverRoleName
       FROM approval_step_instances si
       LEFT JOIN users u ON u.userId = si.completed_by
       LEFT JOIN roles r ON r.roleId = si.role_id
       WHERE si.request_id = ? AND si.status = 'approved'`;
  let rows = [];
  try {
    rows = rowsFromResult(await pool.query(sql, [requestId]));
  } catch (e) {
    console.warn('attachSignerDetailsToSteps: join failed (users/roles schema?)', e.message);
    return steps;
  }
  const byInstance = new Map(
    rows.map((row) => {
      const iid = row.instanceId ?? row.instance_id;
      return [Number(iid), row];
    })
  );
  return steps.map((s) => {
    const iid = Number(s.instance_id ?? s.instanceId);
    const extra = byInstance.get(iid);
    if (!extra) return s;
    const signer =
      extra.signerFullName ??
      extra.signerfullname ??
      (typeof extra.signer_full_name === 'string' ? extra.signer_full_name : null);
    const roleNm =
      extra.stepApproverRoleName ??
      extra.stepapproverrolename ??
      (typeof extra.step_approver_role_name === 'string' ? extra.step_approver_role_name : null);
    return {
      ...s,
      signerFullName: signer || null,
      stepApproverRoleName: roleNm || null,
    };
  });
}

async function getRequestDetail(requestId) {
  await ensureReady();
  const reqRow = firstRow(await pool.query('SELECT * FROM approval_requests WHERE request_id = ?', [requestId]));
  if (!reqRow) return null;
  const stepsRaw = rowsFromResult(
    await pool.query(
      'SELECT * FROM approval_step_instances WHERE request_id = ? ORDER BY step_order ASC',
      [requestId]
    )
  );
  const steps = await attachSignerDetailsToSteps(requestId, stepsRaw);
  const actions = rowsFromResult(
    await pool.query('SELECT * FROM approval_actions WHERE request_id = ? ORDER BY created_at ASC', [requestId])
  );
  return { request: reqRow, steps, actions };
}

async function getRequestByEntity(entityType, entityId) {
  await ensureReady();
  const r = await pool.query(
    `SELECT * FROM approval_requests WHERE entity_type = ? AND entity_id = ? ORDER BY request_id DESC LIMIT 1`,
    [entityType, String(entityId)]
  );
  const row = firstRow(r);
  if (!row) return null;
  return getRequestDetail(row.request_id);
}

async function findCurrentPendingStep(requestId) {
  const r = await pool.query(
    `SELECT * FROM approval_step_instances WHERE request_id = ? AND status = 'pending' ORDER BY step_order ASC LIMIT 1`,
    [requestId]
  );
  return firstRow(r);
}

function userCanActOnStep(user, step, allowAdminPriv) {
  const adminBypass =
    allowAdminPriv &&
    user.privileges &&
    Array.isArray(user.privileges) &&
    user.privileges.includes('approval_levels.update');
  if (adminBypass) return true;
  const rid = user.roleId != null ? Number(user.roleId) : null;
  if (step.role_id == null) return false;
  return rid === Number(step.role_id);
}

async function approveStep({ requestId, user, comment }) {
  await ensureReady();
  const detail = await getRequestDetail(requestId);
  if (!detail || detail.request.status !== 'pending') {
    const err = new Error('Request not found or not pending.');
    err.statusCode = 400;
    throw err;
  }
  const step = await findCurrentPendingStep(requestId);
  if (!step) {
    const err = new Error('No pending approval step.');
    err.statusCode = 400;
    throw err;
  }
  if (!userCanActOnStep(user, step, true)) {
    const err = new Error('You are not authorized to approve this step.');
    err.statusCode = 403;
    throw err;
  }

  const now = new Date();
  await pool.query(
    `UPDATE approval_step_instances SET status = 'approved', completed_at = ?, completed_by = ?, comment = ? WHERE instance_id = ?`,
    [now, user.id, comment || null, step.instance_id]
  );
  await logAction(requestId, step.instance_id, user.id, 'approve', comment || null, { step_order: step.step_order });

  const allSteps = rowsFromResult(
    await pool.query('SELECT * FROM approval_step_instances WHERE request_id = ? ORDER BY step_order ASC', [requestId])
  );
  const next = allSteps.find((s) => s.status === 'waiting');
  if (next) {
    let dueAt = null;
    if (next.sla_hours != null && Number(next.sla_hours) > 0) {
      dueAt = new Date(now.getTime() + Number(next.sla_hours) * 3600000);
    }
    await pool.query(
      `UPDATE approval_step_instances SET status = 'pending', due_at = ?, started_at = ? WHERE instance_id = ?`,
      [dueAt, now, next.instance_id]
    );
    await pool.query(`UPDATE approval_requests SET current_step_order = ?, updated_at = ? WHERE request_id = ?`, [
      next.step_order,
      now,
      requestId,
    ]);
  } else {
    await pool.query(
      `UPDATE approval_requests SET status = 'approved', resolved_at = ?, updated_at = ? WHERE request_id = ?`,
      [now, now, requestId]
    );
    const ent = detail.request;
    if (ent.entity_type === 'annual_workplan') {
      await syncAnnualWorkplanStatus(ent.entity_id, 'Approved');
    }
  }

  return getRequestDetail(requestId);
}

async function rejectStep({ requestId, user, comment }) {
  await ensureReady();
  const detail = await getRequestDetail(requestId);
  if (!detail || detail.request.status !== 'pending') {
    const err = new Error('Request not found or not pending.');
    err.statusCode = 400;
    throw err;
  }
  const step = await findCurrentPendingStep(requestId);
  if (!step) {
    const err = new Error('No pending approval step.');
    err.statusCode = 400;
    throw err;
  }
  if (!userCanActOnStep(user, step, true)) {
    const err = new Error('You are not authorized to reject this step.');
    err.statusCode = 403;
    throw err;
  }
  const now = new Date();
  await pool.query(
    `UPDATE approval_step_instances SET status = 'rejected', completed_at = ?, completed_by = ?, comment = ? WHERE instance_id = ?`,
    [now, user.id, comment || null, step.instance_id]
  );
  await logAction(requestId, step.instance_id, user.id, 'reject', comment || null, { step_order: step.step_order });
  await pool.query(`UPDATE approval_requests SET status = 'rejected', resolved_at = ?, updated_at = ? WHERE request_id = ?`, [
    now,
    now,
    requestId,
  ]);
  const ent = detail.request;
  if (ent.entity_type === 'annual_workplan') {
    await syncAnnualWorkplanStatus(ent.entity_id, 'Rejected');
  }
  return getRequestDetail(requestId);
}

async function listPendingForUser(user) {
  await ensureReady();
  const roleId = user.roleId != null ? Number(user.roleId) : -1;
  const r = await pool.query(
    `
    SELECT r.*, si.instance_id, si.step_order, si.step_name, si.due_at, d.link_template AS link_template
    FROM approval_requests r
    JOIN approval_step_instances si ON si.request_id = r.request_id AND si.status = 'pending'
    JOIN approval_workflow_definitions d ON d.definition_id = r.definition_id
    WHERE r.status = 'pending' AND si.role_id = ?
    ORDER BY r.created_at ASC
  `,
    [roleId]
  );
  return rowsFromResult(r);
}

async function processSlaEscalations() {
  await ensureReady();
  const now = new Date();
  const r = await pool.query(
    `
    SELECT si.*, r.request_id AS r_request_id
    FROM approval_step_instances si
    JOIN approval_requests r ON r.request_id = si.request_id
    WHERE si.status = 'pending' AND r.status = 'pending'
      AND si.due_at IS NOT NULL AND si.due_at < ?
  `,
    [now]
  );
  const overdue = rowsFromResult(r);
  let escalated = 0;
  for (const si of overdue) {
    if (!si.escalation_role_id) continue;
    const newDue =
      si.sla_hours != null && Number(si.sla_hours) > 0
        ? new Date(now.getTime() + Number(si.sla_hours) * 3600000)
        : null;
    const note = `[SLA] Escalated at ${now.toISOString()} — reassigned to role ${si.escalation_role_id}`;
    await pool.query(
      `UPDATE approval_step_instances SET role_id = ?, escalation_role_id = NULL, due_at = ?, comment = CONCAT(COALESCE(comment, ''), ?, ?) WHERE instance_id = ?`,
      [si.escalation_role_id, newDue, '\n', note, si.instance_id]
    );
    await logAction(si.request_id, si.instance_id, null, 'escalate_sla', 'Escalated after SLA breach', {
      new_role_id: si.escalation_role_id,
    });
    escalated += 1;
  }
  return { processed: overdue.length, escalated };
}

async function seedAnnualWorkplanExample() {
  await ensureReady();
  const existing = firstRow(
    await pool.query(`SELECT * FROM approval_workflow_definitions WHERE entity_type = 'annual_workplan' LIMIT 1`)
  );
  if (existing) return { skipped: true, definition_id: existing.definition_id };

  const rolesR = await pool.query(
    isPostgres
      ? 'SELECT roleid AS "roleId" FROM roles WHERE voided = false ORDER BY roleid ASC LIMIT 2'
      : 'SELECT roleId AS roleId FROM roles WHERE voided = 0 ORDER BY roleId ASC LIMIT 2'
  );
  const roles = rowsFromResult(rolesR);
  const pickRid = (row) => (row ? row.roleId ?? row.roleid : null);
  const r1 = pickRid(roles[0]);
  const r2 = pickRid(roles[1]) || r1;
  if (!r1) {
    const err = new Error('No roles in database; cannot seed workflow.');
    err.statusCode = 400;
    throw err;
  }

  const { definition_id } = await createDefinition({
    entity_type: 'annual_workplan',
    code: 'default',
    version: 1,
    name: 'Annual work plan (default)',
    active: true,
    link_template: '/strategic-planning?focusWorkplan={{entity_id}}',
    steps: [
      { step_order: 1, step_name: 'Level 1 review', role_id: r1, sla_hours: 72, escalation_role_id: r2 },
      { step_order: 2, step_name: 'Level 2 review', role_id: r2, sla_hours: 120, escalation_role_id: null },
    ],
  });
  return { definition_id, seeded: true };
}

/**
 * Sample workflow for payment-style approvals using the generic engine.
 * Start a run: POST /api/approval-workflow/requests/start
 *   { "entityType": "payment_request", "entityId": "<project_payment_requests.requestId>" }
 * (Integrate that call from payment UI when you retire the legacy ladder.)
 */
async function seedPaymentRequestExample() {
  await ensureReady();
  const existing = firstRow(
    await pool.query(`SELECT * FROM approval_workflow_definitions WHERE entity_type = 'payment_request' LIMIT 1`)
  );
  if (existing) return { skipped: true, definition_id: existing.definition_id };

  const rolesR = await pool.query(
    isPostgres
      ? 'SELECT roleid AS "roleId" FROM roles WHERE voided = false ORDER BY roleid ASC LIMIT 3'
      : 'SELECT roleId AS roleId FROM roles WHERE voided = 0 ORDER BY roleId ASC LIMIT 3'
  );
  const roles = rowsFromResult(rolesR);
  const pickRid = (row) => (row ? row.roleId ?? row.roleid : null);
  const r1 = pickRid(roles[0]);
  const r2 = pickRid(roles[1]) || r1;
  const r3 = pickRid(roles[2]) || r2;
  if (!r1) {
    const err = new Error('No roles in database; cannot seed workflow.');
    err.statusCode = 400;
    throw err;
  }

  const { definition_id } = await createDefinition({
    entity_type: 'payment_request',
    code: 'default',
    version: 1,
    name: 'Payment request (generic example)',
    active: true,
    link_template: '/projects?focusPaymentRequest={{entity_id}}',
    steps: [
      { step_order: 1, step_name: 'Departmental review', role_id: r1, sla_hours: 48, escalation_role_id: r2 },
      { step_order: 2, step_name: 'Finance review', role_id: r2, sla_hours: 72, escalation_role_id: r3 },
      { step_order: 3, step_name: 'Final authorization', role_id: r3, sla_hours: null, escalation_role_id: null },
    ],
  });
  return { definition_id, seeded: true };
}

module.exports = {
  ensureReady,
  listDefinitions,
  getDefinitionSteps,
  getDefinitionById,
  createDefinition,
  updateDefinition,
  getActiveDefinitionForEntityType,
  startRequest,
  getRequestDetail,
  getRequestByEntity,
  approveStep,
  rejectStep,
  listPendingForUser,
  processSlaEscalations,
  seedAnnualWorkplanExample,
  seedPaymentRequestExample,
};
