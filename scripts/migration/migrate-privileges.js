#!/usr/bin/env node
/**
 * Migrate privileges and role_privileges from MySQL to PostgreSQL
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

async function migratePrivileges() {
    let mysqlConn, pgPool;
    
    try {
        console.log('Connecting to databases...');
        mysqlConn = await mysql.createConnection(mysqlConfig);
        pgPool = new Pool(pgConfig);
        
        // Step 1: Migrate privileges
        console.log('\nStep 1: Migrating privileges...');
        const [privileges] = await mysqlConn.query(`
            SELECT 
                privilegeId,
                privilegeName,
                description,
                createdAt,
                updatedAt
            FROM privileges
            ORDER BY privilegeId
        `);
        
        console.log(`Found ${privileges.length} privileges in MySQL`);
        
        let privSuccess = 0;
        let privSkipped = 0;
        
        for (const priv of privileges) {
            try {
                const existing = await pgPool.query(
                    'SELECT privilegeid FROM privileges WHERE privilegeid = $1',
                    [priv.privilegeId]
                );
                
                if (existing.rows.length > 0) {
                    privSkipped++;
                    continue;
                }
                
                await pgPool.query(`
                    INSERT INTO privileges (
                        privilegeid, privilegename, description, createdat, updatedat, voided
                    ) VALUES ($1, $2, $3, $4, $5, false)
                `, [
                    priv.privilegeId,
                    priv.privilegeName,
                    priv.description || null,
                    priv.createdAt || null,
                    priv.updatedAt || null
                ]);
                
                privSuccess++;
            } catch (error) {
                console.error(`❌ Failed to migrate privilege ${priv.privilegeName}:`, error.message);
            }
        }
        
        console.log(`✓ Migrated ${privSuccess} privileges, skipped ${privSkipped}`);
        
        // Step 2: Migrate role_privileges
        console.log('\nStep 2: Migrating role_privileges...');
        const [rolePrivileges] = await mysqlConn.query(`
            SELECT 
                roleId,
                privilegeId,
                createdAt
            FROM role_privileges
            ORDER BY roleId, privilegeId
        `);
        
        console.log(`Found ${rolePrivileges.length} role_privileges in MySQL`);
        
        let rpSuccess = 0;
        let rpSkipped = 0;
        
        for (const rp of rolePrivileges) {
            try {
                const existing = await pgPool.query(
                    'SELECT roleid, privilegeid FROM role_privileges WHERE roleid = $1 AND privilegeid = $2',
                    [rp.roleId, rp.privilegeId]
                );
                
                if (existing.rows.length > 0) {
                    rpSkipped++;
                    continue;
                }
                
                await pgPool.query(`
                    INSERT INTO role_privileges (
                        roleid, privilegeid, createdat, voided
                    ) VALUES ($1, $2, $3, false)
                `, [
                    rp.roleId,
                    rp.privilegeId,
                    rp.createdAt || null
                ]);
                
                rpSuccess++;
            } catch (error) {
                console.error(`❌ Failed to migrate role_privilege ${rp.rolePrivilegeId}:`, error.message);
            }
        }
        
        console.log(`✓ Migrated ${rpSuccess} role_privileges, skipped ${rpSkipped}`);
        
        // Step 3: Verify role 1 has project.read_all
        console.log('\nStep 3: Verifying privileges for role 1...');
        const role1Privs = await pgPool.query(`
            SELECT p.privilegename
            FROM role_privileges rp
            JOIN privileges p ON rp.privilegeid = p.privilegeid
            WHERE rp.roleid = 1 AND (rp.voided = false OR rp.voided IS NULL) AND (p.voided = false OR p.voided IS NULL)
            ORDER BY p.privilegename
        `);
        
        console.log(`\nRole 1 has ${role1Privs.rows.length} privileges:`);
        const projectPrivs = role1Privs.rows.filter(p => p.privilegename && p.privilegename.includes('project'));
        console.log(`  - Project-related: ${projectPrivs.length}`);
        if (projectPrivs.length > 0) {
            console.log(`  - Sample: ${projectPrivs.slice(0, 5).map(p => p.privilegename).join(', ')}`);
        }
        
        const hasReadAll = role1Privs.rows.some(p => p.privilegename === 'project.read_all');
        if (hasReadAll) {
            console.log('\n✅ Role 1 has "project.read_all" privilege!');
        } else {
            console.log('\n⚠️  Role 1 does NOT have "project.read_all" privilege');
            console.log('   Checking if it exists in MySQL...');
            
            const [mysqlPriv] = await mysqlConn.query(
                'SELECT privilegeId FROM privileges WHERE privilegeName = ?',
                ['project.read_all']
            );
            
            if (mysqlPriv.length > 0) {
                console.log(`   Found in MySQL (ID: ${mysqlPriv[0].privilegeId}), checking role_privileges...`);
                const [mysqlRP] = await mysqlConn.query(
                    'SELECT * FROM role_privileges WHERE roleId = 1 AND privilegeId = ? AND (voided = 0 OR voided IS NULL)',
                    [mysqlPriv[0].privilegeId]
                );
                if (mysqlRP.length > 0) {
                    console.log('   Exists in MySQL role_privileges, may need to re-run migration');
                } else {
                    console.log('   Not assigned to role 1 in MySQL');
                }
            } else {
                console.log('   Does not exist in MySQL');
            }
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('MIGRATION SUMMARY');
        console.log('='.repeat(60));
        console.log(`✓ Privileges migrated: ${privSuccess}`);
        console.log(`✓ Role_privileges migrated: ${rpSuccess}`);
        console.log(`⏭️  Privileges skipped: ${privSkipped}`);
        console.log(`⏭️  Role_privileges skipped: ${rpSkipped}`);
        
    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    } finally {
        if (mysqlConn) await mysqlConn.end();
        if (pgPool) await pgPool.end();
    }
}

migratePrivileges();
