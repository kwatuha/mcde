const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const pool = require('../config/db');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'mobile-app');

let tablesReady = false;

async function ensureTables() {
  if (tablesReady) return;
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mobile_app_releases (
      id BIGSERIAL PRIMARY KEY,
      version TEXT NOT NULL,
      release_notes TEXT NULL,
      original_file_name TEXT NOT NULL,
      stored_file_name TEXT NOT NULL,
      mime_type TEXT NULL,
      file_size BIGINT NULL,
      uploaded_by_user_id BIGINT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      voided BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_mobile_app_releases_active ON mobile_app_releases(voided, created_at DESC)`
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mobile_app_release_acknowledgements (
      user_id BIGINT NOT NULL,
      release_id BIGINT NOT NULL REFERENCES mobile_app_releases(id) ON DELETE CASCADE,
      acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, release_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mobile_app_usage_events (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      release_id BIGINT NULL REFERENCES mobile_app_releases(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL,
      app_version TEXT NULL,
      release_version TEXT NULL,
      user_agent TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_mobile_app_usage_user ON mobile_app_usage_events(user_id, created_at DESC)`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_mobile_app_usage_type ON mobile_app_usage_events(event_type, created_at DESC)`
  );
  tablesReady = true;
}

function rowToRelease(row) {
  if (!row) return null;
  return {
    id: row.id,
    version: row.version,
    releaseNotes: row.release_notes ?? row.releaseNotes ?? null,
    originalFileName: row.original_file_name ?? row.originalFileName,
    mimeType: row.mime_type ?? row.mimeType ?? null,
    fileSize: row.file_size ?? row.fileSize ?? null,
    uploadedByUserId: row.uploaded_by_user_id ?? row.uploadedByUserId ?? null,
    createdAt: row.created_at ?? row.createdAt,
  };
}

async function getCurrentReleaseRow() {
  await ensureTables();
  const r = await pool.query(
    `SELECT id, version, release_notes, original_file_name, stored_file_name,
            mime_type, file_size, uploaded_by_user_id, created_at
     FROM mobile_app_releases
     WHERE voided = FALSE
     ORDER BY created_at DESC, id DESC
     LIMIT 1`
  );
  return r.rows?.[0] || null;
}

async function getCurrentRelease() {
  const row = await getCurrentReleaseRow();
  return rowToRelease(row);
}

async function userHasAcknowledgedRelease(userId, releaseId) {
  if (!userId || !releaseId) return false;
  await ensureTables();
  const r = await pool.query(
    `SELECT 1 FROM mobile_app_release_acknowledgements
     WHERE user_id = ? AND release_id = ? LIMIT 1`,
    [userId, releaseId]
  );
  return (r.rows || []).length > 0;
}

async function acknowledgeRelease(userId, releaseId) {
  const uid = parseInt(String(userId), 10);
  const rid = parseInt(String(releaseId), 10);
  if (!Number.isFinite(uid) || !Number.isFinite(rid)) {
    throw new Error('Invalid user or release id.');
  }
  await ensureTables();
  await pool.query(
    `INSERT INTO mobile_app_release_acknowledgements (user_id, release_id, acknowledged_at)
     VALUES (?, ?, NOW())
     ON CONFLICT (user_id, release_id) DO UPDATE SET acknowledged_at = NOW()`,
    [uid, rid]
  );
  return { ok: true };
}

async function voidPreviousReleases() {
  await ensureTables();
  const prev = await pool.query(
    `SELECT id, stored_file_name FROM mobile_app_releases WHERE voided = FALSE ORDER BY created_at DESC`
  );
  for (const old of prev.rows || []) {
    await pool.query(`UPDATE mobile_app_releases SET voided = TRUE WHERE id = ?`, [old.id]);
    const oldPath = path.join(UPLOAD_DIR, old.stored_file_name || '');
    if (fs.existsSync(oldPath)) fs.unlink(oldPath, () => {});
  }
}

async function registerReleaseRecord({
  version,
  releaseNotes = null,
  originalFileName,
  storedFileName,
  mimeType = 'application/vnd.android.package-archive',
  fileSize,
  uploadedByUserId = null,
}) {
  await ensureTables();
  const versionLabel = String(version || '').trim().slice(0, 64);
  if (!versionLabel) throw new Error('Version label is required (e.g. 1.0.0).');
  if (!storedFileName) throw new Error('storedFileName is required.');

  const notes =
    releaseNotes != null && String(releaseNotes).trim()
      ? String(releaseNotes).trim().slice(0, 4000)
      : null;

  const ins = await pool.query(
    `INSERT INTO mobile_app_releases
       (version, release_notes, original_file_name, stored_file_name, mime_type, file_size, uploaded_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     RETURNING id, version, release_notes, original_file_name, stored_file_name,
               mime_type, file_size, uploaded_by_user_id, created_at`,
    [
      versionLabel,
      notes,
      originalFileName || `machakos-collector-${versionLabel}.apk`,
      storedFileName,
      mimeType,
      fileSize,
      uploadedByUserId,
    ]
  );

  return rowToRelease(ins.rows?.[0]);
}

/**
 * Publish a release from an APK on disk (deploy script / external path).
 */
async function publishReleaseFromFile({
  sourceApkPath,
  version,
  releaseNotes = null,
  originalFileName = null,
  uploadedByUserId = null,
}) {
  const src = path.resolve(sourceApkPath);
  if (!fs.existsSync(src)) throw new Error(`APK not found: ${src}`);

  const stat = fs.statSync(src);
  const ext = path.extname(src).toLowerCase() || '.apk';
  const storedFileName = `machakos-collector-${crypto.randomBytes(12).toString('hex')}${ext}`;
  const destPath = path.join(UPLOAD_DIR, storedFileName);

  await voidPreviousReleases();
  fs.copyFileSync(src, destPath);

  return registerReleaseRecord({
    version,
    releaseNotes,
    originalFileName: originalFileName || path.basename(src) || `machakos-collector-${version}.apk`,
    storedFileName,
    fileSize: stat.size,
    uploadedByUserId,
  });
}

function getApkAbsolutePath(storedFileName) {
  return path.join(UPLOAD_DIR, storedFileName || '');
}

const ALLOWED_EVENT_TYPES = new Set([
  'apk_download',
  'release_viewed',
  'app_login',
  'app_sync',
]);

async function logUsageEvent({
  userId,
  eventType,
  releaseId = null,
  releaseVersion = null,
  appVersion = null,
  userAgent = null,
}) {
  const uid = parseInt(String(userId), 10);
  if (!Number.isFinite(uid)) return;
  const type = String(eventType || '').trim();
  if (!ALLOWED_EVENT_TYPES.has(type)) return;
  await ensureTables();
  const rid = releaseId != null ? parseInt(String(releaseId), 10) : null;
  await pool.query(
    `INSERT INTO mobile_app_usage_events
       (user_id, release_id, event_type, app_version, release_version, user_agent)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      uid,
      Number.isFinite(rid) ? rid : null,
      type,
      appVersion != null ? String(appVersion).trim().slice(0, 64) || null : null,
      releaseVersion != null ? String(releaseVersion).trim().slice(0, 64) || null : null,
      userAgent != null ? String(userAgent).trim().slice(0, 512) || null : null,
    ]
  );
}

async function getUsageReport() {
  await ensureTables();
  const current = await getCurrentReleaseRow();
  const currentVersion = current?.version || null;

  const summaryR = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE event_type = 'apk_download') AS total_downloads,
      COUNT(DISTINCT user_id) FILTER (WHERE event_type = 'apk_download') AS unique_downloaders,
      COUNT(DISTINCT user_id) FILTER (WHERE event_type IN ('app_login', 'app_sync')) AS unique_app_users
    FROM mobile_app_usage_events
  `);
  const summaryRow = summaryR.rows?.[0] || {};

  const versionR = await pool.query(`
    SELECT
      COALESCE(release_version, app_version, 'unknown') AS version_label,
      COUNT(*) FILTER (WHERE event_type = 'apk_download') AS download_count,
      COUNT(DISTINCT user_id) FILTER (WHERE event_type = 'apk_download') AS downloader_count,
      COUNT(*) FILTER (WHERE event_type IN ('app_login', 'app_sync')) AS app_activity_count,
      COUNT(DISTINCT user_id) FILTER (WHERE event_type IN ('app_login', 'app_sync')) AS app_user_count
    FROM mobile_app_usage_events
    GROUP BY COALESCE(release_version, app_version, 'unknown')
    ORDER BY download_count DESC, app_activity_count DESC, version_label ASC
  `);

  const usersR = await pool.query(`
    WITH per_user AS (
      SELECT
        e.user_id,
        MAX(e.created_at) FILTER (WHERE e.event_type = 'apk_download') AS last_download_at,
        COUNT(*) FILTER (WHERE e.event_type = 'apk_download') AS download_count,
        MAX(e.created_at) FILTER (WHERE e.event_type IN ('app_login', 'app_sync')) AS last_app_activity_at,
        COUNT(*) FILTER (WHERE e.event_type IN ('app_login', 'app_sync')) AS app_activity_count,
        MAX(e.created_at) FILTER (WHERE e.event_type = 'release_viewed') AS last_release_view_at
      FROM mobile_app_usage_events e
      GROUP BY e.user_id
    ),
    last_download AS (
      SELECT DISTINCT ON (user_id)
        user_id,
        release_version AS last_download_version
      FROM mobile_app_usage_events
      WHERE event_type = 'apk_download' AND release_version IS NOT NULL
      ORDER BY user_id, created_at DESC
    ),
    last_app AS (
      SELECT DISTINCT ON (user_id)
        user_id,
        app_version AS last_app_version
      FROM mobile_app_usage_events
      WHERE event_type IN ('app_login', 'app_sync') AND app_version IS NOT NULL
      ORDER BY user_id, created_at DESC
    )
    SELECT
      p.user_id AS "userId",
      u.username,
      u.email,
      TRIM(CONCAT(COALESCE(u.firstname, ''), ' ', COALESCE(u.lastname, ''))) AS "fullName",
      r.name AS "roleName",
      p.last_download_at AS "lastDownloadAt",
      ld.last_download_version AS "lastDownloadVersion",
      p.download_count AS "downloadCount",
      p.last_app_activity_at AS "lastAppActivityAt",
      la.last_app_version AS "lastAppVersion",
      p.app_activity_count AS "appActivityCount",
      p.last_release_view_at AS "lastReleaseViewAt"
    FROM per_user p
    JOIN users u ON u.userid = p.user_id AND COALESCE(u.voided, false) = false
    LEFT JOIN roles r ON r.roleid = u.roleid
    LEFT JOIN last_download ld ON ld.user_id = p.user_id
    LEFT JOIN last_app la ON la.user_id = p.user_id
    ORDER BY COALESCE(p.last_app_activity_at, p.last_download_at) DESC NULLS LAST, u.username ASC
    LIMIT 1000
  `);

  const users = (usersR.rows || []).map((row) => ({
    ...row,
    onLatestAppVersion:
      currentVersion && row.lastAppVersion
        ? String(row.lastAppVersion) === String(currentVersion)
        : null,
    onLatestDownloadVersion:
      currentVersion && row.lastDownloadVersion
        ? String(row.lastDownloadVersion) === String(currentVersion)
        : null,
  }));

  let onLatestAppVersion = 0;
  let onOlderAppVersion = 0;
  for (const u of users) {
    if (!u.lastAppVersion) continue;
    if (u.onLatestAppVersion) onLatestAppVersion += 1;
    else onOlderAppVersion += 1;
  }

  const eventsR = await pool.query(`
    SELECT
      e.id,
      e.user_id AS "userId",
      u.username,
      e.event_type AS "eventType",
      e.app_version AS "appVersion",
      e.release_version AS "releaseVersion",
      e.created_at AS "createdAt"
    FROM mobile_app_usage_events e
    LEFT JOIN users u ON u.userid = e.user_id
    ORDER BY e.created_at DESC
    LIMIT 300
  `);

  return {
    currentRelease: current ? rowToRelease(current) : null,
    summary: {
      totalDownloads: Number(summaryRow.total_downloads || 0),
      uniqueDownloaders: Number(summaryRow.unique_downloaders || 0),
      uniqueAppUsers: Number(summaryRow.unique_app_users || 0),
      onLatestAppVersion,
      onOlderAppVersion,
    },
    versionBreakdown: versionR.rows || [],
    users,
    recentEvents: eventsR.rows || [],
  };
}

module.exports = {
  UPLOAD_DIR,
  ensureTables,
  rowToRelease,
  getCurrentReleaseRow,
  getCurrentRelease,
  userHasAcknowledgedRelease,
  acknowledgeRelease,
  publishReleaseFromFile,
  registerReleaseRecord,
  voidPreviousReleases,
  getApkAbsolutePath,
  logUsageEvent,
  getUsageReport,
};
