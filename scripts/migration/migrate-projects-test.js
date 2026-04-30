/**
 * Migrate a few test projects from MySQL to PostgreSQL
 * Ignores foreign key references - just migrates basic project data
 */

const mysql = require('mysql2/promise');
const { Pool } = require('pg');

// MySQL connection
const mysqlConfig = {
    host: process.env.MYSQL_HOST || 'localhost',
    port: Number(process.env.MYSQL_PORT || 3308),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || process.env.MYSQL_ROOT_PASSWORD || 'postgres',
    database: process.env.MYSQL_DB || 'gov_imbesdb'
};

// PostgreSQL connection
const pgConfig = {
    host: process.env.PG_HOST || 'localhost',
    port: Number(process.env.PG_PORT || 5433),
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || process.env.PG_PASS || process.env.DB_PASSWORD || 'postgres',
    database: process.env.PG_DB || 'government_projects'
};

async function migrateProjects() {
    let mysqlConn, pgPool;
    
    try {
        // Connect to MySQL
        console.log('Connecting to MySQL...');
        mysqlConn = await mysql.createConnection(mysqlConfig);
        
        // Connect to PostgreSQL
        console.log('Connecting to PostgreSQL...');
        pgPool = new Pool(pgConfig);
        await pgPool.query('SELECT 1'); // Test connection
        
        // Fetch a few projects from MySQL (limit 5 for testing)
        // Only select columns that actually exist in MySQL
        console.log('Fetching projects from MySQL...');
        const [mysqlProjects] = await mysqlConn.execute(`
            SELECT 
                id,
                projectName,
                projectDescription,
                directorate,
                startDate,
                endDate,
                costOfProject,
                paidOut,
                objective,
                expectedOutput,
                principalInvestigator,
                expectedOutcome,
                status,
                statusReason,
                createdAt,
                updatedAt,
                voided,
                principalInvestigatorStaffId,
                departmentId,
                sectionId,
                finYearId,
                programId,
                subProgramId,
                categoryId,
                userId,
                approved_for_public,
                approved_by,
                approved_at,
                approval_notes,
                revision_requested,
                revision_notes,
                revision_requested_by,
                revision_requested_at,
                revision_submitted_at,
                overallProgress
            FROM projects
            WHERE voided = 0
            LIMIT 5
        `);
        
        console.log(`Found ${mysqlProjects.length} projects to migrate`);
        
        if (mysqlProjects.length === 0) {
            console.log('No projects found to migrate');
            return;
        }
        
        // Migrate each project
        let migrated = 0;
        let skipped = 0;
        
        for (const project of mysqlProjects) {
            try {
                // Check if project already exists
                const checkResult = await pgPool.query(
                    'SELECT id FROM projects WHERE id = $1',
                    [project.id]
                );
                
                if (checkResult.rows.length > 0) {
                    console.log(`  Project ${project.id} already exists, skipping...`);
                    skipped++;
                    continue;
                }
                
                // Insert into PostgreSQL
                // Convert MySQL boolean (0/1) to PostgreSQL boolean
                const voided = project.voided === 1 || project.voided === true;
                const approved_for_public = project.approved_for_public === 1 || project.approved_for_public === true;
                const revision_requested = project.revision_requested === 1 || project.revision_requested === true;
                
                await pgPool.query(`
                    INSERT INTO projects (
                        id,
                        projectname,
                        projectdescription,
                        directorate,
                        startdate,
                        enddate,
                        costofproject,
                        paidout,
                        objective,
                        expectedoutput,
                        principalinvestigator,
                        expectedoutcome,
                        status,
                        statusreason,
                        projectrefnum,
                        contracted,
                        createdat,
                        updatedat,
                        voided,
                        principalinvestigatorstaffid,
                        departmentid,
                        sectionid,
                        finyearid,
                        programid,
                        subprogramid,
                        categoryid,
                        userid,
                        approved_for_public,
                        approved_by,
                        approved_at,
                        approval_notes,
                        revision_requested,
                        revision_notes,
                        revision_requested_by,
                        revision_requested_at,
                        revision_submitted_at,
                        overallprogress,
                        budgetid
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
                        $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
                        $31, $32, $33, $34, $35, $36, $37, $38
                    )
                `, [
                    project.id,
                    project.projectName || null,
                    project.projectDescription || null,
                    project.directorate || null,
                    project.startDate || null,
                    project.endDate || null,
                    project.costOfProject || null,
                    project.paidOut || null,
                    project.objective || null,
                    project.expectedOutput || null,
                    project.principalInvestigator || null,
                    project.expectedOutcome || null,
                    project.status || null,
                    project.statusReason || null,
                    null, // projectrefnum (not in MySQL)
                    null, // contracted (not in MySQL)
                    project.createdAt || new Date(),
                    project.updatedAt || new Date(),
                    voided,
                    project.principalInvestigatorStaffId || null,
                    project.departmentId || null,
                    project.sectionId || null,
                    project.finYearId || null,
                    project.programId || null,
                    project.subProgramId || null,
                    project.categoryId || null,
                    project.userId || null,
                    approved_for_public,
                    project.approved_by || null,
                    project.approved_at || null,
                    project.approval_notes || null,
                    revision_requested,
                    project.revision_notes || null,
                    project.revision_requested_by || null,
                    project.revision_requested_at || null,
                    project.revision_submitted_at || null,
                    project.overallProgress || 0,
                    project.budgetId || null
                ]);
                
                console.log(`  ✓ Migrated project ${project.id}: ${project.projectName?.substring(0, 50) || 'N/A'}...`);
                migrated++;
                
            } catch (err) {
                console.error(`  ✗ Error migrating project ${project.id}:`, err.message);
            }
        }
        
        console.log(`\n✅ Migration complete!`);
        console.log(`   Migrated: ${migrated}`);
        console.log(`   Skipped: ${skipped}`);
        
    } catch (error) {
        console.error('Migration error:', error);
        throw error;
    } finally {
        if (mysqlConn) await mysqlConn.end();
        if (pgPool) await pgPool.end();
    }
}

// Run migration
migrateProjects()
    .then(() => {
        console.log('Done!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Migration failed:', error);
        process.exit(1);
    });
