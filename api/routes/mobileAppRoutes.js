const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { isAdminLikeRequester } = require('../utils/roleUtils');
const {
  UPLOAD_DIR,
  getCurrentReleaseRow,
  rowToRelease,
  userHasAcknowledgedRelease,
  acknowledgeRelease,
  registerReleaseRecord,
  voidPreviousReleases,
  getApkAbsolutePath,
  logUsageEvent,
  getUsageReport,
} = require('../services/mobileAppReleaseService');

const router = express.Router();

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const MAX_APK_BYTES = 120 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.apk';
    cb(null, `machakos-collector-${crypto.randomBytes(12).toString('hex')}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_APK_BYTES },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const mime = String(file.mimetype || '').toLowerCase();
    const ok =
      ext === '.apk' ||
      mime === 'application/vnd.android.package-archive' ||
      mime === 'application/octet-stream';
    if (!ok) {
      return cb(new Error('Only Android APK files are allowed.'));
    }
    cb(null, true);
  },
});

function userIdFromReq(req) {
  const u = req.user;
  if (!u) return null;
  return u.userId ?? u.id ?? u.actualUserId ?? null;
}

function requireAdmin(req, res, next) {
  if (!isAdminLikeRequester(req.user)) {
    return res.status(403).json({ message: 'Administrator access is required to manage the mobile app release.' });
  }
  return next();
}

function requireAdminUsage(req, res, next) {
  if (!isAdminLikeRequester(req.user)) {
    return res.status(403).json({ message: 'Administrator access is required to view mobile app usage.' });
  }
  return next();
}

/** Current release metadata for logged-in users */
router.get('/release', async (req, res) => {
  try {
    const row = await getCurrentReleaseRow();
    if (!row) {
      return res.json({ available: false, release: null, isNewForUser: false });
    }
    const userId = userIdFromReq(req);
    const release = rowToRelease(row);
    let isNewForUser = false;
    if (userId) {
      const seen = await userHasAcknowledgedRelease(userId, release.id);
      isNewForUser = !seen;
    }
    return res.json({ available: true, release, isNewForUser });
  } catch (err) {
    console.error('mobile-app release get:', err);
    return res.status(500).json({ message: 'Failed to load mobile app release.', details: err.message });
  }
});

/** Mark current release as seen (stops dashboard notification) */
router.post('/release/dismiss', async (req, res) => {
  try {
    const userId = userIdFromReq(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required.' });
    }
    const row = await getCurrentReleaseRow();
    if (!row) {
      return res.json({ ok: true, dismissed: false });
    }
    await acknowledgeRelease(userId, row.id);
    await logUsageEvent({
      userId,
      eventType: 'release_viewed',
      releaseId: row.id,
      releaseVersion: row.version,
      userAgent: req.headers['user-agent'],
    });
    return res.json({ ok: true, dismissed: true, releaseId: row.id });
  } catch (err) {
    console.error('mobile-app release dismiss:', err);
    return res.status(500).json({ message: 'Failed to dismiss notification.', details: err.message });
  }
});

/** Download current APK (authenticated) */
router.get('/download', async (req, res) => {
  try {
    const row = await getCurrentReleaseRow();
    if (!row) {
      return res.status(404).json({ message: 'No mobile app release is available yet.' });
    }
    const userId = userIdFromReq(req);
    if (userId) {
      await logUsageEvent({
        userId,
        eventType: 'apk_download',
        releaseId: row.id,
        releaseVersion: row.version,
        userAgent: req.headers['user-agent'],
      });
    }
    const fp = getApkAbsolutePath(row.stored_file_name);
    if (!fs.existsSync(fp)) {
      return res.status(404).json({ message: 'APK file is missing on the server. Contact an administrator.' });
    }
    const downloadName = row.original_file_name || 'machakos-collector.apk';
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.download(fp, downloadName);
  } catch (err) {
    console.error('mobile-app download:', err);
    return res.status(500).json({ message: 'Failed to download mobile app.', details: err.message });
  }
});

/** Upload or replace current release (admin only) */
router.post('/upload', requireAdmin, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ message: err.message || 'Upload failed.' });
    }
    next();
  });
}, async (req, res) => {
  let uploadedPath;
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No APK file uploaded.' });
    }

    const version = String(req.body.version || '').trim();
    if (!version) {
      if (req.file.path && fs.existsSync(req.file.path)) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ message: 'Version label is required (e.g. 1.0.0).' });
    }

    uploadedPath = req.file.path;
    await voidPreviousReleases();

    const release = await registerReleaseRecord({
      version,
      releaseNotes: String(req.body.releaseNotes || req.body.release_notes || '').trim() || null,
      originalFileName: req.file.originalname,
      storedFileName: req.file.filename,
      mimeType: req.file.mimetype || 'application/vnd.android.package-archive',
      fileSize: req.file.size,
      uploadedByUserId: userIdFromReq(req),
    });

    return res.status(201).json({ ok: true, release });
  } catch (err) {
    if (uploadedPath && fs.existsSync(uploadedPath)) fs.unlink(uploadedPath, () => {});
    console.error('mobile-app upload:', err);
    return res.status(500).json({ message: err.message || 'Failed to upload mobile app release.', details: err.message });
  }
});

/** Mobile app reports login/sync with installed version (field usage telemetry) */
router.post('/usage/report', async (req, res) => {
  try {
    const userId = userIdFromReq(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required.' });
    }
    const { appVersion, eventType } = req.body || {};
    const type = eventType === 'app_sync' ? 'app_sync' : 'app_login';
    const row = await getCurrentReleaseRow();
    await logUsageEvent({
      userId,
      eventType: type,
      releaseId: row?.id || null,
      releaseVersion: row?.version || null,
      appVersion: appVersion || null,
      userAgent: req.headers['user-agent'],
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error('mobile-app usage report:', err);
    return res.status(500).json({ message: 'Failed to record app usage.', details: err.message });
  }
});

/** Admin: adoption and download report */
router.get('/usage', requireAdminUsage, async (_req, res) => {
  try {
    const report = await getUsageReport();
    return res.json(report);
  } catch (err) {
    console.error('mobile-app usage get:', err);
    return res.status(500).json({
      message: 'Failed to load mobile app usage.',
      details: err.message,
      hint: 'Ensure api/migrations/20260627_mobile_app_releases.sql has been applied and restart the API.',
    });
  }
});

module.exports = router;
