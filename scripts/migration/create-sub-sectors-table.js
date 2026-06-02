/**
 * Migration script to add sub-sector support under sectors.
 *
 * Usage: node scripts/migration/create-sub-sectors-table.js
 */

const pool = require('../../api/config/db');

async function createSubSectorsTable() {
    const DB_TYPE = process.env.DB_TYPE || 'postgresql';

    try {
        console.log('Starting migration: Creating sub_sectors table...');

        if (DB_TYPE === 'postgresql') {
            await pool.query(`
                ALTER TABLE sectors
                ADD COLUMN IF NOT EXISTS alias VARCHAR(255);
            `);

            await pool.query(`
                CREATE TABLE IF NOT EXISTS sub_sectors (
                    id SERIAL PRIMARY KEY,
                    sector_id INTEGER NOT NULL REFERENCES sectors(id) ON DELETE CASCADE,
                    name TEXT NOT NULL,
                    alias VARCHAR(255),
                    description TEXT,
                    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    voided BOOLEAN DEFAULT FALSE
                );
            `);

            await pool.query(`CREATE INDEX IF NOT EXISTS idx_sub_sectors_sector_id ON sub_sectors(sector_id);`);
            await pool.query(`CREATE INDEX IF NOT EXISTS idx_sub_sectors_name ON sub_sectors(name);`);
            await pool.query(`CREATE INDEX IF NOT EXISTS idx_sub_sectors_alias ON sub_sectors(alias);`);
            await pool.query(`CREATE INDEX IF NOT EXISTS idx_sub_sectors_voided ON sub_sectors(voided);`);
            await pool.query(`
                CREATE UNIQUE INDEX IF NOT EXISTS idx_sub_sectors_unique_sector_name
                ON sub_sectors(sector_id, lower(name))
                WHERE voided = false;
            `);
        } else {
            try {
                await pool.query(`ALTER TABLE sectors ADD COLUMN alias VARCHAR(255) NULL;`);
            } catch (err) {
                if (err.code !== 'ER_DUP_FIELDNAME') throw err;
            }

            await pool.query(`
                CREATE TABLE IF NOT EXISTS sub_sectors (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    sector_id INT NOT NULL,
                    name TEXT NOT NULL,
                    alias VARCHAR(255) NULL,
                    description TEXT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    voided TINYINT(1) DEFAULT 0,
                    INDEX idx_sub_sectors_sector_id (sector_id),
                    INDEX idx_sub_sectors_alias (alias),
                    INDEX idx_sub_sectors_voided (voided)
                );
            `);
        }

        console.log('✅ Migration completed successfully.');
        console.log('You can now add sub-sectors and aliases under Sectors Management.');
    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        await pool.end();
    }
}

if (require.main === module) {
    createSubSectorsTable()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}

module.exports = createSubSectorsTable;
