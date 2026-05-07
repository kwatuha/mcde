const express = require('express');
const pool = require('../config/db');
const {
  ensureDataCollectionTemplatesTable,
  ensureDataCollectionSubmissionsTable,
} = require('../services/dataCollectionSchema');

const router = express.Router();

const ALLOWED_TYPES = new Set(['yes_no', 'text', 'textarea', 'number', 'select', 'multi_select']);

function userIdFromReq(req) {
  return req.user?.id ?? req.user?.userId ?? null;
}

function normalizeStructure(raw) {
  const sections = Array.isArray(raw?.sections) ? raw.sections : [];
  return {
    sections: sections
      .map((s, si) => {
        const sid = String(s?.id || `sec-${si}`).replace(/\s+/g, '_');
        const items = (Array.isArray(s?.items) ? s.items : [])
          .map((it, ii) => {
            const id = String(it?.id || `item-${si}-${ii}`).replace(/\s+/g, '_');
            const label = String(it?.label || '').trim();
            const type = ALLOWED_TYPES.has(it?.type) ? it.type : 'text';
            const required = !!it?.required;
            const options =
              (type === 'select' || type === 'multi_select') && Array.isArray(it?.options)
                ? it.options.map((o) => String(o).trim()).filter(Boolean)
                : undefined;
            return { id, label, type, required, ...(options?.length ? { options } : {}) };
          })
          .filter((it) => it.label);
        return {
          id: sid,
          title: String(s?.title || '').trim() || `Section ${si + 1}`,
          items,
        };
      })
      .filter((s) => s.items.length),
  };
}

function validateAnswers(structure, answers) {
  if (!answers || typeof answers !== 'object') return ['Answers must be an object.'];
  const missing = [];
  for (const sec of structure.sections || []) {
    for (const it of sec.items || []) {
      if (!it.required) continue;
      const v = answers[it.id];
      const empty =
        v === undefined ||
        v === null ||
        (typeof v === 'string' && v.trim() === '') ||
        (it.type === 'multi_select' && (!Array.isArray(v) || v.length === 0)) ||
        (it.type === 'yes_no' && v !== 'yes' && v !== 'no');
      if (empty) missing.push(it.label || it.id);
    }
  }
  return missing;
}

function rowToTemplate(row) {
  if (!row) return null;
  return {
    templateId: row.template_id,
    name: row.name,
    description: row.description,
    templateCategory: row.template_category,
    structure: row.structure,
    isActive: row.is_active,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToSubmission(row) {
  if (!row) return null;
  return {
    submissionId: row.submission_id,
    templateId: row.template_id,
    templateName: row.template_name,
    projectId: row.project_id,
    inspectionId: row.inspection_id,
    visitDate: row.visit_date,
    title: row.title,
    answers: row.answers,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

router.get('/templates', async (req, res) => {
  const category = req.query.category ? String(req.query.category) : null;
  const activeOnly = String(req.query.active || 'true') !== 'false';
  try {
    await ensureDataCollectionTemplatesTable();
    const params = [];
    let where = 'WHERE COALESCE(voided, false) = false';
    if (activeOnly) where += ' AND COALESCE(is_active, true) = true';
    if (category) {
      params.push(category);
      where += ` AND template_category = $${params.length}`;
    }
    const r = await pool.query(
      `
      SELECT template_id, name, description, template_category, structure, is_active,
             created_by, created_at, updated_at
      FROM data_collection_templates
      ${where}
      ORDER BY name ASC, template_id ASC
      `,
      params
    );
    return res.json((r.rows || []).map(rowToTemplate));
  } catch (e) {
    console.error('data-collection templates list:', e);
    return res.status(500).json({ message: 'Failed to list templates.', details: e.message });
  }
});

router.get('/templates/:id', async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid template id.' });
  try {
    await ensureDataCollectionTemplatesTable();
    const r = await pool.query(
      `
      SELECT template_id, name, description, template_category, structure, is_active,
             created_by, created_at, updated_at
      FROM data_collection_templates
      WHERE template_id = $1 AND COALESCE(voided, false) = false
      `,
      [id]
    );
    const t = rowToTemplate(r.rows?.[0]);
    if (!t) return res.status(404).json({ message: 'Template not found.' });
    return res.json(t);
  } catch (e) {
    console.error('data-collection template get:', e);
    return res.status(500).json({ message: 'Failed to load template.', details: e.message });
  }
});

router.post('/templates', async (req, res) => {
  const { name, description, templateCategory, structure, isActive } = req.body || {};
  const title = String(name || '').trim();
  if (!title) return res.status(400).json({ message: 'name is required.' });
  const cat = String(templateCategory || 'general').trim() || 'general';
  const struct = normalizeStructure(structure);
  if (!struct.sections.length) {
    return res.status(400).json({ message: 'Template must include at least one section with items.' });
  }
  try {
    await ensureDataCollectionTemplatesTable();
    const createdBy = userIdFromReq(req);
    const r = await pool.query(
      `
      INSERT INTO data_collection_templates
        (name, description, template_category, structure, is_active, created_by, created_at, updated_at, voided)
      VALUES ($1, $2, $3, $4::jsonb, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, false)
      RETURNING template_id, name, description, template_category, structure, is_active,
                created_by, created_at, updated_at
      `,
      [
        title,
        description != null ? String(description) : null,
        cat,
        JSON.stringify(struct),
        isActive === false ? false : true,
        createdBy,
      ]
    );
    return res.status(201).json(rowToTemplate(r.rows[0]));
  } catch (e) {
    console.error('data-collection template create:', e);
    return res.status(500).json({ message: 'Failed to create template.', details: e.message });
  }
});

router.put('/templates/:id', async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid template id.' });
  const { name, description, templateCategory, structure, isActive } = req.body || {};
  try {
    await ensureDataCollectionTemplatesTable();
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

    const r = await pool.query(
      `
      UPDATE data_collection_templates
      SET name = $1, description = $2, template_category = $3, structure = $4::jsonb,
          is_active = $5, updated_at = CURRENT_TIMESTAMP
      WHERE template_id = $6 AND COALESCE(voided,false)=false
      RETURNING template_id, name, description, template_category, structure, is_active,
                created_by, created_at, updated_at
      `,
      [nextName, nextDesc, nextCat, JSON.stringify(nextStruct), nextActive, id]
    );
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
  try {
    await ensureDataCollectionSubmissionsTable();
    const params = [];
    let where = 'WHERE COALESCE(s.voided, false) = false';
    if (Number.isFinite(projectId)) {
      params.push(projectId);
      where += ` AND s.project_id = $${params.length}`;
    }
    const r = await pool.query(
      `
      SELECT s.submission_id, s.template_id, t.name AS template_name, s.project_id, s.inspection_id,
             s.visit_date, s.title, s.answers, s.created_by, s.created_at, s.updated_at
      FROM data_collection_submissions s
      JOIN data_collection_templates t ON t.template_id = s.template_id
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
      SELECT s.submission_id, s.template_id, t.name AS template_name, s.project_id, s.inspection_id,
             s.visit_date, s.title, s.answers, s.created_by, s.created_at, s.updated_at
      FROM data_collection_submissions s
      JOIN data_collection_templates t ON t.template_id = s.template_id
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

router.post('/submissions', async (req, res) => {
  const { templateId, projectId, inspectionId, visitDate, title, answers } = req.body || {};
  const tid = parseInt(String(templateId), 10);
  const pid = projectId != null ? parseInt(String(projectId), 10) : null;
  const iid = inspectionId != null ? parseInt(String(inspectionId), 10) : null;
  if (!Number.isFinite(tid)) return res.status(400).json({ message: 'templateId is required.' });
  if (!Number.isFinite(pid)) return res.status(400).json({ message: 'projectId is required for a monitoring submission.' });

  try {
    await ensureDataCollectionSubmissionsTable();
    const tr = await pool.query(
      `
      SELECT structure FROM data_collection_templates
      WHERE template_id = $1 AND COALESCE(voided,false)=false AND COALESCE(is_active,true)=true
      `,
      [tid]
    );
    const structure = tr.rows?.[0]?.structure;
    if (!structure) return res.status(404).json({ message: 'Template not found or inactive.' });

    const ans = answers && typeof answers === 'object' ? answers : {};
    const missing = validateAnswers(structure, ans);
    if (missing.length) {
      return res.status(400).json({ message: 'Required checklist items are missing.', missing });
    }

    const createdBy = userIdFromReq(req);
    const r = await pool.query(
      `
      INSERT INTO data_collection_submissions
        (template_id, project_id, inspection_id, visit_date, title, answers, created_by, created_at, updated_at, voided)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, false)
      RETURNING submission_id, template_id, project_id, inspection_id, visit_date, title, answers,
                created_by, created_at, updated_at
      `,
      [
        tid,
        pid,
        Number.isFinite(iid) ? iid : null,
        visitDate ? String(visitDate).slice(0, 10) : null,
        title != null ? String(title).trim() || null : null,
        JSON.stringify(ans),
        createdBy,
      ]
    );
    const row = r.rows[0];
    const nameR = await pool.query(`SELECT name FROM data_collection_templates WHERE template_id = $1`, [tid]);
    return res.status(201).json(
      rowToSubmission({
        ...row,
        template_name: nameR.rows?.[0]?.name,
      })
    );
  } catch (e) {
    console.error('data-collection submission create:', e);
    return res.status(500).json({ message: 'Failed to save submission.', details: e.message });
  }
});

router.put('/submissions/:id', async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid submission id.' });
  const { templateId, projectId, inspectionId, visitDate, title, answers } = req.body || {};
  const tid = templateId != null ? parseInt(String(templateId), 10) : null;
  const pid = projectId != null ? parseInt(String(projectId), 10) : null;
  const iid = inspectionId != null ? parseInt(String(inspectionId), 10) : null;
  try {
    await ensureDataCollectionSubmissionsTable();
    const cur = await pool.query(
      `
      SELECT submission_id, template_id, project_id, inspection_id, visit_date, title, answers
      FROM data_collection_submissions
      WHERE submission_id = $1 AND COALESCE(voided, false) = false
      `,
      [id]
    );
    const existing = cur.rows?.[0];
    if (!existing) return res.status(404).json({ message: 'Submission not found.' });

    const nextTemplateId = Number.isFinite(tid) ? tid : existing.template_id;
    const nextProjectId = Number.isFinite(pid) ? pid : existing.project_id;
    if (!Number.isFinite(nextProjectId)) {
      return res.status(400).json({ message: 'projectId is required for a monitoring submission.' });
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
          project_id = $2,
          inspection_id = $3,
          visit_date = $4,
          title = $5,
          answers = $6::jsonb,
          updated_at = CURRENT_TIMESTAMP
      WHERE submission_id = $7 AND COALESCE(voided, false) = false
      RETURNING submission_id, template_id, project_id, inspection_id, visit_date, title, answers,
                created_by, created_at, updated_at
      `,
      [nextTemplateId, nextProjectId, nextInspectionId, nextVisitDate, nextTitle, JSON.stringify(nextAnswers), id]
    );
    const row = r.rows?.[0];
    if (!row) return res.status(404).json({ message: 'Submission not found.' });
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
