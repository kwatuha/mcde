#!/usr/bin/env node
/**
 * Migrate users from MySQL to PostgreSQL
 */

const mysql = require('mysql2/promise');
const { Pool } = require('pg');

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

async function migrateUsers() {
    let mysqlConn, pgPool;
    
    try {
        console.log('Connecting to databases...');
        mysqlConn = await mysql.createConnection(mysqlConfig);
        pgPool = new Pool(pgConfig);
        
        // Get all users from MySQL
        console.log('Fetching users from MySQL...');
        const [users] = await mysqlConn.query(`
            SELECT 
                userId,
                username,
                passwordHash,
                email,
                firstName,
                lastName,
                roleId,
                isActive,
                voided,
                createdAt,
                updatedAt
            FROM users
            ORDER BY userId
        `);
        
        console.log(`Found ${users.length} users in MySQL\n`);
        
        let success = 0;
        let skipped = 0;
        let failed = 0;
        
        // Migrate each user
        for (const user of users) {
            try {
                // Check if user already exists
                const existing = await pgPool.query(
                    'SELECT userid FROM users WHERE userid = $1 OR username = $2',
                    [user.userId, user.username]
                );
                
                if (existing.rows.length > 0) {
                    console.log(`⏭️  Skipping ${user.username} (already exists)`);
                    skipped++;
                    continue;
                }
                
                // Insert user into PostgreSQL
                await pgPool.query(`
                    INSERT INTO users (
                        userid, username, passwordhash, email, 
                        firstname, lastname, roleid, isactive, 
                        voided, createdat, updatedat
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                `, [
                    user.userId,
                    user.username,
                    user.passwordHash,
                    user.email || null,
                    user.firstName || null,
                    user.lastName || null,
                    user.roleId || null,
                    user.isActive !== null ? (user.isActive === 1 || user.isActive === true) : null,
                    user.voided === 1 || user.voided === true ? true : false,
                    user.createdAt || null,
                    user.updatedAt || null
                ]);
                
                console.log(`✓ Migrated user: ${user.username} (ID: ${user.userId})`);
                success++;
                
            } catch (error) {
                console.error(`❌ Failed to migrate ${user.username}:`, error.message);
                failed++;
            }
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('MIGRATION SUMMARY');
        console.log('='.repeat(60));
        console.log(`✓ Successfully migrated: ${success} users`);
        console.log(`⏭️  Skipped (already exist): ${skipped} users`);
        console.log(`❌ Failed: ${failed} users`);
        
        // Verify akwatuha user
        const akwatuha = await pgPool.query(
            'SELECT userid, username, email, roleid, voided, isactive FROM users WHERE username = $1',
            ['akwatuha']
        );
        
        if (akwatuha.rows.length > 0) {
            console.log('\n✅ User "akwatuha" is now in PostgreSQL:');
            console.log(akwatuha.rows[0]);
        } else {
            console.log('\n⚠️  User "akwatuha" was not migrated');
        }
        
    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    } finally {
        if (mysqlConn) await mysqlConn.end();
        if (pgPool) await pgPool.end();
    }
}

migrateUsers();
