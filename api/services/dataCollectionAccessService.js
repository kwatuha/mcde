const pool = require('../config/db');
const { isAdminLikeRequester } = require('../utils/roleUtils');
const { ensureDataCollectionTemplatesTable } = require('./dataCollectionSchema');

async function ensureTemplateAccessTables() {
  await ensureDataCollectionTemplatesTable();
  await pool.query(`
    ALTER TABLE data_collection_templates
    ADD COLUMN IF NOT EXISTS restrict_access BOOLEAN NOT NULL DEFAULT FALSE
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS data_collection_template_roles (
      template_id INTEGER NOT NULL REFERENCES data_collection_templates(template_id) ON DELETE CASCADE,
      role_id INTEGER NOT NULL,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (template_id, role_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS data_collection_template_users (
      template_id INTEGER NOT NULL REFERENCES data_collection_templates(template_id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (template_id, user_id)
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_dct_roles_role_id
    ON data_collection_template_roles (role_id)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_dct_users_user_id
    ON data_collection_template_users (user_id)
  `);
}

function userContextFromReq(req) {
  const user = req?.user || {};
  return {
    userId: user.id ?? user.userId ?? null,
    roleId: user.roleId ?? user.roleid ?? null,
    isAdmin: isAdminLikeRequester(user),
  };
}

function templateAccessSql(alias, ctx, manageMode, paramOffset = 0) {
  if (manageMode && ctx.isAdmin) {
    return { clause: '', params: [] };
  }
  const params = [];
  const parts = [`COALESCE(${alias}.restrict_access, false) = false`];
  let n = paramOffset;
  if (ctx.userId != null) {
    params.push(ctx.userId);
    n += 1;
    parts.push(`${alias}.created_by = $${n}`);
    params.push(ctx.userId);
    n += 1;
    parts.push(
      `EXISTS (SELECT 1 FROM data_collection_template_users tu WHERE tu.template_id = ${alias}.template_id AND tu.user_id = $${n})`
    );
  }
  if (ctx.roleId != null) {
    params.push(ctx.roleId);
    n += 1;
    parts.push(
      `EXISTS (SELECT 1 FROM data_collection_template_roles tr WHERE tr.template_id = ${alias}.template_id AND tr.role_id = $${n})`
    );
  }
  return { clause: `(${parts.join(' OR ')})`, params };
}

async function canUserAccessTemplate(templateId, ctx, manageMode = false) {
  if (manageMode && ctx.isAdmin) return true;
  await ensureTemplateAccessTables();
  const access = templateAccessSql('t', ctx, false, 1);
  const params = [templateId, ...access.params];
  const r = await pool.query(
    `
    SELECT template_id
    FROM data_collection_templates t
    WHERE t.template_id = $1
      AND COALESCE(t.voided, false) = false
      AND ${access.clause}
    LIMIT 1
    `,
    params
  );
  return Boolean(r.rows?.[0]);
}

async function loadTemplateAccess(templateId) {
  await ensureTemplateAccessTables();
  const t = await pool.query(
    `SELECT restrict_access FROM data_collection_templates WHERE template_id = $1 AND COALESCE(voided,false)=false`,
    [templateId]
  );
  if (!t.rows?.[0]) return null;
  const roles = await pool.query(
    `
    SELECT tr.role_id AS "roleId", r.name AS "roleName"
    FROM data_collection_template_roles tr
    LEFT JOIN roles r ON r.roleid = tr.role_id
    WHERE tr.template_id = $1
    ORDER BY r.name ASC NULLS LAST
    `,
    [templateId]
  );
  const users = await pool.query(
    `
    SELECT tu.user_id AS "userId",
           TRIM(COALESCE(u.firstname, '') || ' ' || COALESCE(u.lastname, '')) AS "displayName",
           u.username AS "username",
           u.email AS "email"
    FROM data_collection_template_users tu
    LEFT JOIN users u ON u.userid = tu.user_id
    WHERE tu.template_id = $1
    ORDER BY u.firstname ASC NULLS LAST, u.lastname ASC NULLS LAST
    `,
    [templateId]
  );
  return {
    restrictAccess: Boolean(t.rows[0].restrict_access),
    roleIds: (roles.rows || []).map((row) => Number(row.roleId)).filter(Number.isFinite),
    userIds: (users.rows || []).map((row) => Number(row.userId)).filter(Number.isFinite),
    roles: roles.rows || [],
    users: users.rows || [],
  };
}

async function saveTemplateAccess(templateId, { restrictAccess, roleIds, userIds }) {
  await ensureTemplateAccessTables();
  await pool.query(
    `UPDATE data_collection_templates SET restrict_access = $1, updated_at = CURRENT_TIMESTAMP WHERE template_id = $2`,
    [!!restrictAccess, templateId]
  );
  await pool.query(`DELETE FROM data_collection_template_roles WHERE template_id = $1`, [templateId]);
  await pool.query(`DELETE FROM data_collection_template_users WHERE template_id = $1`, [templateId]);
  const roles = Array.isArray(roleIds) ? [...new Set(roleIds.map((id) => parseInt(String(id), 10)).filter(Number.isFinite))] : [];
  const users = Array.isArray(userIds) ? [...new Set(userIds.map((id) => parseInt(String(id), 10)).filter(Number.isFinite))] : [];
  for (const roleId of roles) {
    await pool.query(
      `INSERT INTO data_collection_template_roles (template_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [templateId, roleId]
    );
  }
  for (const userId of users) {
    await pool.query(
      `INSERT INTO data_collection_template_users (template_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [templateId, userId]
    );
  }
}

module.exports = {
  ensureTemplateAccessTables,
  userContextFromReq,
  templateAccessSql,
  canUserAccessTemplate,
  loadTemplateAccess,
  saveTemplateAccess,
};
