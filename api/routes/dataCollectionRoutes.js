const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const pool = require('../config/db');
const {
  ensureDataCollectionTemplatesTable,
  ensureDataCollectionSubmissionsTable,
  ensureDataCollectionAttachmentsTable,
} = require('../services/dataCollectionSchema');
const villageMonitoring = require('../services/villageMonitoringWorkflowService');
const {
  normalizeStructure,
  validateAnswers,
  photoList,
  extractProgressStatus,
} = require('../services/checklistAnswerUtils');
const {
  ensureTemplateAccessTables,
  userContextFromReq,
  templateAccessSql,
  canUserAccessTemplate,
  loadTemplateAccess,
  saveTemplateAccess,
} = require('../services/dataCollectionAccessService');
const {
  isProjectFieldSource,
  fetchProjectFieldOptions,
  fetchFieldOptions,
  normalizeSubjectType,
} = require('../services/dataCollectionProjectFieldsService');

const router = express.Router();

const uploadsRoot = path.join(__dirname, '..', '..', 'uploads', 'data-collection');
if (!fs.existsSync(uploadsRoot)) {
  fs.mkdirSync(uploadsRoot, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const year = new Date().getFullYear();
    const dir = path.join(uploadsRoot, String(year));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '.jpg';
    const base = path.basename(file.originalname || 'photo', ext).replace(/[^a-zA-Z0-9-_]/g, '_');
    cb(null, `${Date.now()}-${base}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = file.originalname || '';
    const mime = file.mimetype || '';
    const ok =
      /^image\//.test(mime) ||
      /\.(jpe?g|png|gif|webp|heic)$/i.test(name) ||
      (mime === 'application/octet-stream' && /\.(jpe?g|png|gif|webp|heic)$/i.test(name));
    if (!ok) {
      return cb(new Error(`Unsupported attachment type: ${mime || 'unknown'}`));
    }
    cb(null, true);
  },
});

function userIdFromReq(req) {
  return req.user?.id ?? req.user?.userId ?? null;
}

function publicUrlForPath(filePath) {
  const normalized = String(filePath || '').replace(/\\/g, '/');
  const idx = normalized.indexOf('/uploads/');
  if (idx >= 0) return normalized.slice(idx);
  return `/uploads/data-collection/${path.basename(normalized)}`;
}

function rowToAttachment(row) {
  if (!row) return null;
  return {
    fileId: row.file_id,
    submissionId: row.submission_id,
    itemId: row.item_id,
    fileName: row.file_name,
    url: publicUrlForPath(row.file_path),
    mimeType: row.mime_type,
    fileSize: row.file_size,
    lat: row.lat,
    lng: row.lng,
    accuracy: row.accuracy,
    capturedAt: row.captured_at,
    createdAt: row.created_at,
  };
}

function rowToTemplate(row, extras = {}) {
  if (!row) return null;
  return {
    templateId: row.template_id,
    name: row.name,
    description: row.description,
    templateCategory: row.template_category,
    structure: row.structure,
    isActive: row.is_active,
    allowedSubjectTypes: Array.isArray(row.allowed_subject_types)
      ? row.allowed_subject_types
      : ['project'],
    restrictAccess: row.restrict_access != null ? Boolean(row.restrict_access) : false,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...extras,
  };
}

function rowToSubmission(row) {
  if (!row) return null;
  return {
    submissionId: row.submission_id,
    templateId: row.template_id,
    templateName: row.template_name,
    subjectType: row.subject_type || 'project',
    projectId: row.project_id,
    rriProgrammeId: row.rri_programme_id,
    rriProgrammeName: row.rri_programme_name || null,
    inspectionId: row.inspection_id,
    visitDate: row.visit_date,
    title: row.title,
    answers: row.answers,
    progressStatus: row.progress_status || null,
    workflowStatus: row.workflow_status || 'draft',
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function linkAttachmentsToSubmission(submissionId, answers) {
  const fileIds = [];
  for (const value of Object.values(answers || {})) {
    for (const p of photoList(value)) {
      if (p?.fileId != null) fileIds.push(Number(p.fileId));
    }
  }
  const unique = [...new Set(fileIds.filter((id) => Number.isFinite(id)))];
  if (!unique.length) return;
  await ensureDataCollectionAttachmentsTable();
  await pool.query(
    `
    UPDATE data_collection_attachments
    SET submission_id = $1
    WHERE file_id = ANY($2::int[]) AND (submission_id IS NULL OR submission_id = $1)
    `,
    [submissionId, unique]
  );
}

router.post('/attachments', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ message: err.message || 'Invalid attachment upload.' });
    }
    next();
  });
}, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      message: 'file is required (image). Send multipart/form-data with a file field named "file".',
    });
  }
  const itemId = req.body?.itemId != null ? String(req.body.itemId).trim() || null : null;
  const lat = req.body?.lat != null && req.body.lat !== '' ? Number(req.body.lat) : null;
  const lng = req.body?.lng != null && req.body.lng !== '' ? Number(req.body.lng) : null;
  const accuracy =
    req.body?.accuracy != null && req.body.accuracy !== '' ? Number(req.body.accuracy) : null;
  const capturedAt = req.body?.capturedAt ? String(req.body.capturedAt).slice(0, 32) : null;

  try {
    await ensureDataCollectionAttachmentsTable();
    const createdBy = userIdFromReq(req);
    const relPath = `/uploads/data-collection/${path.basename(path.dirname(req.file.path))}/${req.file.filename}`;
    const r = await pool.query(
      `
      INSERT INTO data_collection_attachments
        (submission_id, item_id, file_name, file_path, mime_type, file_size,
         lat, lng, accuracy, captured_at, created_by, created_at)
      VALUES (NULL, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
      RETURNING file_id, submission_id, item_id, file_name, file_path, mime_type, file_size,
                lat, lng, accuracy, captured_at, created_at
      `,
      [
        itemId,
        req.file.originalname || req.file.filename,
        relPath,
        req.file.mimetype || null,
        req.file.size || null,
        Number.isFinite(lat) ? lat : null,
        Number.isFinite(lng) ? lng : null,
        Number.isFinite(accuracy) ? accuracy : null,
        capturedAt,
        createdBy,
      ]
    );
    return res.status(201).json(rowToAttachment(r.rows[0]));
  } catch (e) {
    console.error('data-collection attachment upload:', e);
    return res.status(500).json({ message: 'Failed to upload attachment.', details: e.message });
  }
});

router.get('/attachments/:id', async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid file id.' });
  try {
    await ensureDataCollectionAttachmentsTable();
    const r = await pool.query(
      `SELECT * FROM data_collection_attachments WHERE file_id = $1`,
      [id]
    );
    const row = rowToAttachment(r.rows?.[0]);
    if (!row) return res.status(404).json({ message: 'Attachment not found.' });
    return res.json(row);
  } catch (e) {
    console.error('data-collection attachment get:', e);
    return res.status(500).json({ message: 'Failed to load attachment.', details: e.message });
  }
});

router.get('/project-field-options', async (req, res) => {
  const source = String(req.query.source || '').trim();
  const subjectType = normalizeSubjectType(req.query.subjectType || req.query.subject_type || 'project');
  const projectId = parseInt(String(req.query.projectId ?? ''), 10);
  const rriProgrammeId = parseInt(String(req.query.rriProgrammeId ?? req.query.rri_programme_id ?? ''), 10);
  if (!isProjectFieldSource(source)) {
    return res.status(400).json({ message: 'source must be project_milestones, project_bq_items, or indicator.' });
  }
  try {
    const payload = await fetchFieldOptions({
      source,
      subjectType,
      projectId: Number.isFinite(projectId) ? projectId : null,
      rriProgrammeId: Number.isFinite(rriProgrammeId) ? rriProgrammeId : null,
    });
    return res.json(payload);
  } catch (e) {
    console.error('data-collection project-field-options:', e);
    return res.status(500).json({ message: 'Failed to load field options.', details: e.message });
  }
});

router.get('/field-options', async (req, res) => {
  const source = String(req.query.source || '').trim();
  const subjectType = normalizeSubjectType(req.query.subjectType || req.query.subject_type || 'project');
  const projectId = parseInt(String(req.query.projectId ?? ''), 10);
  const rriProgrammeId = parseInt(String(req.query.rriProgrammeId ?? req.query.rri_programme_id ?? ''), 10);
  if (!isProjectFieldSource(source)) {
    return res.status(400).json({ message: 'Invalid source.' });
  }
  try {
    const payload = await fetchFieldOptions({
      source,
      subjectType,
      projectId: Number.isFinite(projectId) ? projectId : null,
      rriProgrammeId: Number.isFinite(rriProgrammeId) ? rriProgrammeId : null,
    });
    return res.json(payload);
  } catch (e) {
    console.error('data-collection field-options:', e);
    return res.status(500).json({ message: 'Failed to load field options.', details: e.message });
  }
});

router.get('/templates', async (req, res) => {
  const category = req.query.category ? String(req.query.category) : null;
  const activeOnly = String(req.query.active || 'true') !== 'false';
  const manageMode = String(req.query.manage || 'false') === 'true';
  try {
    await ensureDataCollectionTemplatesTable();
    await ensureTemplateAccessTables();
    const ctx = userContextFromReq(req);
    const params = [];
    let where = 'WHERE COALESCE(t.voided, false) = false';
    if (activeOnly) where += ' AND COALESCE(t.is_active, true) = true';
    if (category) {
      params.push(category);
      where += ` AND t.template_category = $${params.length}`;
    }
    const access = templateAccessSql('t', ctx, manageMode, params.length);
    if (access.clause) {
      params.push(...access.params);
      where += ` AND ${access.clause}`;
    }
    const r = await pool.query(
      `
      SELECT t.template_id, t.name, t.description, t.template_category, t.structure, t.is_active,
             t.restrict_access, t.allowed_subject_types,
             t.created_by, t.created_at, t.updated_at
      FROM data_collection_templates t
      ${where}
      ORDER BY t.name ASC, t.template_id ASC
      `,
      params
    );
    return res.json((r.rows || []).map((row) => rowToTemplate(row)));
  } catch (e) {
    console.error('data-collection templates list:', e);
    return res.status(500).json({ message: 'Failed to list templates.', details: e.message });
  }
});

router.get('/templates/:id', async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid template id.' });
  const manageMode = String(req.query.manage || 'false') === 'true';
  try {
    await ensureDataCollectionTemplatesTable();
    await ensureTemplateAccessTables();
    const ctx = userContextFromReq(req);
    const allowed = await canUserAccessTemplate(id, ctx, manageMode);
    if (!allowed) return res.status(403).json({ message: 'You do not have access to this template.' });
    const r = await pool.query(
      `
      SELECT template_id, name, description, template_category, structure, is_active, restrict_access,
             allowed_subject_types, created_by, created_at, updated_at
      FROM data_collection_templates
      WHERE template_id = $1 AND COALESCE(voided, false) = false
      `,
      [id]
    );
    const extras = {};
    if (manageMode && ctx.isAdmin) {
      extras.access = await loadTemplateAccess(id);
    }
    const t = rowToTemplate(r.rows?.[0], extras);
    if (!t) return res.status(404).json({ message: 'Template not found.' });
    return res.json(t);
  } catch (e) {
    console.error('data-collection template get:', e);
    return res.status(500).json({ message: 'Failed to load template.', details: e.message });
  }
});

router.post('/templates', async (req, res) => {
  const { name, description, templateCategory, structure, isActive, restrictAccess, roleIds, userIds, allowedSubjectTypes } =
    req.body || {};
  const title = String(name || '').trim();
  if (!title) return res.status(400).json({ message: 'name is required.' });
  const cat = String(templateCategory || 'general').trim() || 'general';
  const struct = normalizeStructure(structure);
  if (!struct.sections.length) {
    return res.status(400).json({ message: 'Template must include at least one section with items.' });
  }
  try {
    await ensureDataCollectionTemplatesTable();
    await ensureTemplateAccessTables();
    const createdBy = userIdFromReq(req);
    const allowedSubjects = parseAllowedSubjectTypes(allowedSubjectTypes);
    const r = await pool.query(
      `
      INSERT INTO data_collection_templates
        (name, description, template_category, structure, is_active, restrict_access, allowed_subject_types, created_by, created_at, updated_at, voided)
      VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7::jsonb, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, false)
      RETURNING template_id, name, description, template_category, structure, is_active, restrict_access,
                allowed_subject_types, created_by, created_at, updated_at
      `,
      [
        title,
        description != null ? String(description) : null,
        cat,
        JSON.stringify(struct),
        isActive === false ? false : true,
        !!restrictAccess,
        JSON.stringify(allowedSubjects),
        createdBy,
      ]
    );
    const row = r.rows[0];
    if (restrictAccess || (Array.isArray(roleIds) && roleIds.length) || (Array.isArray(userIds) && userIds.length)) {
      await saveTemplateAccess(row.template_id, { restrictAccess: !!restrictAccess, roleIds, userIds });
    }
    return res.status(201).json(rowToTemplate(row));
  } catch (e) {
    console.error('data-collection template create:', e);
    return res.status(500).json({ message: 'Failed to create template.', details: e.message });
  }
});

router.put('/templates/:id', async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid template id.' });
  const {
    name,
    description,
    templateCategory,
    structure,
    isActive,
    restrictAccess,
    roleIds,
    userIds,
    allowedSubjectTypes,
  } = req.body || {};
  try {
    await ensureDataCollectionTemplatesTable();
    await ensureTemplateAccessTables();
    const cur = await pool.query(
      `SELECT * FROM data_collection_templates WHERE template_id = $1 AND COALESCE(voided,false)=false`,
      [id]
    );
    if (!cur.rows?.[0]) return res.status(404).json({ message: 'Template not found.' });

    const nextName = name != null ? String(name).trim() : cur.rows[0].name;
    if (!nextName) return res.status(400).json({ message: 'name cannot be empty.' });
    const nextDesc = description !== undefined ? (description != null ? String(description) : null) : cur.rows[0].description;
    const nextCat =
      templateCategory != null
        ? String(templateCategory).trim() || 'general'
        : cur.rows[0].template_category;
    let nextStruct = cur.rows[0].structure;
    if (structure !== undefined) {
      const n = normalizeStructure(structure);
      if (!n.sections.length) {
        return res.status(400).json({ message: 'Template must include at least one section with items.' });
      }
      nextStruct = n;
    }
    const nextActive = isActive !== undefined ? !!isActive : cur.rows[0].is_active;
    const nextRestrict =
      restrictAccess !== undefined ? !!restrictAccess : Boolean(cur.rows[0].restrict_access);
    const nextAllowedSubjects =
      allowedSubjectTypes !== undefined
        ? parseAllowedSubjectTypes(allowedSubjectTypes)
        : parseAllowedSubjectTypes(cur.rows[0].allowed_subject_types);

    const r = await pool.query(
      `
      UPDATE data_collection_templates
      SET name = $1, description = $2, template_category = $3, structure = $4::jsonb,
          is_active = $5, restrict_access = $6, allowed_subject_types = $7::jsonb, updated_at = CURRENT_TIMESTAMP
      WHERE template_id = $8 AND COALESCE(voided,false)=false
      RETURNING template_id, name, description, template_category, structure, is_active, restrict_access,
                allowed_subject_types, created_by, created_at, updated_at
      `,
      [nextName, nextDesc, nextCat, JSON.stringify(nextStruct), nextActive, nextRestrict, JSON.stringify(nextAllowedSubjects), id]
    );
    if (restrictAccess !== undefined || roleIds !== undefined || userIds !== undefined) {
      await saveTemplateAccess(id, {
        restrictAccess: nextRestrict,
        roleIds: roleIds !== undefined ? roleIds : (await loadTemplateAccess(id))?.roleIds,
        userIds: userIds !== undefined ? userIds : (await loadTemplateAccess(id))?.userIds,
      });
    }
    return res.json(rowToTemplate(r.rows[0]));
  } catch (e) {
    console.error('data-collection template update:', e);
    return res.status(500).json({ message: 'Failed to update template.', details: e.message });
  }
});

router.delete('/templates/:id', async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid template id.' });
  try {
    await ensureDataCollectionTemplatesTable();
    const r = await pool.query(
      `
      UPDATE data_collection_templates
      SET voided = true, is_active = false, updated_at = CURRENT_TIMESTAMP
      WHERE template_id = $1 AND COALESCE(voided,false)=false
      RETURNING template_id
      `,
      [id]
    );
    if (!r.rows?.[0]) return res.status(404).json({ message: 'Template not found.' });
    return res.json({ ok: true, templateId: id });
  } catch (e) {
    console.error('data-collection template delete:', e);
    return res.status(500).json({ message: 'Failed to delete template.', details: e.message });
  }
});

router.get('/submissions', async (req, res) => {
  const projectId = req.query.projectId != null ? parseInt(String(req.query.projectId), 10) : null;
  const rriProgrammeId =
    req.query.rriProgrammeId != null || req.query.rri_programme_id != null
      ? parseInt(String(req.query.rriProgrammeId ?? req.query.rri_programme_id), 10)
      : null;
  const subjectTypeRaw = req.query.subjectType ?? req.query.subject_type ?? null;
  const subjectType =
    subjectTypeRaw != null && String(subjectTypeRaw).trim() !== ''
      ? normalizeSubjectType(subjectTypeRaw)
      : null;
  try {
    await ensureDataCollectionSubmissionsTable();
    await villageMonitoring.ensureMonitoringWorkflowSchema();
    const params = [];
    let where = 'WHERE COALESCE(s.voided, false) = false';
    if (Number.isFinite(projectId)) {
      params.push(projectId);
      where += ` AND s.project_id = $${params.length}`;
    }
    if (Number.isFinite(rriProgrammeId)) {
      params.push(rriProgrammeId);
      where += ` AND s.rri_programme_id = $${params.length}`;
    }
    if (subjectType === 'project' || subjectType === 'rri_programme') {
      params.push(subjectType);
      where += ` AND s.subject_type = $${params.length}`;
    }
    const r = await pool.query(
      `
      SELECT s.submission_id, s.template_id, t.name AS template_name,
             s.subject_type, s.project_id, s.rri_programme_id, rp.name AS rri_programme_name,
             s.inspection_id, s.visit_date, s.title, s.answers, s.progress_status, s.workflow_status,
             s.created_by, s.created_at, s.updated_at
      FROM data_collection_submissions s
      JOIN data_collection_templates t ON t.template_id = s.template_id
      LEFT JOIN rri_programmes rp ON rp.programme_id = s.rri_programme_id AND COALESCE(rp.voided, false) = false
      ${where}
      ORDER BY s.visit_date DESC NULLS LAST, s.submission_id DESC
      LIMIT 500
      `,
      params
    );
    return res.json((r.rows || []).map(rowToSubmission));
  } catch (e) {
    console.error('data-collection submissions list:', e);
    return res.status(500).json({ message: 'Failed to list submissions.', details: e.message });
  }
});

router.get('/submissions/:id', async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid submission id.' });
  try {
    await ensureDataCollectionSubmissionsTable();
    const r = await pool.query(
      `
      SELECT s.submission_id, s.template_id, t.name AS template_name,
             s.subject_type, s.project_id, s.rri_programme_id, rp.name AS rri_programme_name,
             s.inspection_id, s.visit_date, s.title, s.answers, s.progress_status, s.workflow_status,
             s.created_by, s.created_at, s.updated_at
      FROM data_collection_submissions s
      JOIN data_collection_templates t ON t.template_id = s.template_id
      LEFT JOIN rri_programmes rp ON rp.programme_id = s.rri_programme_id AND COALESCE(rp.voided, false) = false
      WHERE s.submission_id = $1 AND COALESCE(s.voided, false) = false
      `,
      [id]
    );
    const row = r.rows?.[0];
    if (!row) return res.status(404).json({ message: 'Submission not found.' });
    return res.json(rowToSubmission(row));
  } catch (e) {
    console.error('data-collection submission get:', e);
    return res.status(500).json({ message: 'Failed to load submission.', details: e.message });
  }
});

function parseAllowedSubjectTypes(raw) {
  if (Array.isArray(raw) && raw.length) {
    const list = raw.map((v) => String(v).trim().toLowerCase()).filter((v) => v === 'project' || v === 'rri_programme');
    return list.length ? [...new Set(list)] : ['project'];
  }
  return ['project'];
}

router.post('/submissions', async (req, res) => {
  const {
    templateId,
    projectId,
    rriProgrammeId,
    subjectType: subjectTypeRaw,
    inspectionId,
    visitDate,
    title,
    answers,
  } = req.body || {};
  const tid = parseInt(String(templateId), 10);
  const subjectType = normalizeSubjectType(subjectTypeRaw);
  const pid = projectId != null ? parseInt(String(projectId), 10) : null;
  const rid = rriProgrammeId != null ? parseInt(String(rriProgrammeId), 10) : null;
  const iid = inspectionId != null ? parseInt(String(inspectionId), 10) : null;
  if (!Number.isFinite(tid)) return res.status(400).json({ message: 'templateId is required.' });
  if (subjectType === 'project' && !Number.isFinite(pid)) {
    return res.status(400).json({ message: 'projectId is required when subject type is project.' });
  }
  if (subjectType === 'rri_programme' && !Number.isFinite(rid)) {
    return res.status(400).json({ message: 'rriProgrammeId is required when subject type is RRI programme.' });
  }

  try {
    await ensureDataCollectionSubmissionsTable();
    const tr = await pool.query(
      `
      SELECT structure, allowed_subject_types FROM data_collection_templates
      WHERE template_id = $1 AND COALESCE(voided,false)=false AND COALESCE(is_active,true)=true
      `,
      [tid]
    );
    const structure = tr.rows?.[0]?.structure;
    if (!structure) return res.status(404).json({ message: 'Template not found or inactive.' });
    const allowedSubjects = parseAllowedSubjectTypes(tr.rows?.[0]?.allowed_subject_types);
    if (!allowedSubjects.includes(subjectType)) {
      return res.status(400).json({
        message: `This template does not support subject type "${subjectType}".`,
        allowedSubjectTypes: allowedSubjects,
      });
    }
    const ctx = userContextFromReq(req);
    const allowed = await canUserAccessTemplate(tid, ctx, false);
    if (!allowed) return res.status(403).json({ message: 'You do not have access to this template.' });

    const ans = answers && typeof answers === 'object' ? answers : {};
    const missing = validateAnswers(structure, ans);
    if (missing.length) {
      return res.status(400).json({ message: 'Required checklist items are missing.', missing });
    }

    const createdBy = userIdFromReq(req);
    const r = await pool.query(
      `
      INSERT INTO data_collection_submissions
        (template_id, subject_type, project_id, rri_programme_id, inspection_id, visit_date, title, answers, created_by, created_at, updated_at, voided)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, false)
      RETURNING submission_id, template_id, subject_type, project_id, rri_programme_id, inspection_id, visit_date, title, answers,
                created_by, created_at, updated_at
      `,
      [
        tid,
        subjectType,
        subjectType === 'project' ? pid : null,
        subjectType === 'rri_programme' ? rid : null,
        Number.isFinite(iid) ? iid : null,
        visitDate ? String(visitDate).slice(0, 10) : null,
        title != null ? String(title).trim() || null : null,
        JSON.stringify(ans),
        createdBy,
      ]
    );
    const row = r.rows[0];
    await linkAttachmentsToSubmission(row.submission_id, ans);
    const progressStatus = req.body?.progressStatus || req.body?.progress_status
      || extractProgressStatus(structure, ans)
      || null;
    if (subjectType === 'project' && Number.isFinite(pid)) {
      try {
        await villageMonitoring.initSubmissionWorkflow(row.submission_id, {
          projectId: pid,
          progressStatus,
          userId: createdBy,
          user: req.user,
        });
      } catch (wfErr) {
        console.warn('monitoring workflow init:', wfErr.message);
      }
    }
    const nameR = await pool.query(`SELECT name FROM data_collection_templates WHERE template_id = $1`, [tid]);
    return res.status(201).json(
      rowToSubmission({
        ...row,
        template_name: nameR.rows?.[0]?.name,
      })
    );
  } catch (e) {
    console.error('data-collection submission create:', e);
    return res.status(500).json({
      message: 'Failed to save submission.',
      details: e.message,
      code: e.code || undefined,
    });
  }
});

router.put('/submissions/:id', async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid submission id.' });
  const {
    templateId,
    projectId,
    rriProgrammeId,
    subjectType: subjectTypeRaw,
    inspectionId,
    visitDate,
    title,
    answers,
  } = req.body || {};
  const tid = templateId != null ? parseInt(String(templateId), 10) : null;
  const pid = projectId != null ? parseInt(String(projectId), 10) : null;
  const rid = rriProgrammeId != null ? parseInt(String(rriProgrammeId), 10) : null;
  const iid = inspectionId != null ? parseInt(String(inspectionId), 10) : null;
  try {
    await ensureDataCollectionSubmissionsTable();
    const cur = await pool.query(
      `
      SELECT submission_id, template_id, subject_type, project_id, rri_programme_id, inspection_id, visit_date, title, answers
      FROM data_collection_submissions
      WHERE submission_id = $1 AND COALESCE(voided, false) = false
      `,
      [id]
    );
    const existing = cur.rows?.[0];
    if (!existing) return res.status(404).json({ message: 'Submission not found.' });

    const nextTemplateId = Number.isFinite(tid) ? tid : existing.template_id;
    const nextSubjectType = subjectTypeRaw != null
      ? normalizeSubjectType(subjectTypeRaw)
      : normalizeSubjectType(existing.subject_type);
    const nextProjectId = projectId !== undefined
      ? (Number.isFinite(pid) ? pid : null)
      : existing.project_id;
    const nextRriId = rriProgrammeId !== undefined
      ? (Number.isFinite(rid) ? rid : null)
      : existing.rri_programme_id;
    if (nextSubjectType === 'project' && !Number.isFinite(nextProjectId)) {
      return res.status(400).json({ message: 'projectId is required when subject type is project.' });
    }
    if (nextSubjectType === 'rri_programme' && !Number.isFinite(nextRriId)) {
      return res.status(400).json({ message: 'rriProgrammeId is required when subject type is RRI programme.' });
    }
    const nextInspectionId = inspectionId !== undefined ? (Number.isFinite(iid) ? iid : null) : existing.inspection_id;
    const nextVisitDate = visitDate !== undefined ? (visitDate ? String(visitDate).slice(0, 10) : null) : existing.visit_date;
    const nextTitle = title !== undefined ? (title != null ? String(title).trim() || null : null) : existing.title;
    const nextAnswers = answers !== undefined ? (answers && typeof answers === 'object' ? answers : {}) : existing.answers || {};

    const tr = await pool.query(
      `
      SELECT structure FROM data_collection_templates
      WHERE template_id = $1 AND COALESCE(voided,false)=false AND COALESCE(is_active,true)=true
      `,
      [nextTemplateId]
    );
    const structure = tr.rows?.[0]?.structure;
    if (!structure) return res.status(404).json({ message: 'Template not found or inactive.' });

    const missing = validateAnswers(structure, nextAnswers);
    if (missing.length) {
      return res.status(400).json({ message: 'Required checklist items are missing.', missing });
    }

    const r = await pool.query(
      `
      UPDATE data_collection_submissions
      SET template_id = $1,
          subject_type = $2,
          project_id = $3,
          rri_programme_id = $4,
          inspection_id = $5,
          visit_date = $6,
          title = $7,
          answers = $8::jsonb,
          updated_at = CURRENT_TIMESTAMP
      WHERE submission_id = $9 AND COALESCE(voided, false) = false
      RETURNING submission_id, template_id, subject_type, project_id, rri_programme_id, inspection_id, visit_date, title, answers,
                created_by, created_at, updated_at
      `,
      [
        nextTemplateId,
        nextSubjectType,
        nextSubjectType === 'project' ? nextProjectId : null,
        nextSubjectType === 'rri_programme' ? nextRriId : null,
        nextInspectionId,
        nextVisitDate,
        nextTitle,
        JSON.stringify(nextAnswers),
        id,
      ]
    );
    const row = r.rows?.[0];
    if (!row) return res.status(404).json({ message: 'Submission not found.' });
    await linkAttachmentsToSubmission(row.submission_id, nextAnswers);
    const nameR = await pool.query(`SELECT name FROM data_collection_templates WHERE template_id = $1`, [nextTemplateId]);
    return res.json(
      rowToSubmission({
        ...row,
        template_name: nameR.rows?.[0]?.name,
      })
    );
  } catch (e) {
    console.error('data-collection submission update:', e);
    return res.status(500).json({ message: 'Failed to update submission.', details: e.message });
  }
});

module.exports = router;
