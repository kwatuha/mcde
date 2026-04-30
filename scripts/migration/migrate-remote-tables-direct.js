/**
 * Direct migration: Query remote database to get table structures and data, then create locally
 */

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

async function getCreateTableSQL(pool, tableName) {
    // Get column definitions
    const columnsQuery = `
        SELECT 
            column_name,
            data_type,
            is_nullable,
            column_default,
            character_maximum_length,
            numeric_precision,
            numeric_scale,
            udt_name
        FROM information_schema.columns
        WHERE table_name = $1
        ORDER BY ordinal_position;
    `;
    
    const columnsResult = await pool.query(columnsQuery, [tableName]);
    const columns = columnsResult.rows;
    
    // Get primary key
    const pkQuery = `
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = $1 AND tc.constraint_type = 'PRIMARY KEY'
        ORDER BY kcu.ordinal_position;
    `;
    
    const pkResult = await pool.query(pkQuery, [tableName]);
    const pkColumns = pkResult.rows.map(r => r.column_name);
    
    // Build CREATE TABLE statement
    let sql = `CREATE TABLE IF NOT EXISTS ${tableName} (\n`;
    
    const columnDefs = columns.map(col => {
        let def = `    "${col.column_name}" `;
        
        // Map data types
        let dataType = col.data_type;
        if (col.udt_name === 'varchar' || col.udt_name === 'char') {
            dataType = `${col.udt_name}(${col.character_maximum_length})`;
        } else if (col.udt_name === 'numeric' || col.udt_name === 'decimal') {
            if (col.numeric_precision && col.numeric_scale) {
                dataType = `${col.udt_name}(${col.numeric_precision},${col.numeric_scale})`;
            } else if (col.numeric_precision) {
                dataType = `${col.udt_name}(${col.numeric_precision})`;
            }
        } else if (col.udt_name === 'int4') {
            dataType = 'integer';
        } else if (col.udt_name === 'int8') {
            dataType = 'bigint';
        } else if (col.udt_name === 'bool') {
            dataType = 'boolean';
        } else if (col.udt_name === 'timestamp') {
            dataType = 'timestamp without time zone';
        } else if (col.udt_name === 'timestamptz') {
            dataType = 'timestamp with time zone';
        } else if (col.udt_name === 'jsonb') {
            dataType = 'jsonb';
        } else if (col.udt_name === 'text') {
            dataType = 'text';
        } else {
            dataType = col.udt_name;
        }
        
        def += dataType;
        
        if (col.is_nullable === 'NO') {
            def += ' NOT NULL';
        }
        
        // Handle defaults - skip sequences, handle functions
        if (col.column_default) {
            if (col.column_default.includes('nextval')) {
                // This is a SERIAL column, the sequence will be created automatically
                // Don't add DEFAULT here
            } else if (col.column_default.includes('CURRENT_TIMESTAMP') || col.column_default.includes('now()')) {
                def += ' DEFAULT CURRENT_TIMESTAMP';
            } else if (col.column_default === 'false' || col.column_default === 'true') {
                def += ` DEFAULT ${col.column_default}`;
            } else if (!isNaN(col.column_default)) {
                def += ` DEFAULT ${col.column_default}`;
            } else {
                // For other defaults, try to use them
                const cleanDefault = col.column_default.replace(/::\w+/g, '');
                def += ` DEFAULT ${cleanDefault}`;
            }
        }
        
        return def;
    });
    
    sql += columnDefs.join(',\n');
    
    // Add primary key
    if (pkColumns.length > 0) {
        sql += `,\n    PRIMARY KEY (${pkColumns.map(c => `"${c}"`).join(', ')})`;
    }
    
    sql += '\n);';
    
    return sql;
}

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
                
                // Generate CREATE TABLE statement
                console.log(`  → Generating CREATE TABLE statement...`);
                const createTableSQL = await getCreateTableSQL(remotePool, tableName);
                
                // Drop table if exists in local
                console.log(`  → Dropping existing table if exists...`);
                await localPool.query(`DROP TABLE IF EXISTS ${tableName} CASCADE;`).catch(() => {});
                
                // Create table
                console.log(`  → Creating table in local database...`);
                await localPool.query(createTableSQL);
                
                // Add foreign key constraints
                const fkQuery2 = `
                    SELECT
                        tc.constraint_name,
                        kcu.column_name,
                        ccu.table_name AS foreign_table_name,
                        ccu.column_name AS foreign_column_name,
                        rc.delete_rule
                    FROM information_schema.table_constraints tc
                    JOIN information_schema.key_column_usage kcu
                        ON tc.constraint_name = kcu.constraint_name
                    JOIN information_schema.constraint_column_usage ccu
                        ON tc.constraint_name = ccu.constraint_name
                    JOIN information_schema.referential_constraints rc
                        ON tc.constraint_name = rc.constraint_name
                    WHERE tc.table_name = $1 AND tc.constraint_type = 'FOREIGN KEY';
                `;
                
                const fkResult2 = await remotePool.query(fkQuery2, [tableName]);
                
                for (const fk of fkResult2.rows) {
                    // Check if referenced table exists
                    const refTableExists = await localPool.query(
                        `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)`,
                        [fk.foreign_table_name]
                    );
                    
                    if (refTableExists.rows[0].exists) {
                        const deleteRule = fk.delete_rule === 'CASCADE' ? 'ON DELETE CASCADE' : 
                                         fk.delete_rule === 'RESTRICT' ? 'ON DELETE RESTRICT' : '';
                        
                        const fkSQL = `
                            ALTER TABLE ${tableName}
                            ADD CONSTRAINT ${fk.constraint_name}
                            FOREIGN KEY ("${fk.column_name}")
                            REFERENCES ${fk.foreign_table_name}("${fk.foreign_column_name}")
                            ${deleteRule};
                        `;
                        
                        await localPool.query(fkSQL).catch(err => {
                            if (!err.message.includes('already exists')) {
                                console.log(`    ⚠ Could not add FK: ${err.message.split('\n')[0]}`);
                            }
                        });
                    }
                }
                
                // Migrate data
                if (remoteCount > 0) {
                    console.log(`  → Migrating ${remoteCount} rows...`);
                    
                    // Get all data from remote
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
                        let inserted = 0;
                        
                        for (let i = 0; i < rows.length; i += batchSize) {
                            const batch = rows.slice(i, i + batchSize);
                            
                            for (const row of batch) {
                                const values = columnNames.map(col => row[col]);
                                try {
                                    await localPool.query(
                                        `INSERT INTO ${tableName} (${columnNames.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
                                        values
                                    );
                                    inserted++;
                                } catch (err) {
                                    // Ignore duplicate key errors
                                    if (!err.message.includes('duplicate key') && !err.message.includes('already exists')) {
                                        console.log(`    ⚠ Insert warning for row ${i}: ${err.message.split('\n')[0]}`);
                                    }
                                }
                            }
                            
                            if ((i + batchSize) % 500 === 0) {
                                console.log(`    ... imported ${Math.min(i + batchSize, rows.length)}/${rows.length} rows`);
                            }
                        }
                        
                        console.log(`    ✓ Inserted ${inserted} rows`);
                    }
                }
                
                // Verify row count
                const localCountResult = await localPool.query(`SELECT COUNT(*) as count FROM ${tableName}`);
                const localCount = parseInt(localCountResult.rows[0].count);
                
                console.log(`  ✓ Migration complete: ${remoteCount} remote rows → ${localCount} local rows\n`);
                
            } catch (error) {
                console.error(`  ✗ Error processing ${tableName}:`, error.message);
                if (error.message.includes('syntax error')) {
                    console.log(`    SQL that failed: ${error.query ? error.query.substring(0, 200) : 'N/A'}`);
                }
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
