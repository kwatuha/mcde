/**
 * Migrate tables with foreign keys to projects from remote to local database
 */

const { Pool } = require('pg');
const { execSync } = require('child_process');

const remoteConfig = {
    host: process.env.REMOTE_PG_HOST || 'localhost',
    user: process.env.REMOTE_PG_USER || 'postgres',
    password: process.env.REMOTE_PG_PASSWORD || process.env.DB_PASSWORD || 'postgres',
    database: process.env.REMOTE_PG_DATABASE || 'government_projects'
};

const localConfig = {
    host: process.env.LOCAL_PG_HOST || 'localhost',
    port: Number(process.env.LOCAL_PG_PORT || 5433),
    user: process.env.LOCAL_PG_USER || 'postgres',
    password: process.env.LOCAL_PG_PASSWORD || process.env.DB_PASSWORD || 'postgres',
    database: process.env.LOCAL_PG_DATABASE || 'government_projects'
};

async function migrateTables() {
    const remotePool = new Pool(remoteConfig);
    const localPool = new Pool(localConfig);
    
    try {
        console.log('==========================================');
        console.log('Migrating tables with foreign keys to projects');
        console.log('from remote to local database');
        console.log('==========================================\n');
        
        // Get list of tables that reference projects table
        const fkQuery = `
            SELECT DISTINCT tc.table_name
            FROM information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu 
                ON tc.constraint_name = kcu.constraint_name
            JOIN information_schema.constraint_column_usage AS ccu 
                ON ccu.constraint_name = tc.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY' 
                AND ccu.table_name = 'projects'
            ORDER BY tc.table_name;
        `;
        
        const fkResult = await remotePool.query(fkQuery);
        const tables = fkResult.rows.map(row => row.table_name);
        
        console.log(`Found ${tables.length} tables with foreign keys to projects:\n`);
        tables.forEach(t => console.log(`  - ${t}`));
        console.log('');
        
        for (const tableName of tables) {
            console.log(`Processing table: ${tableName}`);
            console.log('----------------------------------------');
            
            try {
                // Get table schema from remote
                const schemaQuery = `
                    SELECT 
                        column_name,
                        data_type,
                        is_nullable,
                        column_default,
                        character_maximum_length,
                        numeric_precision,
                        numeric_scale
                    FROM information_schema.columns
                    WHERE table_name = $1
                    ORDER BY ordinal_position;
                `;
                
                const schemaResult = await remotePool.query(schemaQuery, [tableName]);
                const columns = schemaResult.rows;
                
                if (columns.length === 0) {
                    console.log(`  ⚠ Table ${tableName} not found in remote database\n`);
                    continue;
                }
                
                console.log(`  ✓ Found ${columns.length} columns in remote table`);
                
                // Get constraints (primary keys, foreign keys, etc.)
                const constraintsQuery = `
                    SELECT
                        tc.constraint_name,
                        tc.constraint_type,
                        kcu.column_name,
                        ccu.table_name AS foreign_table_name,
                        ccu.column_name AS foreign_column_name
                    FROM information_schema.table_constraints tc
                    LEFT JOIN information_schema.key_column_usage kcu
                        ON tc.constraint_name = kcu.constraint_name
                    LEFT JOIN information_schema.constraint_column_usage ccu
                        ON tc.constraint_name = ccu.constraint_name
                    WHERE tc.table_name = $1
                    ORDER BY tc.constraint_type, tc.constraint_name;
                `;
                
                const constraintsResult = await remotePool.query(constraintsQuery, [tableName]);
                const constraints = constraintsResult.rows;
                
                // Build CREATE TABLE statement
                let createTableSQL = `CREATE TABLE IF NOT EXISTS ${tableName} (\n`;
                
                const columnDefs = columns.map(col => {
                    let def = `    "${col.column_name}" ${col.data_type}`;
                    
                    if (col.character_maximum_length) {
                        def += `(${col.character_maximum_length})`;
                    } else if (col.numeric_precision && col.numeric_scale) {
                        def += `(${col.numeric_precision},${col.numeric_scale})`;
                    } else if (col.numeric_precision) {
                        def += `(${col.numeric_precision})`;
                    }
                    
                    if (col.is_nullable === 'NO') {
                        def += ' NOT NULL';
                    }
                    
                    // Handle column defaults - skip if it's a sequence (nextval)
                    if (col.column_default && !col.column_default.includes('nextval')) {
                        // Remove ::regclass or other type casts from default
                        let defaultVal = col.column_default;
                        defaultVal = defaultVal.replace(/::\w+/g, '');
                        def += ` DEFAULT ${defaultVal}`;
                    }
                    
                    return def;
                });
                
                createTableSQL += columnDefs.join(',\n');
                
                // Add primary key constraint
                const pkConstraints = constraints.filter(c => c.constraint_type === 'PRIMARY KEY');
                if (pkConstraints.length > 0) {
                    const pkCols = pkConstraints.map(c => `"${c.column_name}"`).join(', ');
                    createTableSQL += `,\n    PRIMARY KEY (${pkCols})`;
                }
                
                createTableSQL += '\n);';
                
                // Drop table if exists
                console.log(`  → Dropping existing table if exists...`);
                await localPool.query(`DROP TABLE IF EXISTS ${tableName} CASCADE;`).catch(() => {});
                
                // Create table
                console.log(`  → Creating table in local database...`);
                await localPool.query(createTableSQL);
                
                // Add foreign key constraints
                const fkConstraints = constraints.filter(c => c.constraint_type === 'FOREIGN KEY');
                for (const fk of fkConstraints) {
                    if (fk.foreign_table_name && fk.foreign_column_name) {
                        // Check if referenced table exists
                        const refTableExists = await localPool.query(
                            `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)`,
                            [fk.foreign_table_name]
                        );
                        
                        if (refTableExists.rows[0].exists) {
                            const fkSQL = `
                                ALTER TABLE ${tableName}
                                ADD CONSTRAINT ${fk.constraint_name}
                                FOREIGN KEY (${fk.column_name})
                                REFERENCES ${fk.foreign_table_name}(${fk.foreign_column_name})
                                ON DELETE CASCADE;
                            `;
                            await localPool.query(fkSQL).catch(err => {
                                console.log(`    ⚠ Could not add FK constraint: ${err.message.split('\n')[0]}`);
                            });
                        } else {
                            console.log(`    ⚠ Referenced table ${fk.foreign_table_name} does not exist, skipping FK constraint`);
                        }
                    }
                }
                
                // Get row count from remote
                const countResult = await remotePool.query(`SELECT COUNT(*) as count FROM ${tableName}`);
                const remoteCount = parseInt(countResult.rows[0].count);
                
                console.log(`  → Migrating ${remoteCount} rows from remote...`);
                
                // Fetch all data from remote
                const dataResult = await remotePool.query(`SELECT * FROM ${tableName}`);
                const rows = dataResult.rows;
                
                if (rows.length > 0) {
                    // Insert data into local
                    const columnNames = columns.map(c => c.column_name).join(', ');
                    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
                    
                    for (const row of rows) {
                        const values = columns.map(col => row[col.column_name]);
                        await localPool.query(
                            `INSERT INTO ${tableName} (${columnNames}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
                            values
                        );
                    }
                }
                
                // Verify row count
                const localCountResult = await localPool.query(`SELECT COUNT(*) as count FROM ${tableName}`);
                const localCount = parseInt(localCountResult.rows[0].count);
                
                console.log(`  ✓ Migration complete: ${remoteCount} remote rows → ${localCount} local rows\n`);
                
            } catch (error) {
                console.error(`  ✗ Error processing ${tableName}:`, error.message);
                console.log('');
            }
        }
        
        console.log('==========================================');
        console.log('Migration complete!');
        console.log('==========================================');
        
    } catch (error) {
        console.error('Migration error:', error);
        throw error;
    } finally {
        await remotePool.end();
        await localPool.end();
    }
}

// Run migration
migrateTables()
    .then(() => {
        console.log('\nDone!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\nMigration failed:', error);
        process.exit(1);
    });
