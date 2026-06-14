const pool = require('../config/db');

let schemaReady = false;

const DEFAULT_PROFILE_NAME = 'Default';

async function ensureUiAccessSchema() {
    const DB_TYPE = process.env.DB_TYPE || 'postgresql';
    if (DB_TYPE !== 'postgresql' || schemaReady) return;

    await pool.query(`
        CREATE TABLE IF NOT EXISTS ui_profiles (
            id BIGSERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT NULL,
            visible_menu_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
            visible_tab_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
            is_default BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            voided BOOLEAN NOT NULL DEFAULT FALSE
        )
    `);
    await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_ui_profiles_name_active ON ui_profiles (lower(trim(name))) WHERE voided = false');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_ui_profiles_default ON ui_profiles (is_default) WHERE voided = false');

    await pool.query(`
        CREATE TABLE IF NOT EXISTS user_ui_profiles (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL,
            ui_profile_id BIGINT NOT NULL REFERENCES ui_profiles(id) ON DELETE CASCADE,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            voided BOOLEAN NOT NULL DEFAULT FALSE
        )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_user_ui_profiles_user_active ON user_ui_profiles (user_id) WHERE voided = false');

    await pool.query(
        `INSERT INTO ui_profiles (name, description, is_default)
         SELECT $1, $2, true
         WHERE NOT EXISTS (SELECT 1 FROM ui_profiles WHERE COALESCE(voided, false) = false)`,
        [DEFAULT_PROFILE_NAME, 'Fallback profile. Empty visibility lists mean use the existing menu and tab visibility.']
    );

    schemaReady = true;
}

function normalizeStringArray(value) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.map((v) => String(v || '').trim()).filter(Boolean))];
}

function rowToProfile(row) {
    if (!row) return null;
    return {
        id: row.id,
        name: row.name,
        description: row.description || '',
        visibleMenuKeys: normalizeStringArray(row.visibleMenuKeys || row.visible_menu_keys || []),
        visibleTabKeys: normalizeStringArray(row.visibleTabKeys || row.visible_tab_keys || []),
        isDefault: row.isDefault ?? row.is_default ?? false,
        createdAt: row.createdAt || row.created_at || null,
        updatedAt: row.updatedAt || row.updated_at || null,
    };
}

async function fetchUiProfiles() {
    await ensureUiAccessSchema();
    const result = await pool.query(`
        SELECT
            id,
            name,
            description,
            visible_menu_keys AS "visibleMenuKeys",
            visible_tab_keys AS "visibleTabKeys",
            is_default AS "isDefault",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
        FROM ui_profiles
        WHERE COALESCE(voided, false) = false
        ORDER BY is_default DESC, name ASC
    `);
    return (result.rows || []).map(rowToProfile);
}

async function fetchUiProfileById(profileId) {
    await ensureUiAccessSchema();
    const id = parseInt(String(profileId), 10);
    if (!Number.isFinite(id)) return null;
    const result = await pool.query(
        `SELECT
            id,
            name,
            description,
            visible_menu_keys AS "visibleMenuKeys",
            visible_tab_keys AS "visibleTabKeys",
            is_default AS "isDefault",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
         FROM ui_profiles
         WHERE id = $1 AND COALESCE(voided, false) = false
         LIMIT 1`,
        [id]
    );
    return rowToProfile(result.rows?.[0]);
}

async function createUiProfile(payload = {}) {
    await ensureUiAccessSchema();
    const name = String(payload.name || '').trim();
    if (!name) throw new Error('Profile name is required.');
    const description = String(payload.description || '').trim() || null;
    const visibleMenuKeys = normalizeStringArray(payload.visibleMenuKeys || payload.visible_menu_keys || []);
    const visibleTabKeys = normalizeStringArray(payload.visibleTabKeys || payload.visible_tab_keys || []);
    const isDefault = payload.isDefault === true || payload.is_default === true;

    const result = await pool.query(
        `INSERT INTO ui_profiles (name, description, visible_menu_keys, visible_tab_keys, is_default)
         VALUES ($1, $2, $3::jsonb, $4::jsonb, $5)
         RETURNING
            id,
            name,
            description,
            visible_menu_keys AS "visibleMenuKeys",
            visible_tab_keys AS "visibleTabKeys",
            is_default AS "isDefault",
            created_at AS "createdAt",
            updated_at AS "updatedAt"`,
        [name, description, JSON.stringify(visibleMenuKeys), JSON.stringify(visibleTabKeys), isDefault]
    );
    if (isDefault) {
        await pool.query('UPDATE ui_profiles SET is_default = false WHERE id <> $1 AND COALESCE(voided, false) = false', [result.rows[0].id]);
    }
    return rowToProfile(result.rows[0]);
}

async function updateUiProfile(profileId, payload = {}) {
    await ensureUiAccessSchema();
    const id = parseInt(String(profileId), 10);
    if (!Number.isFinite(id)) throw new Error('Invalid profile id.');
    const name = String(payload.name || '').trim();
    if (!name) throw new Error('Profile name is required.');
    const description = String(payload.description || '').trim() || null;
    const visibleMenuKeys = normalizeStringArray(payload.visibleMenuKeys || payload.visible_menu_keys || []);
    const visibleTabKeys = normalizeStringArray(payload.visibleTabKeys || payload.visible_tab_keys || []);
    const isDefault = payload.isDefault === true || payload.is_default === true;

    const result = await pool.query(
        `UPDATE ui_profiles
         SET name = $2,
             description = $3,
             visible_menu_keys = $4::jsonb,
             visible_tab_keys = $5::jsonb,
             is_default = $6,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND COALESCE(voided, false) = false
         RETURNING
            id,
            name,
            description,
            visible_menu_keys AS "visibleMenuKeys",
            visible_tab_keys AS "visibleTabKeys",
            is_default AS "isDefault",
            created_at AS "createdAt",
            updated_at AS "updatedAt"`,
        [id, name, description, JSON.stringify(visibleMenuKeys), JSON.stringify(visibleTabKeys), isDefault]
    );
    if (!result.rows?.[0]) throw new Error('UI profile not found.');
    if (isDefault) {
        await pool.query('UPDATE ui_profiles SET is_default = false WHERE id <> $1 AND COALESCE(voided, false) = false', [id]);
    }
    return rowToProfile(result.rows[0]);
}

async function deleteUiProfile(profileId) {
    await ensureUiAccessSchema();
    const id = parseInt(String(profileId), 10);
    if (!Number.isFinite(id)) throw new Error('Invalid profile id.');
    const profile = await fetchUiProfileById(id);
    if (!profile) return false;
    if (profile.isDefault) throw new Error('The default UI profile cannot be deleted.');
    await pool.query('UPDATE user_ui_profiles SET voided = true, updated_at = CURRENT_TIMESTAMP WHERE ui_profile_id = $1', [id]);
    const result = await pool.query('UPDATE ui_profiles SET voided = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND COALESCE(voided, false) = false', [id]);
    return result.rowCount > 0;
}

async function assignUiProfileToUser(userId, profileId) {
    await ensureUiAccessSchema();
    const uid = parseInt(String(userId), 10);
    if (!Number.isFinite(uid)) throw new Error('Invalid user id.');
    const pid = profileId === null || profileId === undefined || profileId === ''
        ? null
        : parseInt(String(profileId), 10);

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        await conn.query('UPDATE user_ui_profiles SET voided = true, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND COALESCE(voided, false) = false', [uid]);
        if (Number.isFinite(pid)) {
            const profile = await fetchUiProfileById(pid);
            if (!profile) throw new Error('Selected UI profile does not exist.');
            await conn.query(
                `INSERT INTO user_ui_profiles (user_id, ui_profile_id)
                 VALUES ($1, $2)`,
                [uid, pid]
            );
        }
        await conn.commit();
    } catch (error) {
        try {
            await conn.rollback();
        } catch (rollbackError) {
            console.warn('assignUiProfileToUser rollback failed:', rollbackError.message);
        }
        throw error;
    } finally {
        conn.release();
    }
}

async function fetchUiProfileForUser(userId) {
    await ensureUiAccessSchema();
    const uid = parseInt(String(userId), 10);
    if (!Number.isFinite(uid)) return null;
    const result = await pool.query(
        `SELECT
            p.id,
            p.name,
            p.description,
            p.visible_menu_keys AS "visibleMenuKeys",
            p.visible_tab_keys AS "visibleTabKeys",
            p.is_default AS "isDefault",
            p.created_at AS "createdAt",
            p.updated_at AS "updatedAt"
         FROM user_ui_profiles up
         INNER JOIN ui_profiles p ON p.id = up.ui_profile_id AND COALESCE(p.voided, false) = false
         WHERE up.user_id = $1 AND COALESCE(up.voided, false) = false
         ORDER BY up.id DESC
         LIMIT 1`,
        [uid]
    );
    if (result.rows?.[0]) return rowToProfile(result.rows[0]);

    const fallback = await pool.query(
        `SELECT
            id,
            name,
            description,
            visible_menu_keys AS "visibleMenuKeys",
            visible_tab_keys AS "visibleTabKeys",
            is_default AS "isDefault",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
         FROM ui_profiles
         WHERE COALESCE(voided, false) = false AND is_default = true
         ORDER BY id
         LIMIT 1`
    );
    return rowToProfile(fallback.rows?.[0]);
}

async function fetchUiProfilesForUsers(userIds) {
    await ensureUiAccessSchema();
    const ids = [...new Set(userIds)]
        .map((id) => parseInt(String(id), 10))
        .filter((id) => Number.isFinite(id));
    const map = new Map();
    if (ids.length === 0) return map;

    const result = await pool.query(
        `SELECT DISTINCT ON (up.user_id)
            up.user_id AS "userId",
            p.id,
            p.name,
            p.description,
            p.visible_menu_keys AS "visibleMenuKeys",
            p.visible_tab_keys AS "visibleTabKeys",
            p.is_default AS "isDefault",
            p.created_at AS "createdAt",
            p.updated_at AS "updatedAt"
         FROM user_ui_profiles up
         INNER JOIN ui_profiles p ON p.id = up.ui_profile_id AND COALESCE(p.voided, false) = false
         WHERE up.user_id = ANY($1::int[]) AND COALESCE(up.voided, false) = false
         ORDER BY up.user_id, up.id DESC`,
        [ids]
    );
    for (const row of result.rows || []) {
        map.set(parseInt(String(row.userId), 10), rowToProfile(row));
    }
    return map;
}

module.exports = {
    ensureUiAccessSchema,
    fetchUiProfiles,
    fetchUiProfileById,
    createUiProfile,
    updateUiProfile,
    deleteUiProfile,
    assignUiProfileToUser,
    fetchUiProfileForUser,
    fetchUiProfilesForUsers,
    normalizeStringArray,
};
