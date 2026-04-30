// Migrate roles from MySQL to PostgreSQL
const mysql = require('mysql2/promise');
const { Pool } = require('pg');

const mysqlConfig = {
    host: process.env.MYSQL_HOST || 'localhost',
    port: Number(process.env.MYSQL_PORT || 3308),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || process.env.MYSQL_ROOT_PASSWORD || 'postgres',
    database: process.env.MYSQL_DB || 'gov_imbesdb'
};

const pgConfig = {
    host: process.env.PG_HOST || 'localhost',
    port: Number(process.env.PG_PORT || 5433),
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || process.env.PG_PASS || process.env.DB_PASSWORD || 'postgres',
    database: process.env.PG_DB || 'government_projects'
};

async function migrateRoles() {
    let mysqlConn, pgPool;
    
    try {
        console.log('Connecting to MySQL...');
        mysqlConn = await mysql.createConnection(mysqlConfig);
        
        console.log('Connecting to PostgreSQL...');
        pgPool = new Pool(pgConfig);
        
        // Fetch roles from MySQL
        console.log('Fetching roles from MySQL...');
        const [mysqlRoles] = await mysqlConn.execute(
            'SELECT roleId, roleName, description, createdAt, updatedAt FROM roles'
        );
        
        console.log(`Found ${mysqlRoles.length} roles in MySQL`);
        
        // Insert into PostgreSQL
        let inserted = 0;
        let skipped = 0;
        
        for (const role of mysqlRoles) {
            try {
                // Check if role already exists
                const checkResult = await pgPool.query(
                    'SELECT roleid FROM roles WHERE roleid = $1',
                    [role.roleId]
                );
                
                if (checkResult.rows.length > 0) {
                    console.log(`  ⏭️  Role ${role.roleId} (${role.roleName}) already exists, skipping`);
                    skipped++;
                    continue;
                }
                
                // Insert role
                await pgPool.query(
                    `INSERT INTO roles (roleid, name, description, createdat, updatedat, voided)
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [
                        role.roleId,
                        role.roleName,
                        role.description || null,
                        role.createdAt || null,
                        role.updatedAt || null,
                        false  // Default voided to false
                    ]
                );
                
                console.log(`  ✅ Migrated role ${role.roleId}: ${role.roleName}`);
                inserted++;
            } catch (error) {
                console.error(`  ❌ Error migrating role ${role.roleId}:`, error.message);
            }
        }
        
        console.log(`\n✅ Migration complete!`);
        console.log(`   Inserted: ${inserted}`);
        console.log(`   Skipped: ${skipped}`);
        
        // Verify
        const verifyResult = await pgPool.query('SELECT COUNT(*) as count FROM roles');
        console.log(`\n📊 Total roles in PostgreSQL: ${verifyResult.rows[0].count}`);
        
    } catch (error) {
        console.error('Migration error:', error);
        process.exit(1);
    } finally {
        if (mysqlConn) await mysqlConn.end();
        if (pgPool) await pgPool.end();
    }
}

migrateRoles();
