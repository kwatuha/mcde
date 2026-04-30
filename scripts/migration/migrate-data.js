#!/usr/bin/env node
/**
 * Migrate data from MySQL to PostgreSQL
 * Handles data type conversions and transformations
 */

const mysql = require('mysql2/promise');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Configuration
const mysqlConfig = {
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3308'),
    user: process.env.MYSQL_USER || 'impesUser',
    password: process.env.MYSQL_PASSWORD || process.env.MYSQL_PASS || 'postgres',
    database: process.env.MYSQL_DATABASE || 'gov_imbesdb',
};

const pgConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5433'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'government_projects',
    max: 10, // Connection pool size
};

const logFile = path.join(__dirname, 'data/migration-log.txt');

function log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);
    fs.appendFileSync(logFile, logMessage + '\n');
}

async function getTableList(mysqlConn) {
    const [rows] = await mysqlConn.execute('SHOW TABLES');
    return rows.map(row => Object.values(row)[0]);
}

async function getTableColumns(mysqlConn, tableName) {
    const [rows] = await mysqlConn.execute(`DESCRIBE ${tableName}`);
    return rows;
}

async function migrateTable(mysqlConn, pgPool, tableName) {
    log(`Migrating table: ${tableName}`);
    
    try {
        // Get table structure
        const columns = await getTableColumns(mysqlConn, tableName);
        const columnNames = columns.map(col => col.Field).join(', ');
        
        // Get row count
        const [countRows] = await mysqlConn.execute(`SELECT COUNT(*) as count FROM ${tableName}`);
        const rowCount = countRows[0].count;
        
        if (rowCount === 0) {
            log(`  Table ${tableName} is empty, skipping data migration`);
            return { table: tableName, rows: 0, errors: 0 };
        }
        
        log(`  Found ${rowCount} rows to migrate`);
        
        // Check if table exists in PostgreSQL
        const tableExists = await pgPool.query(
            `SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = $1
            )`,
            [tableName]
        );
        
        if (!tableExists.rows[0].exists) {
            log(`  ⚠ Table ${tableName} does not exist in PostgreSQL, skipping`);
            return { table: tableName, rows: 0, errors: 0, skipped: true };
        }
        
        // Fetch data in batches
        const batchSize = 1000;
        let offset = 0;
        let totalInserted = 0;
        let errors = 0;
        
        while (offset < rowCount) {
            const [rows] = await mysqlConn.execute(
                `SELECT * FROM ${tableName} LIMIT ${batchSize} OFFSET ${offset}`
            );
            
            if (rows.length === 0) break;
            
            // Convert data for PostgreSQL
            const convertedRows = rows.map(row => {
                const converted = {};
                for (const [key, value] of Object.entries(row)) {
                    // Handle NULL
                    if (value === null) {
                        converted[key] = null;
                    }
                    // Handle boolean (TINYINT(1))
                    else if (typeof value === 'number' && (value === 0 || value === 1)) {
                        const col = columns.find(c => c.Field === key);
                        if (col && col.Type.includes('tinyint(1)')) {
                            converted[key] = value === 1;
                        } else {
                            converted[key] = value;
                        }
                    }
                    // Handle dates
                    else if (value instanceof Date) {
                        converted[key] = value;
                    }
                    // Handle JSON
                    else if (typeof value === 'object' && value !== null) {
                        converted[key] = JSON.stringify(value);
                    }
                    else {
                        converted[key] = value;
                    }
                }
                return converted;
            });
            
            // Insert into PostgreSQL
            for (const row of convertedRows) {
                try {
                    const keys = Object.keys(row);
                    const values = Object.values(row);
                    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
                    
                    await pgPool.query(
                        `INSERT INTO ${tableName} (${keys.join(', ')}) VALUES (${placeholders}) 
                         ON CONFLICT DO NOTHING`,
                        values
                    );
                    totalInserted++;
                } catch (error) {
                    errors++;
                    log(`  ✗ Error inserting row into ${tableName}: ${error.message}`);
                }
            }
            
            offset += batchSize;
            log(`  Progress: ${Math.min(offset, rowCount)}/${rowCount} rows processed`);
        }
        
        log(`  ✓ Migrated ${totalInserted} rows from ${tableName} (${errors} errors)`);
        return { table: tableName, rows: totalInserted, errors };
        
    } catch (error) {
        log(`  ✗ Error migrating table ${tableName}: ${error.message}`);
        return { table: tableName, rows: 0, errors: 1, error: error.message };
    }
}

async function main() {
    log('Starting data migration from MySQL to PostgreSQL...');
    log(`MySQL: ${mysqlConfig.host}:${mysqlConfig.port}/${mysqlConfig.database}`);
    log(`PostgreSQL: ${pgConfig.host}:${pgConfig.port}/${pgConfig.database}`);
    
    let mysqlConn;
    let pgPool;
    
    try {
        // Connect to MySQL
        log('Connecting to MySQL...');
        mysqlConn = await mysql.createConnection(mysqlConfig);
        log('✓ Connected to MySQL');
        
        // Connect to PostgreSQL
        log('Connecting to PostgreSQL...');
        pgPool = new Pool(pgConfig);
        await pgPool.query('SELECT 1');
        log('✓ Connected to PostgreSQL');
        
        // Get list of tables
        log('Getting table list...');
        const tables = await getTableList(mysqlConn);
        log(`Found ${tables.length} tables to migrate`);
        
        // Migrate each table
        const results = [];
        for (const table of tables) {
            const result = await migrateTable(mysqlConn, pgPool, table);
            results.push(result);
        }
        
        // Summary
        log('\n=== Migration Summary ===');
        const totalRows = results.reduce((sum, r) => sum + r.rows, 0);
        const totalErrors = results.reduce((sum, r) => sum + r.errors, 0);
        const skipped = results.filter(r => r.skipped).length;
        
        log(`Total tables processed: ${results.length}`);
        log(`Total rows migrated: ${totalRows}`);
        log(`Total errors: ${totalErrors}`);
        log(`Skipped tables: ${skipped}`);
        
        if (totalErrors > 0) {
            log('\n⚠ Some errors occurred during migration. Please review the log.');
        } else {
            log('\n✓ Migration completed successfully!');
        }
        
    } catch (error) {
        log(`✗ Fatal error: ${error.message}`);
        console.error(error);
        process.exit(1);
    } finally {
        if (mysqlConn) await mysqlConn.end();
        if (pgPool) await pgPool.end();
    }
}

// Run migration
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { migrateTable, main };
