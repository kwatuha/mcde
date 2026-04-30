#!/usr/bin/env node

/**
 * Migration script to migrate programs and subprograms from MySQL to PostgreSQL
 * 
 * Usage:
 *   node scripts/migrate_programs_subprograms.js
 * 
 * Environment variables:
 *   MYSQL_HOST - MySQL host (default: localhost)
 *   MYSQL_PORT - MySQL port (default: 3308)
 *   MYSQL_USER - MySQL user (default: impesUser)
 *   MYSQL_PASS - MySQL password (default: from MYSQL_PASSWORD or postgres for local dev)
 *   MYSQL_DB - MySQL database (default: gov_imbesdb)
 *   PG_HOST - PostgreSQL host (default: localhost)
 *   PG_PORT - PostgreSQL port (default: 5432)
 *   PG_USER - PostgreSQL user (default: postgres)
 *   PG_PASS - PostgreSQL password (default: postgres)
 *   PG_DB - PostgreSQL database (default: government_projects)
 */

// Load dependencies - try multiple paths
const path = require('path');
const fs = require('fs');

let mysql, Pool;

// Try to resolve from api/node_modules
const apiNodeModules = path.join(__dirname, '../api/node_modules');
if (fs.existsSync(apiNodeModules)) {
    try {
        mysql = require(path.join(apiNodeModules, 'mysql2/promise'));
        Pool = require(path.join(apiNodeModules, 'pg')).Pool;
    } catch (e) {
        // Fall through to global require
    }
}

// Fallback to global require
if (!mysql || !Pool) {
    try {
        mysql = require('mysql2/promise');
        Pool = require('pg').Pool;
    } catch (e) {
        console.error('Error: mysql2 and pg packages are required.');
        console.error('Please install them:');
        console.error('  cd api && npm install');
        process.exit(1);
    }
}

// Configuration
const config = {
    mysql: {
        host: process.env.MYSQL_HOST || 'localhost',
        port: parseInt(process.env.MYSQL_PORT || '3308', 10),
        user: process.env.MYSQL_USER || 'impesUser',
        password: process.env.MYSQL_PASS || process.env.MYSQL_PASSWORD || 'postgres',
        database: process.env.MYSQL_DB || 'gov_imbesdb',
    },
    postgres: {
        host: process.env.PG_HOST || 'localhost',
        port: parseInt(process.env.PG_PORT || '5432'),
        user: process.env.PG_USER || 'postgres',
        password: process.env.PG_PASS || process.env.PG_PASSWORD || process.env.DB_PASSWORD || 'postgres',
        database: process.env.PG_DB || 'government_projects',
    }
};

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    blue: '\x1b[34m',
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

async function connectDatabases() {
    log('Connecting to MySQL...', 'blue');
    const mysqlConn = await mysql.createConnection(config.mysql);
    log('✓ Connected to MySQL', 'green');

    log('Connecting to PostgreSQL...', 'blue');
    const pgPool = new Pool(config.postgres);
    await pgPool.query('SELECT NOW()');
    log('✓ Connected to PostgreSQL', 'green');

    return { mysqlConn, pgPool };
}

async function getTableStructure(connection, dbType, tableName) {
    if (dbType === 'mysql') {
        const [rows] = await connection.query(`DESCRIBE ${tableName}`);
        return rows;
    } else {
        const result = await connection.query(`
            SELECT 
                column_name,
                data_type,
                is_nullable,
                column_default
            FROM information_schema.columns
            WHERE table_name = $1
            ORDER BY ordinal_position
        `, [tableName]);
        return result.rows;
    }
}

async function migratePrograms(mysqlConn, pgPool) {
    log('\n=== Migrating Programs ===', 'blue');

    // Get programs from MySQL
    log('Fetching programs from MySQL...', 'yellow');
    const [programs] = await mysqlConn.query(`
        SELECT 
            programId,
            programme,
            remarks,
            userId,
            createdAt,
            updatedAt,
            voided,
            voidedBy,
            cidpid,
            departmentId,
            sectionId,
            needsPriorities,
            strategies,
            objectives,
            outcomes
        FROM programs
        WHERE voided = 0
        ORDER BY programId
    `);

    log(`Found ${programs.length} programs to migrate`, 'green');

    if (programs.length === 0) {
        log('No programs to migrate', 'yellow');
        return { migrated: 0, skipped: 0, errors: 0 };
    }

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    // Check PostgreSQL table structure
    const pgStructure = await getTableStructure(pgPool, 'postgres', 'programs');
    const pgColumns = pgStructure.map(col => col.column_name);

    for (const program of programs) {
        try {
            // Check if program already exists
            const existing = await pgPool.query(
                'SELECT "programId" FROM programs WHERE "programId" = $1',
                [program.programId]
            );

            if (existing.rows.length > 0) {
                log(`  Skipping program ${program.programId}: ${program.programme} (already exists)`, 'yellow');
                skipped++;
                continue;
            }

            // Build INSERT query based on available columns
            const columns = [];
            const values = [];
            const placeholders = [];
            let paramIndex = 1;

            // Map MySQL columns to PostgreSQL columns
            const columnMap = {
                programId: 'programId',
                programme: 'programme',
                remarks: 'remarks',
                userId: 'userId',
                createdAt: 'createdAt',
                updatedAt: 'updatedAt',
                voided: 'voided',
                voidedBy: 'voidedBy',
                cidpid: 'cidpid',
                departmentId: 'departmentId',
                sectionId: 'sectionId',
                needsPriorities: 'needsPriorities',
                strategies: 'strategies',
                objectives: 'objectives',
                outcomes: 'outcomes',
            };

            for (const [mysqlCol, pgCol] of Object.entries(columnMap)) {
                if (pgColumns.includes(pgCol) && program[mysqlCol] !== undefined) {
                    columns.push(`"${pgCol}"`);
                    values.push(program[mysqlCol]);
                    placeholders.push(`$${paramIndex++}`);
                }
            }

            if (columns.length === 0) {
                log(`  Error: No matching columns for program ${program.programId}`, 'red');
                errors++;
                continue;
            }

            const insertQuery = `
                INSERT INTO programs (${columns.join(', ')})
                VALUES (${placeholders.join(', ')})
            `;

            await pgPool.query(insertQuery, values);
            log(`  ✓ Migrated program ${program.programId}: ${program.programme}`, 'green');
            migrated++;

        } catch (error) {
            log(`  ✗ Error migrating program ${program.programId}: ${error.message}`, 'red');
            errors++;
        }
    }

    return { migrated, skipped, errors };
}

async function migrateSubprograms(mysqlConn, pgPool) {
    log('\n=== Migrating Subprograms ===', 'blue');

    // Get subprograms from MySQL
    log('Fetching subprograms from MySQL...', 'yellow');
    const [subprograms] = await mysqlConn.query(`
        SELECT 
            subProgramId,
            programId,
            subProgramme,
            keyOutcome,
            kpi,
            baseline,
            yr1Targets,
            yr2Targets,
            yr3Targets,
            yr4Targets,
            yr5Targets,
            yr1Budget,
            yr2Budget,
            yr3Budget,
            yr4Budget,
            yr5Budget,
            totalBudget,
            remarks,
            userId,
            createdAt,
            updatedAt,
            voided,
            voidedBy
        FROM subprograms
        WHERE voided = 0
        ORDER BY subProgramId
    `);

    log(`Found ${subprograms.length} subprograms to migrate`, 'green');

    if (subprograms.length === 0) {
        log('No subprograms to migrate', 'yellow');
        return { migrated: 0, skipped: 0, errors: 0 };
    }

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    // Check PostgreSQL table structure
    const pgStructure = await getTableStructure(pgPool, 'postgres', 'subprograms');
    const pgColumns = pgStructure.map(col => col.column_name);

    for (const subprogram of subprograms) {
        try {
            // Check if subprogram already exists
            const existing = await pgPool.query(
                'SELECT "subProgramId" FROM subprograms WHERE "subProgramId" = $1',
                [subprogram.subProgramId]
            );

            if (existing.rows.length > 0) {
                log(`  Skipping subprogram ${subprogram.subProgramId}: ${subprogram.subProgramme} (already exists)`, 'yellow');
                skipped++;
                continue;
            }

            // Verify program exists in PostgreSQL
            const programExists = await pgPool.query(
                'SELECT "programId" FROM programs WHERE "programId" = $1',
                [subprogram.programId]
            );

            if (programExists.rows.length === 0) {
                log(`  Warning: Program ${subprogram.programId} not found in PostgreSQL for subprogram ${subprogram.subProgramId}`, 'yellow');
                // Continue anyway - foreign key might be optional
            }

            // Build INSERT query based on available columns
            const columns = [];
            const values = [];
            const placeholders = [];
            let paramIndex = 1;

            // Map MySQL columns to PostgreSQL columns
            const columnMap = {
                subProgramId: 'subProgramId',
                programId: 'programId',
                subProgramme: 'subProgramme',
                keyOutcome: 'keyOutcome',
                kpi: 'kpi',
                baseline: 'baseline',
                yr1Targets: 'yr1Targets',
                yr2Targets: 'yr2Targets',
                yr3Targets: 'yr3Targets',
                yr4Targets: 'yr4Targets',
                yr5Targets: 'yr5Targets',
                yr1Budget: 'yr1Budget',
                yr2Budget: 'yr2Budget',
                yr3Budget: 'yr3Budget',
                yr4Budget: 'yr4Budget',
                yr5Budget: 'yr5Budget',
                totalBudget: 'totalBudget',
                remarks: 'remarks',
                userId: 'userId',
                createdAt: 'createdAt',
                updatedAt: 'updatedAt',
                voided: 'voided',
                voidedBy: 'voidedBy',
            };

            for (const [mysqlCol, pgCol] of Object.entries(columnMap)) {
                if (pgColumns.includes(pgCol) && subprogram[mysqlCol] !== undefined) {
                    columns.push(`"${pgCol}"`);
                    values.push(subprogram[mysqlCol]);
                    placeholders.push(`$${paramIndex++}`);
                }
            }

            if (columns.length === 0) {
                log(`  Error: No matching columns for subprogram ${subprogram.subProgramId}`, 'red');
                errors++;
                continue;
            }

            const insertQuery = `
                INSERT INTO subprograms (${columns.join(', ')})
                VALUES (${placeholders.join(', ')})
            `;

            await pgPool.query(insertQuery, values);
            log(`  ✓ Migrated subprogram ${subprogram.subProgramId}: ${subprogram.subProgramme}`, 'green');
            migrated++;

        } catch (error) {
            log(`  ✗ Error migrating subprogram ${subprogram.subProgramId}: ${error.message}`, 'red');
            errors++;
        }
    }

    return { migrated, skipped, errors };
}

async function main() {
    log('=== Programs and Subprograms Migration ===\n', 'blue');

    let mysqlConn, pgPool;

    try {
        // Connect to databases
        const connections = await connectDatabases();
        mysqlConn = connections.mysqlConn;
        pgPool = connections.pgPool;

        // Migrate programs
        const programsResult = await migratePrograms(mysqlConn, pgPool);

        // Migrate subprograms
        const subprogramsResult = await migrateSubprograms(mysqlConn, pgPool);

        // Summary
        log('\n=== Migration Summary ===', 'blue');
        log(`Programs:`, 'yellow');
        log(`  Migrated: ${programsResult.migrated}`, 'green');
        log(`  Skipped: ${programsResult.skipped}`, 'yellow');
        log(`  Errors: ${programsResult.errors}`, programsResult.errors > 0 ? 'red' : 'green');
        
        log(`\nSubprograms:`, 'yellow');
        log(`  Migrated: ${subprogramsResult.migrated}`, 'green');
        log(`  Skipped: ${subprogramsResult.skipped}`, 'yellow');
        log(`  Errors: ${subprogramsResult.errors}`, subprogramsResult.errors > 0 ? 'red' : 'green');

        // Verify final counts
        const [pgProgramsCount] = await pgPool.query('SELECT COUNT(*) as count FROM programs WHERE voided = false');
        const [pgSubprogramsCount] = await pgPool.query('SELECT COUNT(*) as count FROM subprograms WHERE voided = false');

        log(`\nFinal PostgreSQL counts:`, 'blue');
        log(`  Programs: ${pgProgramsCount.rows[0].count}`, 'green');
        log(`  Subprograms: ${pgSubprogramsCount.rows[0].count}`, 'green');

    } catch (error) {
        log(`\n✗ Fatal error: ${error.message}`, 'red');
        console.error(error);
        process.exit(1);
    } finally {
        if (mysqlConn) {
            await mysqlConn.end();
        }
        if (pgPool) {
            await pgPool.end();
        }
    }
}

// Run migration
main().catch(error => {
    log(`\n✗ Unhandled error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
});
