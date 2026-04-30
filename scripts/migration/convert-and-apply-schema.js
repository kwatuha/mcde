#!/usr/bin/env node
/**
 * Convert and apply MySQL schema to PostgreSQL table by table
 * This handles errors gracefully and processes each table individually
 */

const mysql = require('mysql2/promise');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Database connections
const mysqlConfig = {
    host: process.env.MYSQL_HOST || 'localhost',
    port: Number(process.env.MYSQL_PORT || 3308),
    user: process.env.MYSQL_USER || 'impesUser',
    password: process.env.MYSQL_PASSWORD || process.env.MYSQL_PASS || 'postgres',
    database: process.env.MYSQL_DB || 'gov_imbesdb'
};

const pgConfig = {
    host: process.env.PG_HOST || 'localhost',
    port: Number(process.env.PG_PORT || 5433),
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || process.env.PG_PASS || process.env.DB_PASSWORD || 'postgres',
    database: process.env.PG_DB || 'government_projects'
};

// Get existing PostgreSQL tables
async function getExistingTables(pgPool) {
    const result = await pgPool.query(`
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public'
        ORDER BY tablename
    `);
    return new Set(result.rows.map(r => r.tablename.toLowerCase()));
}

// Get MySQL table structure
async function getTableStructure(mysqlConn, tableName) {
    const [rows] = await mysqlConn.execute(`SHOW CREATE TABLE ??`, [tableName]);
    return rows[0]['Create Table'];
}

// Convert MySQL CREATE TABLE to PostgreSQL
function convertToPostgres(mysqlCreateTable) {
    let sql = mysqlCreateTable;
    
    // Remove MySQL-specific commands
    sql = sql.replace(/\/\*!.*?\*\//g, '');
    sql = sql.replace(/ENGINE=\w+/gi, '');
    sql = sql.replace(/DEFAULT CHARSET=\w+/gi, '');
    sql = sql.replace(/COLLATE=\w+/gi, '');
    sql = sql.replace(/AUTO_INCREMENT=\d+/gi, '');
    
    // Remove backticks
    sql = sql.replace(/`/g, '');
    
    // Convert data types
    sql = sql.replace(/\bTINYINT\(1\)/gi, 'BOOLEAN');
    sql = sql.replace(/\bTINYINT\b/gi, 'SMALLINT');
    sql = sql.replace(/\bSMALLINT\([^)]+\)/gi, 'SMALLINT');
    sql = sql.replace(/\bMEDIUMINT\b/gi, 'INTEGER');
    sql = sql.replace(/\bINT\([^)]+\)/gi, 'INTEGER');
    sql = sql.replace(/\bINT\b/gi, 'INTEGER');
    sql = sql.replace(/\bBIGINT\([^)]+\)/gi, 'BIGINT');
    sql = sql.replace(/\bBIGINT\b/gi, 'BIGINT');
    sql = sql.replace(/\bDECIMAL\(([^,]+),([^)]+)\)/gi, 'NUMERIC($1,$2)');
    sql = sql.replace(/\bDOUBLE\b/gi, 'DOUBLE PRECISION');
    sql = sql.replace(/\bFLOAT\([^)]+\)/gi, 'REAL');
    sql = sql.replace(/\bFLOAT\b/gi, 'REAL');
    sql = sql.replace(/\bDATETIME\b/gi, 'TIMESTAMP');
    sql = sql.replace(/\bTIMESTAMP\b/gi, 'TIMESTAMP');
    sql = sql.replace(/\bYEAR\b/gi, 'INTEGER');
    sql = sql.replace(/\bBLOB\b/gi, 'BYTEA');
    sql = sql.replace(/\bLONGBLOB\b/gi, 'BYTEA');
    sql = sql.replace(/\bLONGTEXT\b/gi, 'TEXT');
    sql = sql.replace(/\bMEDIUMTEXT\b/gi, 'TEXT');
    sql = sql.replace(/\bJSON\b/gi, 'JSONB');
    
    // Convert AUTO_INCREMENT to SERIAL
    sql = sql.replace(/(\w+)\s+INTEGER\s+NOT\s+NULL\s+AUTO_INCREMENT/gi, '$1 SERIAL');
    sql = sql.replace(/(\w+)\s+BIGINT\s+NOT\s+NULL\s+AUTO_INCREMENT/gi, '$1 BIGSERIAL');
    sql = sql.replace(/\s+AUTO_INCREMENT/gi, '');
    
    // Convert ENUM to VARCHAR (simplified)
    sql = sql.replace(/ENUM\(([^)]+)\)/gi, 'VARCHAR(50)');
    
    // Convert DEFAULT values for BOOLEAN
    sql = sql.replace(/BOOLEAN\s+DEFAULT\s+['"]?0['"]?/gi, 'BOOLEAN DEFAULT FALSE');
    sql = sql.replace(/BOOLEAN\s+DEFAULT\s+['"]?1['"]?/gi, 'BOOLEAN DEFAULT TRUE');
    
    // Remove ON UPDATE CURRENT_TIMESTAMP
    sql = sql.replace(/\s+ON\s+UPDATE\s+CURRENT_TIMESTAMP/gi, '');
    
    // Extract table name
    const tableMatch = sql.match(/CREATE\s+TABLE\s+(\w+)/i);
    if (!tableMatch) return null;
    const tableName = tableMatch[1];
    
    // Extract column definitions (between first ( and last ))
    const colStart = sql.indexOf('(');
    const colEnd = sql.lastIndexOf(')');
    if (colStart === -1 || colEnd === -1) return null;
    
    let columns = sql.substring(colStart + 1, colEnd);
    
    // Remove PRIMARY KEY from column definitions (we'll add it separately)
    columns = columns.replace(/,\s*PRIMARY\s+KEY\s*\([^)]+\)/gi, '');
    
    // Remove KEY definitions (we'll create indexes separately)
    columns = columns.replace(/,\s*KEY\s+\w+\s*\([^)]+\)/gi, '');
    columns = columns.replace(/,\s*UNIQUE\s+KEY\s+\w+\s*\([^)]+\)/gi, '');
    
    // Remove FOREIGN KEY constraints (we'll add them later)
    columns = columns.replace(/,\s*CONSTRAINT\s+\w+\s+FOREIGN\s+KEY\s*\([^)]+\)\s+REFERENCES\s+\w+\s*\([^)]+\)[^,]*/gi, '');
    
    // Remove COMMENT clauses
    columns = columns.replace(/\s+COMMENT\s+['"][^'"]*['"]/gi, '');
    
    // Clean up trailing commas
    columns = columns.replace(/,\s*\)/g, ')');
    columns = columns.replace(/,\s*$/gm, '');
    columns = columns.replace(/,\s*,/g, ',');
    
    // Find PRIMARY KEY
    const pkMatch = sql.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i);
    const primaryKey = pkMatch ? pkMatch[1].trim() : null;
    
    // Build PostgreSQL CREATE TABLE
    let pgSql = `CREATE TABLE IF NOT EXISTS ${tableName} (\n`;
    pgSql += columns;
    
    if (primaryKey) {
        // Check if primary key is already in columns (SERIAL/BIGSERIAL)
        const pkCols = primaryKey.split(',').map(c => c.trim());
        const hasSerialPk = pkCols.some(col => {
            const colDef = columns.split(',').find(c => c.trim().startsWith(col));
            return colDef && (colDef.includes('SERIAL') || colDef.includes('BIGSERIAL'));
        });
        
        if (!hasSerialPk) {
            pgSql += `,\n  PRIMARY KEY (${primaryKey})`;
        }
    }
    
    pgSql += '\n);';
    
    // Clean up multiple newlines
    pgSql = pgSql.replace(/\n{3,}/g, '\n\n');
    
    return pgSql;
}

// Main function
async function main() {
    let mysqlConn, pgPool;
    
    try {
        console.log('Connecting to databases...');
        mysqlConn = await mysql.createConnection(mysqlConfig);
        pgPool = new Pool(pgConfig);
        
        // Test connections
        await mysqlConn.query('SELECT 1');
        await pgPool.query('SELECT 1');
        console.log('✓ Connected to both databases\n');
        
        // Get existing PostgreSQL tables
        const existingTables = await getExistingTables(pgPool);
        console.log(`Found ${existingTables.size} existing tables in PostgreSQL\n`);
        
        // Get all MySQL tables
        const [mysqlTables] = await mysqlConn.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'gov_imbesdb'
            ORDER BY table_name
        `);
        
        console.log(`Found ${mysqlTables.length} tables in MySQL\n`);
        
        const results = {
            success: [],
            skipped: [],
            failed: []
        };
        
        // Process each table
        for (const row of mysqlTables) {
            const tableName = (row.table_name || row.TABLE_NAME || Object.values(row)[0]).toLowerCase();
            
            if (existingTables.has(tableName)) {
                console.log(`⏭️  Skipping ${tableName} (already exists)`);
                results.skipped.push(tableName);
                continue;
            }
            
            try {
                console.log(`\n📋 Processing ${tableName}...`);
                
                // Get MySQL CREATE TABLE
                const mysqlCreateTable = await getTableStructure(mysqlConn, row.table_name);
                
                // Convert to PostgreSQL
                const pgCreateTable = convertToPostgres(mysqlCreateTable);
                
                if (!pgCreateTable) {
                    throw new Error('Failed to convert CREATE TABLE statement');
                }
                
                // Debug: check for undefined in SQL
                if (pgCreateTable.includes('undefined')) {
                    console.error('SQL contains undefined!');
                    console.error(pgCreateTable);
                    throw new Error('SQL contains undefined values');
                }
                
                // Apply to PostgreSQL using execSync with psql to avoid parameterization issues
                const { execSync } = require('child_process');
                const sqlFile = `/tmp/create_${tableName}.sql`;
                fs.writeFileSync(sqlFile, pgCreateTable, 'utf8');
                
                try {
                    execSync(`docker exec gov_postgres psql -U postgres -d government_projects -f /dev/stdin < ${sqlFile}`, {
                        stdio: 'pipe'
                    });
                } catch (error) {
                    // If execSync fails, try with pgPool as fallback
                    const client = await pgPool.connect();
                    try {
                        // Use query with explicit text property
                        await client.query({ text: pgCreateTable });
                    } finally {
                        client.release();
                    }
                } finally {
                    // Clean up temp file
                    try { fs.unlinkSync(sqlFile); } catch (e) {}
                }
                
                console.log(`✓ Created ${tableName}`);
                results.success.push(tableName);
                
            } catch (error) {
                console.error(`❌ Failed to create ${tableName}:`, error.message);
                results.failed.push({ table: tableName, error: error.message });
                
                // Save failed table SQL for manual review
                try {
                    const mysqlCreateTable = await getTableStructure(mysqlConn, row.table_name);
                    const failedDir = path.join(__dirname, 'schema', 'failed');
                    if (!fs.existsSync(failedDir)) {
                        fs.mkdirSync(failedDir, { recursive: true });
                    }
                    fs.writeFileSync(
                        path.join(failedDir, `${tableName}.sql`),
                        `-- MySQL CREATE TABLE:\n${mysqlCreateTable}\n\n-- Error: ${error.message}\n`,
                        'utf8'
                    );
                } catch (e) {
                    // Ignore file write errors
                }
            }
        }
        
        // Summary
        console.log('\n' + '='.repeat(60));
        console.log('MIGRATION SUMMARY');
        console.log('='.repeat(60));
        console.log(`✓ Successfully created: ${results.success.length} tables`);
        console.log(`⏭️  Skipped (already exist): ${results.skipped.length} tables`);
        console.log(`❌ Failed: ${results.failed.length} tables`);
        
        if (results.failed.length > 0) {
            console.log('\nFailed tables:');
            results.failed.forEach(f => {
                console.log(`  - ${f.table}: ${f.error}`);
            });
            console.log(`\nFailed table SQLs saved to: ${path.join(__dirname, 'schema', 'failed')}`);
        }
        
        // Final count
        const finalCount = await pgPool.query(`
            SELECT COUNT(*) as count 
            FROM pg_tables 
            WHERE schemaname = 'public'
        `);
        console.log(`\n📊 Total tables in PostgreSQL: ${finalCount.rows[0].count}`);
        
    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    } finally {
        if (mysqlConn) await mysqlConn.end();
        if (pgPool) await pgPool.end();
    }
}

main();
