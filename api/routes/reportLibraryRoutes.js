const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const router = express.Router();
const pool = require('../config/db');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'report-library');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const ALLOWED_EXT = new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx']);
const MAX_TITLE_LEN = 512;
const MAX_DESC_LEN = 8000;
const DB_TYPE = process.env.DB_TYPE || 'postgresql';
const isPostgres = DB_TYPE === 'postgresql';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    cb(null, `${crypto.randomBytes(16).toString('hex')}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      return cb(new Error('Invalid file type. Allowed: PDF, Word, Excel files.'));
    }
    cb(null, true);
  },
});

let tableReady = false;
let activeTableName = null;

function userIdFromReq(req) {
  const u = req.user;
  if (!u) return null;
  return u.userId ?? u.id ?? u.actualUserId ?? null;
}

async function ensureReportLibraryTable() {
  if (tableReady) return;
  if (isPostgres) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS report_library_uploads (
        id BIGSERIAL PRIMARY KEY,
        report_title TEXT NOT NULL,
        report_description TEXT NULL,
        original_file_name TEXT NOT NULL,
        stored_file_name TEXT NOT NULL,
        mime_type TEXT NULL,
        file_size BIGINT NULL,
        uploaded_by_user_id BIGINT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        voided BOOLEAN NOT NULL DEFAULT FALSE
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_report_library_uploads_created ON report_library_uploads(created_at DESC)`);
  } else {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS report_library_uploads (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        report_title VARCHAR(512) NOT NULL,
        report_description TEXT NULL,
        original_file_name VARCHAR(1024) NOT NULL,
        stored_file_name VARCHAR(255) NOT NULL,
        mime_type VARCHAR(128) NULL,
        file_size BIGINT NULL,
        uploaded_by_user_id BIGINT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        voided TINYINT(1) NOT NULL DEFAULT 0,
        INDEX idx_report_library_uploads_created (created_at)
      )
    `);
  }
  tableReady = true;
}

async function detectActiveTable() {
  if (activeTableName) return activeTableName;
  if (isPostgres) {
    const chk = await pool.query(
      `SELECT
         to_regclass('public.report_library_uploads') AS a,
         to_regclass('public.kemri_report_library_uploads') AS b`
    );
    const row = chk.rows?.[0] || {};
    if (row.a) activeTableName = 'report_library_uploads';
    else if (row.b) activeTableName = 'kemri_report_library_uploads';
  } else {
    const chk = await pool.query(
      `SELECT table_name AS tableName
       FROM information_schema.tables
       WHERE table_schema = DATABASE()
         AND table_name IN ('report_library_uploads','kemri_report_library_uploads')
       ORDER BY CASE table_name WHEN 'report_library_uploads' THEN 0 ELSE 1 END
       LIMIT 1`
    );
    const rows = chk.rows || [];
    activeTableName = rows[0]?.tableName || null;
  }
  return activeTableName;
}

async function getActiveTable() {
  let table = await detectActiveTable();
  if (table) return table;
  try {
    await ensureReportLibraryTable();
  } catch {
    // Continue; table creation may fail due to permission restrictions.
  }
  table = await detectActiveTable();
  return table || 'report_library_uploads';
}

router.get('/', async (_req, res) => {
  try {
    const table = await getActiveTable();
    const r = await pool.query(
      isPostgres
        ? `SELECT id,
                  report_title AS "reportTitle",
                  report_description AS "reportDescription",
                  original_file_name AS "originalFileName",
                  mime_type AS "mimeType",
                  file_size AS "fileSize",
                  uploaded_by_user_id AS "uploadedByUserId",
                  created_at AS "createdAt"
           FROM ${table}
           WHERE voided = FALSE
           ORDER BY created_at DESC
           LIMIT 500`
        : `SELECT id,
                  report_title AS reportTitle,
                  report_description AS reportDescription,
                  original_file_name AS originalFileName,
                  mime_type AS mimeType,
                  file_size AS fileSize,
                  uploaded_by_user_id AS uploadedByUserId,
                  created_at AS createdAt
           FROM ${table}
           WHERE voided = 0
           ORDER BY created_at DESC
           LIMIT 500`
    );
    res.json(r.rows || []);
  } catch (err) {
    res.status(500).json({ message: 'Failed to list reports.', error: err.message });
  }
});

router.post('/upload', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || 'Upload failed.' });
    next();
  });
}, async (req, res) => {
  let uploadedPath;
  try {
    const table = await getActiveTable();
    if (!req.file) return res.status(400).json({ message: 'No file uploaded.' });
    const title = String(req.body.title || req.body.reportTitle || '').trim().slice(0, MAX_TITLE_LEN);
    const description = String(req.body.description || '').trim().slice(0, MAX_DESC_LEN);
    if (!title) {
      if (req.file.path && fs.existsSync(req.file.path)) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ message: 'Report name is required.' });
    }
    uploadedPath = req.file.path;
    const uid = userIdFromReq(req);
    const ins = await pool.query(
      isPostgres
        ? `INSERT INTO ${table}
           (report_title, report_description, original_file_name, stored_file_name, mime_type, file_size, uploaded_by_user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           RETURNING id`
        : `INSERT INTO ${table}
           (report_title, report_description, original_file_name, stored_file_name, mime_type, file_size, uploaded_by_user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [title, description || null, req.file.originalname, req.file.filename, req.file.mimetype || null, req.file.size, uid]
    );
    const id = ins.rows?.[0]?.id ?? ins.insertId ?? null;
    res.status(201).json({
      id,
      reportTitle: title,
      reportDescription: description || null,
      originalFileName: req.file.originalname,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    if (uploadedPath && fs.existsSync(uploadedPath)) fs.unlink(uploadedPath, () => {});
    res.status(500).json({ message: 'Failed to save report.', error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const table = await getActiveTable();
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid report id.' });
    const title = String(req.body.title || '').trim().slice(0, MAX_TITLE_LEN);
    if (!title) return res.status(400).json({ message: 'Report name is required.' });
    const desc = req.body.description == null ? null : String(req.body.description).trim().slice(0, MAX_DESC_LEN) || null;
    const upd = await pool.query(
      isPostgres
        ? `UPDATE ${table}
           SET report_title = ?, report_description = ?, updated_at = NOW()
           WHERE id = ? AND voided = FALSE
           RETURNING id`
        : `UPDATE ${table}
           SET report_title = ?, report_description = ?, updated_at = NOW()
           WHERE id = ? AND voided = 0`,
      [title, desc, id]
    );
    if (isPostgres && !upd.rows?.length) return res.status(404).json({ message: 'Report not found.' });
    res.json({ id, reportTitle: title, reportDescription: desc });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update report.', error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const table = await getActiveTable();
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid report id.' });
    const found = await pool.query(`SELECT stored_file_name AS "storedFileName" FROM ${table} WHERE id = ?`, [id]);
    const row = found.rows?.[0];
    if (!row) return res.status(404).json({ message: 'Report not found.' });
    await pool.query(
      isPostgres
        ? `UPDATE ${table} SET voided = TRUE, updated_at = NOW() WHERE id = ?`
        : `UPDATE ${table} SET voided = 1, updated_at = NOW() WHERE id = ?`,
      [id]
    );
    const fp = path.join(UPLOAD_DIR, row.storedFileName || row.stored_file_name || '');
    if (fs.existsSync(fp)) fs.unlink(fp, () => {});
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete report.', error: err.message });
  }
});

router.post('/:id/file', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || 'Upload failed.' });
    next();
  });
}, async (req, res) => {
  let newPath;
  try {
    const table = await getActiveTable();
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid report id.' });
    if (!req.file) return res.status(400).json({ message: 'No file uploaded.' });
    newPath = req.file.path;
    const found = await pool.query(`SELECT stored_file_name AS "storedFileName" FROM ${table} WHERE id = ?`, [id]);
    const row = found.rows?.[0];
    if (!row) {
      if (fs.existsSync(newPath)) fs.unlink(newPath, () => {});
      return res.status(404).json({ message: 'Report not found.' });
    }
    await pool.query(
      `UPDATE ${table}
       SET original_file_name = ?, stored_file_name = ?, mime_type = ?, file_size = ?, updated_at = NOW()
       WHERE id = ?`,
      [req.file.originalname, req.file.filename, req.file.mimetype || null, req.file.size, id]
    );
    const oldPath = path.join(UPLOAD_DIR, row.storedFileName || row.stored_file_name || '');
    if (fs.existsSync(oldPath)) fs.unlink(oldPath, () => {});
    res.json({ id, originalFileName: req.file.originalname, mimeType: req.file.mimetype, fileSize: req.file.size });
  } catch (err) {
    if (newPath && fs.existsSync(newPath)) fs.unlink(newPath, () => {});
    res.status(500).json({ message: 'Failed to replace file.', error: err.message });
  }
});

router.get('/:id/download', async (req, res) => {
  try {
    const table = await getActiveTable();
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid report id.' });
    const found = await pool.query(
      `SELECT original_file_name AS "originalFileName", stored_file_name AS "storedFileName"
       FROM ${table} WHERE id = ?`,
      [id]
    );
    const row = found.rows?.[0];
    if (!row) return res.status(404).json({ message: 'Report not found.' });
    const fp = path.join(UPLOAD_DIR, row.storedFileName || '');
    if (!fs.existsSync(fp)) return res.status(404).json({ message: 'File missing on server.' });
    res.download(fp, row.originalFileName || 'report');
  } catch (err) {
    res.status(500).json({ message: 'Failed to download report.', error: err.message });
  }
});

module.exports = router;
