/**
 * Simple migration: Use pg_dump to export schema and data, then import to local
 */

const { execSync } = require('child_process');
const fs = require('fs');
const { Pool } = require('pg');

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
                // Check if table exists in remote
                const tableExists = await remotePool.query(
                    `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)`,
                    [tableName]
                );
                
                if (!tableExists.rows[0].exists) {
                    console.log(`  ⚠ Table ${tableName} does not exist in remote database\n`);
                    continue;
                }
                
                // Get row count from remote
                const countResult = await remotePool.query(`SELECT COUNT(*) as count FROM ${tableName}`);
                const remoteCount = parseInt(countResult.rows[0].count);
                
                console.log(`  ✓ Found ${remoteCount} rows in remote table`);
                
                // Use pg_dump to export schema
                const schemaFile = `/tmp/${tableName}_schema.sql`;
                const dataFile = `/tmp/${tableName}_data.sql`;
                
                console.log(`  → Exporting schema from remote...`);
                try {
                    execSync(
                        `PGPASSWORD=${remoteConfig.password} pg_dump -h ${remoteConfig.host} -U ${remoteConfig.user} -d ${remoteConfig.database} --schema-only -t ${tableName} > ${schemaFile} 2>&1`,
                        { encoding: 'utf8' }
                    );
                } catch (err) {
                    console.log(`    ⚠ Error exporting schema: ${err.message}`);
                    continue;
                }
                
                // Export data
                console.log(`  → Exporting data from remote...`);
                try {
                    execSync(
                        `PGPASSWORD=${remoteConfig.password} pg_dump -h ${remoteConfig.host} -U ${remoteConfig.user} -d ${remoteConfig.database} --data-only -t ${tableName} > ${dataFile} 2>&1`,
                        { encoding: 'utf8' }
                    );
                } catch (err) {
                    console.log(`    ⚠ Error exporting data: ${err.message}`);
                }
                
                // Drop table if exists in local
                console.log(`  → Dropping existing table if exists...`);
                await localPool.query(`DROP TABLE IF EXISTS ${tableName} CASCADE;`).catch(() => {});
                
                // Read and fix schema file
                let schemaSQL = fs.readFileSync(schemaFile, 'utf8');
                
                // Fix sequence references - replace remote sequence names with local ones
                schemaSQL = schemaSQL.replace(/nextval\('([^']+)_seq'::regclass\)/g, (match, seqName) => {
                    // Extract table name from sequence name
                    const tablePart = seqName.split('_').slice(0, -1).join('_');
                    return `nextval('${tableName}_${tablePart}_seq'::regclass)`;
                });
                
                // Remove SET statements and other pg_dump specific commands
                schemaSQL = schemaSQL.replace(/^SET .*$/gm, '');
                schemaSQL = schemaSQL.replace(/^SELECT .*$/gm, '');
                
                // Apply schema to local
                console.log(`  → Creating table in local database...`);
                try {
                    // Split by semicolons and execute each statement
                    const statements = schemaSQL
                        .split(';')
                        .map(s => s.trim())
                        .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('SET') && !s.startsWith('SELECT'));
                    
                    for (const stmt of statements) {
                        if (stmt.toLowerCase().includes('create table') || stmt.toLowerCase().includes('alter table') || stmt.toLowerCase().includes('create index') || stmt.toLowerCase().includes('create unique')) {
                            await localPool.query(stmt).catch(err => {
                                // Ignore "already exists" errors
                                if (!err.message.includes('already exists') && !err.message.includes('does not exist')) {
                                    console.log(`    ⚠ Warning: ${err.message.split('\n')[0]}`);
                                }
                            });
                        }
                    }
                } catch (err) {
                    console.log(`    ⚠ Error creating table: ${err.message.split('\n')[0]}`);
                    // Try to continue anyway
                }
                
                // Import data
                if (remoteCount > 0) {
                    console.log(`  → Importing ${remoteCount} rows...`);
                    try {
                        let dataSQL = fs.readFileSync(dataFile, 'utf8');
                        
                        // Remove COPY statements and use INSERT instead
                        // First, get the actual data
                        const dataResult = await remotePool.query(`SELECT * FROM ${tableName}`);
                        const rows = dataResult.rows;
                        
                        if (rows.length > 0) {
                            // Get column names
                            const columnResult = await remotePool.query(`
                                SELECT column_name 
                                FROM information_schema.columns 
                                WHERE table_name = $1 
                                ORDER BY ordinal_position
                            `, [tableName]);
                            
                            const columnNames = columnResult.rows.map(r => r.column_name);
                            const placeholders = columnNames.map((_, i) => `$${i + 1}`).join(', ');
                            
                            // Insert in batches
                            const batchSize = 100;
                            for (let i = 0; i < rows.length; i += batchSize) {
                                const batch = rows.slice(i, i + batchSize);
                                
                                for (const row of batch) {
                                    const values = columnNames.map(col => row[col]);
                                    await localPool.query(
                                        `INSERT INTO ${tableName} (${columnNames.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
                                        values
                                    ).catch(err => {
                                        // Ignore duplicate key errors
                                        if (!err.message.includes('duplicate key') && !err.message.includes('already exists')) {
                                            console.log(`    ⚠ Insert warning: ${err.message.split('\n')[0]}`);
                                        }
                                    });
                                }
                            }
                        }
                    } catch (err) {
                        console.log(`    ⚠ Error importing data: ${err.message.split('\n')[0]}`);
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
