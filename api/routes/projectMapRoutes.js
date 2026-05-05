const express = require('express');
const router = express.Router();
const pool = require('../config/db');

const DB_TYPE = process.env.DB_TYPE || 'mysql';
const isPostgres = DB_TYPE === 'postgresql';

const rowsFromResult = (result) =>
  isPostgres ? result?.rows || [] : Array.isArray(result) ? result[0] || [] : [];

let tableEnsured = false;
async function ensureProjectMapsTable() {
  if (tableEnsured) return;
  if (isPostgres) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_maps (
        mapid BIGSERIAL PRIMARY KEY,
        projectid BIGINT NOT NULL,
        map TEXT NOT NULL,
        voided BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_project_maps_projectid ON project_maps(projectid)`);
  } else {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_maps (
        mapId BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        projectId BIGINT NOT NULL,
        map LONGTEXT NOT NULL,
        voided TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
  }
  tableEnsured = true;
}

router.use(async (_req, res, next) => {
  try {
    await ensureProjectMapsTable();
    next();
  } catch (e) {
    res.status(500).json({ message: 'Project maps storage init failed', error: e.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const { countyId, subcountyId, wardId } = req.query;
    let rows = [];
    if (isPostgres) {
      const filters = [];
      const params = [];
      let idx = 1;
      if (countyId) {
        filters.push(
          `pm.projectid IN (
             SELECT DISTINCT ps.project_id
             FROM project_sites ps
             WHERE COALESCE(ps.voided, false) = false AND ps.county_id = $${idx++}
           )`
        );
        params.push(Number(countyId));
      }
      if (subcountyId) {
        filters.push(
          `pm.projectid IN (
             SELECT DISTINCT ps.project_id
             FROM project_sites ps
             WHERE COALESCE(ps.voided, false) = false AND ps.constituency_id = $${idx++}
           )`
        );
        params.push(Number(subcountyId));
      }
      if (wardId) {
        filters.push(
          `pm.projectid IN (
             SELECT DISTINCT ps.project_id
             FROM project_sites ps
             WHERE COALESCE(ps.voided, false) = false AND ps.ward_id = $${idx++}
           )`
        );
        params.push(Number(wardId));
      }
      const where = filters.length ? `AND ${filters.join(' AND ')}` : '';
      const result = await pool.query(
        `SELECT pm.mapid AS "mapId", pm.projectid AS "projectId", pm.map, pm.voided,
                p.name AS "projectName", p.description AS "projectDescription",
                (p.budget->>'allocated_amount_kes')::numeric AS "costOfProject",
                p.progress->>'status' AS "status"
         FROM project_maps pm
         INNER JOIN projects p ON p.project_id = pm.projectid AND p.voided = false
         WHERE pm.voided = false ${where}
         ORDER BY pm.mapid DESC`,
        params
      );
      rows = result.rows || [];
    } else {
      let query = `
        SELECT pm.*, p.projectName, p.projectDescription, p.costOfProject, p.status
        FROM project_maps pm
        JOIN projects p ON pm.projectId = p.id
        WHERE (pm.voided IS NULL OR pm.voided = 0)
      `;
      const queryParams = [];
      if (countyId) {
        query += ` AND pm.projectId IN (SELECT projectId FROM project_counties WHERE countyId = ?)`;
        queryParams.push(countyId);
      }
      if (subcountyId) {
        query += ` AND pm.projectId IN (SELECT projectId FROM project_subcounties WHERE subcountyId = ?)`;
        queryParams.push(subcountyId);
      }
      if (wardId) {
        query += ` AND pm.projectId IN (SELECT projectId FROM project_wards WHERE wardId = ?)`;
        queryParams.push(wardId);
      }
      const result = await pool.query(query, queryParams);
      rows = rowsFromResult(result);
    }

    if (!rows.length) return res.status(200).json({ data: [], boundingBox: null });

    const allCoordinates = [];
    const filteredData = rows
      .map((item) => {
        let geoJson;
        try {
          geoJson = typeof item.map === 'string' ? JSON.parse(item.map) : item.map;
          if (geoJson?.features?.length) {
            geoJson.features.forEach((feature) => {
              const c = feature?.geometry?.coordinates;
              const t = feature?.geometry?.type;
              if (!c || !t) return;
              if (t === 'Point') allCoordinates.push(c);
              else if (t === 'MultiPoint' || t === 'LineString') allCoordinates.push(...c);
              else if (t === 'Polygon' || t === 'MultiPolygon') {
                const coords = c[0];
                if (coords) allCoordinates.push(...coords);
              }
            });
          }
        } catch {
          return null;
        }
        return { ...item, parsedMap: geoJson };
      })
      .filter(Boolean);

    const boundingBox = allCoordinates.reduce(
      (acc, [lng, lat]) => ({
        minLat: Math.min(acc.minLat, lat),
        minLng: Math.min(acc.minLng, lng),
        maxLat: Math.max(acc.maxLat, lat),
        maxLng: Math.max(acc.maxLng, lng),
      }),
      { minLat: Infinity, minLng: Infinity, maxLat: -Infinity, maxLng: -Infinity }
    );
    const finalBoundingBox = boundingBox.minLat === Infinity ? null : boundingBox;
    res.status(200).json({ data: filteredData, boundingBox: finalBoundingBox });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching project maps', error: error.message });
  }
});

router.get('/project/:projectId', async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ message: 'Invalid projectId' });
  try {
    let rows = [];
    if (isPostgres) {
      const r = await pool.query(
        `SELECT mapid AS "mapId", projectid AS "projectId", map, voided, created_at AS "createdAt", updated_at AS "updatedAt"
         FROM project_maps
         WHERE projectid = $1 AND voided = false
         ORDER BY mapid DESC LIMIT 1`,
        [projectId]
      );
      rows = r.rows || [];
    } else {
      const [r] = await pool.query(
        `SELECT * FROM project_maps WHERE projectId = ? AND (voided IS NULL OR voided = 0) ORDER BY mapId DESC LIMIT 1`,
        [projectId]
      );
      rows = r || [];
    }
    if (!rows.length) return res.status(404).json({ message: 'Project map not found for this project' });
    res.status(200).json(rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching project map', error: error.message });
  }
});

router.put('/project/:projectId', async (req, res) => {
  const projectId = Number(req.params.projectId);
  const { map } = req.body;
  if (!Number.isFinite(projectId)) return res.status(400).json({ message: 'Invalid projectId' });
  if (!map) return res.status(400).json({ message: 'Map data is required' });
  try {
    if (isPostgres) {
      const existing = await pool.query(
        `SELECT mapid FROM project_maps WHERE projectid = $1 AND voided = false ORDER BY mapid DESC LIMIT 1`,
        [projectId]
      );
      if ((existing.rowCount || 0) > 0) {
        const mapId = existing.rows[0].mapid;
        const updated = await pool.query(
          `UPDATE project_maps SET map = $1, updated_at = NOW() WHERE mapid = $2
           RETURNING mapid AS "mapId", projectid AS "projectId", map, voided, created_at AS "createdAt", updated_at AS "updatedAt"`,
          [map, mapId]
        );
        return res.status(200).json(updated.rows[0]);
      }
      const inserted = await pool.query(
        `INSERT INTO project_maps (projectid, map, voided)
         VALUES ($1, $2, false)
         RETURNING mapid AS "mapId", projectid AS "projectId", map, voided, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [projectId, map]
      );
      return res.status(201).json(inserted.rows[0]);
    }

    const [existingRows] = await pool.query(
      `SELECT * FROM project_maps WHERE projectId = ? AND (voided IS NULL OR voided = 0) ORDER BY mapId DESC LIMIT 1`,
      [projectId]
    );
    if (existingRows.length > 0) {
      const mapId = existingRows[0].mapId;
      const [result] = await pool.query(`UPDATE project_maps SET map = ? WHERE mapId = ?`, [map, mapId]);
      if (!result.affectedRows) return res.status(500).json({ message: 'Failed to update project map' });
      const [updatedRows] = await pool.query(`SELECT * FROM project_maps WHERE mapId = ?`, [mapId]);
      return res.status(200).json(updatedRows[0]);
    }
    const [result] = await pool.query(`INSERT INTO project_maps (projectId, map, voided) VALUES (?, ?, 0)`, [projectId, map]);
    if (!result.affectedRows) return res.status(500).json({ message: 'Failed to create project map' });
    const [newRows] = await pool.query(`SELECT * FROM project_maps WHERE mapId = ?`, [result.insertId]);
    return res.status(201).json(newRows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Error updating/creating project map', error: error.message });
  }
});

module.exports = router;
