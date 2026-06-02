const express = require('express');
const router = express.Router();
const pool = require('../config/db');

function getRows(result, dbType) {
    if (dbType === 'postgresql') return result.rows || [];
    return Array.isArray(result) ? (result[0] || []) : (result.rows || result || []);
}

async function columnExists(tableName, columnName, dbType) {
    try {
        if (dbType === 'postgresql') {
            const result = await pool.query(
                `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
                [tableName, columnName]
            );
            return (result.rows || []).length > 0;
        }
        const result = await pool.query(
            `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = ? AND COLUMN_NAME = ?`,
            [tableName, columnName]
        );
        return getRows(result, dbType).length > 0;
    } catch (error) {
        console.warn(`Could not check ${tableName}.${columnName}:`, error.message);
        return false;
    }
}

async function tableExists(tableName, dbType) {
    try {
        if (dbType === 'postgresql') {
            const result = await pool.query(`SELECT to_regclass($1) AS table_name`, [tableName]);
            return Boolean(result.rows?.[0]?.table_name);
        }
        const result = await pool.query(`SHOW TABLES LIKE ?`, [tableName]);
        return getRows(result, dbType).length > 0;
    } catch (error) {
        console.warn(`Could not check table ${tableName}:`, error.message);
        return false;
    }
}

function normalizeSubSectors(subSectors) {
    if (!Array.isArray(subSectors)) return [];
    return subSectors
        .map((row) => ({
            id: row.id || row.subSectorId || row.sub_sector_id || null,
            subSectorName: String(row.subSectorName || row.name || row.sub_sector_name || '').trim(),
            alias: String(row.alias || '').trim(),
            description: String(row.description || '').trim(),
        }))
        .filter((row) => row.subSectorName);
}

async function fetchSubSectorsForSectorIds(sectorIds, dbType) {
    if (!sectorIds.length || !(await tableExists('sub_sectors', dbType))) return new Map();

    let result;
    if (dbType === 'postgresql') {
        result = await pool.query(
            `SELECT
                id,
                sector_id AS "sectorId",
                name AS "subSectorName",
                COALESCE(alias, '') AS alias,
                description,
                created_at AS "createdAt",
                updated_at AS "updatedAt",
                voided
             FROM sub_sectors
             WHERE COALESCE(voided, false) = false
               AND sector_id = ANY($1::int[])
             ORDER BY name`,
            [sectorIds]
        );
    } else {
        const placeholders = sectorIds.map(() => '?').join(',');
        result = await pool.query(
            `SELECT
                id,
                sector_id AS sectorId,
                name AS subSectorName,
                COALESCE(alias, '') AS alias,
                description,
                created_at AS createdAt,
                updated_at AS updatedAt,
                voided
             FROM sub_sectors
             WHERE COALESCE(voided, 0) = 0
               AND sector_id IN (${placeholders})
             ORDER BY name`,
            sectorIds
        );
    }

    const map = new Map();
    for (const row of getRows(result, dbType)) {
        const key = Number(row.sectorId);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(row);
    }
    return map;
}

async function attachSubSectors(sectors, dbType) {
    const rows = Array.isArray(sectors) ? sectors : [];
    const ids = rows.map((sector) => Number(sector.id)).filter(Boolean);
    const bySector = await fetchSubSectorsForSectorIds(ids, dbType);
    return rows.map((sector) => ({
        ...sector,
        subSectors: bySector.get(Number(sector.id)) || [],
    }));
}

async function syncSubSectors(sectorId, subSectors, dbType) {
    if (!Array.isArray(subSectors)) return;
    if (!(await tableExists('sub_sectors', dbType))) {
        throw new Error('sub_sectors table does not exist. Run the sub-sector migration before saving sub-sectors.');
    }

    const normalized = normalizeSubSectors(subSectors);
    const keptIds = normalized.map((row) => Number(row.id)).filter(Boolean);

    if (dbType === 'postgresql') {
        await pool.query(
            `UPDATE sub_sectors
             SET voided = true, updated_at = CURRENT_TIMESTAMP
             WHERE sector_id = $1
               AND COALESCE(voided, false) = false
               AND (${keptIds.length ? 'id <> ALL($2::int[])' : 'true'})`,
            keptIds.length ? [sectorId, keptIds] : [sectorId]
        );

        for (const row of normalized) {
            if (row.id) {
                await pool.query(
                    `UPDATE sub_sectors
                     SET name = $1, alias = $2, description = $3, voided = false, updated_at = CURRENT_TIMESTAMP
                     WHERE id = $4 AND sector_id = $5`,
                    [row.subSectorName, row.alias || null, row.description || null, row.id, sectorId]
                );
            } else {
                await pool.query(
                    `INSERT INTO sub_sectors (sector_id, name, alias, description, voided)
                     VALUES ($1, $2, $3, $4, false)`,
                    [sectorId, row.subSectorName, row.alias || null, row.description || null]
                );
            }
        }
    } else {
        if (keptIds.length) {
            const placeholders = keptIds.map(() => '?').join(',');
            await pool.query(
                `UPDATE sub_sectors SET voided = 1, updated_at = CURRENT_TIMESTAMP WHERE sector_id = ? AND COALESCE(voided, 0) = 0 AND id NOT IN (${placeholders})`,
                [sectorId, ...keptIds]
            );
        } else {
            await pool.query(
                `UPDATE sub_sectors SET voided = 1, updated_at = CURRENT_TIMESTAMP WHERE sector_id = ? AND COALESCE(voided, 0) = 0`,
                [sectorId]
            );
        }

        for (const row of normalized) {
            if (row.id) {
                await pool.query(
                    `UPDATE sub_sectors SET name = ?, alias = ?, description = ?, voided = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND sector_id = ?`,
                    [row.subSectorName, row.alias || null, row.description || null, row.id, sectorId]
                );
            } else {
                await pool.query(
                    `INSERT INTO sub_sectors (sector_id, name, alias, description, voided) VALUES (?, ?, ?, ?, 0)`,
                    [sectorId, row.subSectorName, row.alias || null, row.description || null]
                );
            }
        }
    }
}

/**
 * @route GET /api/sectors
 * @description Get all sectors that are not voided
 * @access Private
 */
router.get('/', async (req, res) => {
    const DB_TYPE = process.env.DB_TYPE || 'postgresql';
    
    try {
        const aliasColumnExists = await columnExists('sectors', 'alias', DB_TYPE);
        
        let query;
        if (DB_TYPE === 'postgresql') {
            if (aliasColumnExists) {
                query = `
                    SELECT 
                        id,
                        name AS "sectorName",
                        COALESCE(alias, '') AS alias,
                        description,
                        created_at AS "createdAt",
                        updated_at AS "updatedAt",
                        voided
                    FROM sectors
                    WHERE voided = false
                    ORDER BY name
                `;
            } else {
                query = `
                    SELECT 
                        id,
                        name AS "sectorName",
                        '' AS alias,
                        description,
                        created_at AS "createdAt",
                        updated_at AS "updatedAt",
                        voided
                    FROM sectors
                    WHERE voided = false
                    ORDER BY name
                `;
            }
        } else {
            if (aliasColumnExists) {
                query = `
                    SELECT 
                        id,
                        name AS sectorName,
                        COALESCE(alias, '') AS alias,
                        description,
                        createdAt,
                        updatedAt,
                        voided
                    FROM sectors
                    WHERE voided = 0
                    ORDER BY name
                `;
            } else {
                query = `
                    SELECT 
                        id,
                        name AS sectorName,
                        '' AS alias,
                        description,
                        createdAt,
                        updatedAt,
                        voided
                    FROM sectors
                    WHERE voided = 0
                    ORDER BY name
                `;
            }
        }
        
        const result = await pool.query(query);
        const sectors = getRows(result, DB_TYPE);
        const sectorsWithSubSectors = await attachSubSectors(sectors, DB_TYPE);
        
        res.status(200).json(sectorsWithSubSectors);
    } catch (error) {
        console.error('Error fetching sectors:', error);
        res.status(500).json({ message: 'Error fetching sectors', error: error.message });
    }
});

/**
 * @route GET /api/sectors/:id
 * @description Get a single sector by ID
 * @access Private
 */
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    const DB_TYPE = process.env.DB_TYPE || 'postgresql';
    
    try {
        const aliasColumnExists = await columnExists('sectors', 'alias', DB_TYPE);
        
        let query;
        if (DB_TYPE === 'postgresql') {
            if (aliasColumnExists) {
                query = `
                    SELECT 
                        id,
                        name AS "sectorName",
                        COALESCE(alias, '') AS alias,
                        description,
                        created_at AS "createdAt",
                        updated_at AS "updatedAt",
                        voided
                    FROM sectors
                    WHERE id = $1 AND voided = false
                `;
            } else {
                query = `
                    SELECT 
                        id,
                        name AS "sectorName",
                        '' AS alias,
                        description,
                        created_at AS "createdAt",
                        updated_at AS "updatedAt",
                        voided
                    FROM sectors
                    WHERE id = $1 AND voided = false
                `;
            }
        } else {
            if (aliasColumnExists) {
                query = `
                    SELECT 
                        id,
                        name AS sectorName,
                        COALESCE(alias, '') AS alias,
                        description,
                        createdAt,
                        updatedAt,
                        voided
                    FROM sectors
                    WHERE id = ? AND voided = 0
                `;
            } else {
                query = `
                    SELECT 
                        id,
                        name AS sectorName,
                        '' AS alias,
                        description,
                        createdAt,
                        updatedAt,
                        voided
                    FROM sectors
                    WHERE id = ? AND voided = 0
                `;
            }
        }
        
        const result = await pool.query(query, [id]);
        const sector = getRows(result, DB_TYPE)[0] || null;
        
        if (sector) {
            const [sectorWithSubSectors] = await attachSubSectors([sector], DB_TYPE);
            res.status(200).json(sectorWithSubSectors);
        } else {
            res.status(404).json({ message: 'Sector not found' });
        }
    } catch (error) {
        console.error('Error fetching sector:', error);
        res.status(500).json({ message: 'Error fetching sector', error: error.message });
    }
});

/**
 * @route POST /api/sectors
 * @description Create a new sector
 * @access Private
 */
router.post('/', async (req, res) => {
    const DB_TYPE = process.env.DB_TYPE || 'postgresql';
    const { sectorName, alias, description, subSectors } = req.body;
    
    if (!sectorName || !sectorName.trim()) {
        return res.status(400).json({ message: 'Sector name is required' });
    }
    
    try {
        const aliasColumnExists = await columnExists('sectors', 'alias', DB_TYPE);
        
        let query, params;
        if (DB_TYPE === 'postgresql') {
            if (aliasColumnExists) {
                query = `
                    INSERT INTO sectors (name, alias, description, voided)
                    VALUES ($1, $2, $3, false)
                    RETURNING id, name AS "sectorName", COALESCE(alias, '') AS alias, description, created_at AS "createdAt", updated_at AS "updatedAt", voided
                `;
                params = [sectorName.trim(), alias?.trim() || null, description?.trim() || null];
            } else {
                query = `
                    INSERT INTO sectors (name, description, voided)
                    VALUES ($1, $2, false)
                    RETURNING id, name AS "sectorName", '' AS alias, description, created_at AS "createdAt", updated_at AS "updatedAt", voided
                `;
                params = [sectorName.trim(), description?.trim() || null];
            }
        } else {
            if (aliasColumnExists) {
                query = `
                    INSERT INTO sectors (name, alias, description, voided)
                    VALUES (?, ?, ?, 0)
                `;
                params = [sectorName.trim(), alias?.trim() || null, description?.trim() || null];
            } else {
                query = `
                    INSERT INTO sectors (name, description, voided)
                    VALUES (?, ?, 0)
                `;
                params = [sectorName.trim(), description?.trim() || null];
            }
        }
        
        const result = await pool.query(query, params);
        
        if (DB_TYPE === 'postgresql') {
            const createdSector = result.rows[0];
            await syncSubSectors(createdSector.id, subSectors, DB_TYPE);
            const [sectorWithSubSectors] = await attachSubSectors([createdSector], DB_TYPE);
            res.status(201).json({
                message: 'Sector created successfully',
                sector: sectorWithSubSectors
            });
        } else {
            const inserted = Array.isArray(result) ? result[0] : result;
            const newSector = {
                id: inserted.insertId,
                sectorName: sectorName.trim(),
                alias: aliasColumnExists ? (alias?.trim() || '') : '',
                description: description?.trim() || null,
                voided: false
            };
            await syncSubSectors(newSector.id, subSectors, DB_TYPE);
            const [sectorWithSubSectors] = await attachSubSectors([newSector], DB_TYPE);
            res.status(201).json({
                message: 'Sector created successfully',
                sector: sectorWithSubSectors
            });
        }
    } catch (error) {
        console.error('Error creating sector:', error);
        
        // Handle duplicate key error
        if (error.code === '23505' || error.message.includes('duplicate') || error.message.includes('UNIQUE')) {
            return res.status(400).json({ message: 'A sector with this name already exists' });
        }
        
        res.status(500).json({ message: 'Error creating sector', error: error.message });
    }
});

/**
 * @route PUT /api/sectors/:id
 * @description Update an existing sector
 * @access Private
 */
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const DB_TYPE = process.env.DB_TYPE || 'postgresql';
    const { sectorName, alias, description, subSectors } = req.body;
    
    if (!sectorName || !sectorName.trim()) {
        return res.status(400).json({ message: 'Sector name is required' });
    }
    
    try {
        const aliasColumnExists = await columnExists('sectors', 'alias', DB_TYPE);
        
        console.log(`[Sectors Update] Alias column exists: ${aliasColumnExists}, Alias value: "${alias}"`);
        
        let query, params;
        if (DB_TYPE === 'postgresql') {
            if (aliasColumnExists) {
                query = `
                    UPDATE sectors
                    SET name = $1, alias = $2, description = $3, updated_at = CURRENT_TIMESTAMP
                    WHERE id = $4 AND voided = false
                    RETURNING id, name AS "sectorName", COALESCE(alias, '') AS alias, description, created_at AS "createdAt", updated_at AS "updatedAt", voided
                `;
                params = [sectorName.trim(), alias?.trim() || null, description?.trim() || null, id];
            } else {
                console.warn('[Sectors Update] Alias column does not exist, alias value will not be saved. Please run migration script.');
                query = `
                    UPDATE sectors
                    SET name = $1, description = $2, updated_at = CURRENT_TIMESTAMP
                    WHERE id = $3 AND voided = false
                    RETURNING id, name AS "sectorName", '' AS alias, description, created_at AS "createdAt", updated_at AS "updatedAt", voided
                `;
                params = [sectorName.trim(), description?.trim() || null, id];
            }
        } else {
            if (aliasColumnExists) {
                query = `
                    UPDATE sectors
                    SET name = ?, alias = ?, description = ?, updatedAt = CURRENT_TIMESTAMP
                    WHERE id = ? AND voided = 0
                `;
                params = [sectorName.trim(), alias?.trim() || null, description?.trim() || null, id];
            } else {
                console.warn('[Sectors Update] Alias column does not exist, alias value will not be saved. Please run migration script.');
                query = `
                    UPDATE sectors
                    SET name = ?, description = ?, updatedAt = CURRENT_TIMESTAMP
                    WHERE id = ? AND voided = 0
                `;
                params = [sectorName.trim(), description?.trim() || null, id];
            }
        }
        
        console.log(`[Sectors Update] Executing query with params:`, params);
        const result = await pool.query(query, params);
        console.log(`[Sectors Update] Update result:`, result.rows?.[0] || result);
        
        if (DB_TYPE === 'postgresql') {
            if (result.rows.length === 0) {
                return res.status(404).json({ message: 'Sector not found' });
            }
            await syncSubSectors(id, subSectors, DB_TYPE);
            const [sectorWithSubSectors] = await attachSubSectors([result.rows[0]], DB_TYPE);
            res.status(200).json({
                message: 'Sector updated successfully',
                sector: sectorWithSubSectors
            });
        } else {
            const updatedResult = Array.isArray(result) ? result[0] : result;
            if (updatedResult.affectedRows === 0) {
                return res.status(404).json({ message: 'Sector not found' });
            }
            await syncSubSectors(id, subSectors, DB_TYPE);
            // Fetch updated sector
            let fetchQuery;
            if (aliasColumnExists) {
                fetchQuery = 'SELECT id, name AS sectorName, COALESCE(alias, \'\') AS alias, description, createdAt, updatedAt, voided FROM sectors WHERE id = ?';
            } else {
                fetchQuery = 'SELECT id, name AS sectorName, \'\' AS alias, description, createdAt, updatedAt, voided FROM sectors WHERE id = ?';
            }
            const [updated] = await pool.query(fetchQuery, [id]);
            const [sectorWithSubSectors] = await attachSubSectors([updated[0]], DB_TYPE);
            res.status(200).json({
                message: 'Sector updated successfully',
                sector: sectorWithSubSectors
            });
        }
    } catch (error) {
        console.error('Error updating sector:', error);
        
        // Handle duplicate key error
        if (error.code === '23505' || error.message.includes('duplicate') || error.message.includes('UNIQUE')) {
            return res.status(400).json({ message: 'A sector with this name already exists' });
        }
        
        res.status(500).json({ message: 'Error updating sector', error: error.message });
    }
});

/**
 * @route DELETE /api/sectors/:id
 * @description Soft delete a sector (set voided = true)
 * @access Private
 */
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const DB_TYPE = process.env.DB_TYPE || 'postgresql';
    
    try {
        let query;
        if (DB_TYPE === 'postgresql') {
            query = `
                UPDATE sectors
                SET voided = true, updated_at = CURRENT_TIMESTAMP
                WHERE id = $1 AND voided = false
                RETURNING id
            `;
        } else {
            query = `
                UPDATE sectors
                SET voided = 1, updatedAt = CURRENT_TIMESTAMP
                WHERE id = ? AND voided = 0
            `;
        }
        
        const result = await pool.query(query, [id]);
        
        const affectedRows = DB_TYPE === 'postgresql' ? result.rows.length : result.affectedRows;
        
        if (affectedRows === 0) {
            return res.status(404).json({ message: 'Sector not found' });
        }

        if (await tableExists('sub_sectors', DB_TYPE)) {
            if (DB_TYPE === 'postgresql') {
                await pool.query(
                    `UPDATE sub_sectors SET voided = true, updated_at = CURRENT_TIMESTAMP WHERE sector_id = $1 AND COALESCE(voided, false) = false`,
                    [id]
                );
            } else {
                await pool.query(
                    `UPDATE sub_sectors SET voided = 1, updated_at = CURRENT_TIMESTAMP WHERE sector_id = ? AND COALESCE(voided, 0) = 0`,
                    [id]
                );
            }
        }
        
        res.status(200).json({ message: 'Sector deleted successfully' });
    } catch (error) {
        console.error('Error deleting sector:', error);
        res.status(500).json({ message: 'Error deleting sector', error: error.message });
    }
});

module.exports = router;
