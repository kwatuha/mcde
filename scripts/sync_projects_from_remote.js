#!/usr/bin/env node

/**
 * Script to sync projects from remote PostgreSQL database to local database
 * 
 * Usage: node scripts/sync_projects_from_remote.js
 * 
 * This script:
 * 1. Connects to remote database (REMOTE_PG_HOST / REMOTE_PG_PASSWORD from env)
 * 2. Fetches all projects and their referenced data
 * 3. Updates local projects if project_id matches, or inserts if new
 */

const path = require('path');
const fs = require('fs');

// Add api/node_modules to module path
const apiNodeModules = path.join(__dirname, '..', 'api', 'node_modules');
if (fs.existsSync(apiNodeModules)) {
    // Prepend api/node_modules to module search path
    const Module = require('module');
    const originalRequire = Module.prototype.require;
    Module.prototype.require = function(id) {
        if (id === 'pg' || id === 'dotenv') {
            const apiPath = path.join(apiNodeModules, id);
            if (fs.existsSync(apiPath)) {
                return originalRequire.call(this, apiPath);
            }
        }
        return originalRequire.call(this, id);
    };
}

// Try to load dotenv
try {
    require('dotenv').config({ path: path.join(__dirname, '..', 'api', '.env') });
} catch (e) {
    // dotenv not found, continue without it
}

const { Pool } = require('pg');

// Remote database configuration
const REMOTE_CONFIG = {
    host: process.env.REMOTE_PG_HOST || 'localhost',
    user: process.env.REMOTE_PG_USER || 'postgres',
    password: process.env.REMOTE_PG_PASSWORD || process.env.DB_PASSWORD || 'postgres',
    database: process.env.REMOTE_PG_DATABASE || 'government_projects',
    port: Number(process.env.REMOTE_PG_PORT || 5432),
    ssl: false // Set to true if SSL is required
};

// Local database configuration (PostgreSQL - override .env MySQL settings)
// Use localhost:5433 for direct connection to docker-exposed PostgreSQL port
const LOCAL_CONFIG = {
    host: process.env.LOCAL_PG_HOST || 'localhost',
    user: process.env.LOCAL_PG_USER || 'postgres',
    password: process.env.LOCAL_PG_PASSWORD || process.env.DB_PASSWORD || 'postgres',
    database: process.env.LOCAL_PG_DATABASE || 'government_projects',
    port: Number(process.env.LOCAL_PG_PORT || 5433), // Docker exposed port
    ssl: false
};

let remotePool;
let localPool;

// Initialize database connections
async function initConnections() {
    console.log('Connecting to remote database...');
    remotePool = new Pool(REMOTE_CONFIG);
    
    try {
        await remotePool.query('SELECT NOW()');
        console.log('✓ Connected to remote database');
    } catch (err) {
        console.error('✗ Failed to connect to remote database:', err.message);
        throw err;
    }
    
    console.log('Connecting to local database...');
    console.log(`  Host: ${LOCAL_CONFIG.host}, Port: ${LOCAL_CONFIG.port}, Database: ${LOCAL_CONFIG.database}`);
    localPool = new Pool(LOCAL_CONFIG);
    
    try {
        await localPool.query('SELECT NOW()');
        console.log('✓ Connected to local database');
    } catch (err) {
        console.error('✗ Failed to connect to local database:', err.message);
        console.error('  Connection config:', LOCAL_CONFIG);
        throw err;
    }
}

// Check if a table exists in remote database
async function tableExists(tableName) {
    try {
        const query = `
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = $1
            )
        `;
        const result = await remotePool.query(query, [tableName]);
        return result.rows[0].exists;
    } catch (err) {
        return false;
    }
}

// Fetch all projects from remote database with their referenced data
async function fetchRemoteProjects() {
    console.log('\nFetching projects from remote database...');
    
    // Check which referenced tables exist
    const programsExists = await tableExists('programs');
    const subprogramsExists = await tableExists('subprograms');
    const categoriesExists = await tableExists('categories');
    
    console.log(`  Tables check: programs=${programsExists}, subprograms=${subprogramsExists}, categories=${categoriesExists}`);
    
    // Build query with conditional joins
    const programJoin = programsExists 
        ? `LEFT JOIN programs pr ON (p.notes->>'program_id')::integer = pr."programId" AND (pr.voided IS NULL OR pr.voided = false)`
        : '';
    const subprogramJoin = subprogramsExists
        ? `LEFT JOIN subprograms spr ON (p.notes->>'subprogram_id')::integer = spr."subProgramId" AND (spr.voided IS NULL OR spr.voided = false)`
        : '';
    const categoryJoin = categoriesExists
        ? `LEFT JOIN categories cat ON p.category_id = cat."categoryId" AND (cat.voided IS NULL OR cat.voided = false)`
        : '';
    
    const programSelect = programsExists ? 'pr."programId" AS program_id, pr."programme" AS program_name,' : 'NULL AS program_id, NULL AS program_name,';
    const subprogramSelect = subprogramsExists ? 'spr."subProgramId" AS subprogram_id, spr."subProgramme" AS subprogram_name,' : 'NULL AS subprogram_id, NULL AS subprogram_name,';
    const categorySelect = categoriesExists ? 'cat."categoryId" AS category_id_ref, cat."categoryName" AS category_name' : 'NULL AS category_id_ref, NULL AS category_name';
    
    // Check if voided column exists
    const voidedExists = await remotePool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'projects' AND column_name = 'voided'
    `).then(r => r.rows.length > 0).catch(() => false);
    
    const voidedCondition = voidedExists ? 'WHERE p.voided IS NULL OR p.voided = false' : '';
    const voidedSelect = voidedExists ? 'p.voided,' : 'false AS voided,';
    const categoryIdSelect = await remotePool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'projects' AND column_name = 'category_id'
    `).then(r => r.rows.length > 0 ? 'p.category_id,' : 'NULL AS category_id,').catch(() => 'NULL AS category_id,');
    
    const query = `
        SELECT 
            p.project_id,
            p.name,
            p.description,
            p.implementing_agency,
            p.sector,
            p.ministry,
            p.state_department,
            ${categoryIdSelect}
            p.timeline,
            p.budget,
            p.progress,
            p.notes,
            p.data_sources,
            p.public_engagement,
            p.location,
            p.created_at,
            p.updated_at,
            ${voidedSelect}
            -- Referenced data
            ${programSelect}
            ${subprogramSelect}
            ${categorySelect}
        FROM projects p
        ${programJoin}
        ${subprogramJoin}
        ${categoryJoin}
        ${voidedCondition}
        ORDER BY p.project_id
    `;
    
    const result = await remotePool.query(query);
    console.log(`✓ Fetched ${result.rows.length} projects from remote`);
    
    return result.rows;
}

// Check if project exists locally
async function projectExistsLocally(projectId) {
    const query = `SELECT project_id FROM projects WHERE project_id = $1`;
    const result = await localPool.query(query, [projectId]);
    return result.rows.length > 0;
}

// Update local project with remote data
async function updateLocalProject(project) {
    const query = `
        UPDATE projects SET
            name = $1,
            description = $2,
            implementing_agency = $3,
            sector = $4,
            ministry = $5,
            state_department = $6,
            category_id = $7,
            timeline = $8::jsonb,
            budget = $9::jsonb,
            progress = $10::jsonb,
            notes = $11::jsonb,
            data_sources = $12::jsonb,
            public_engagement = $13::jsonb,
            location = $14::jsonb,
            updated_at = CURRENT_TIMESTAMP
        WHERE project_id = $15
    `;
    
    await localPool.query(query, [
        project.name,
        project.description,
        project.implementing_agency,
        project.sector,
        project.ministry,
        project.state_department,
        project.category_id,
        JSON.stringify(project.timeline || {}),
        JSON.stringify(project.budget || {}),
        JSON.stringify(project.progress || {}),
        JSON.stringify(project.notes || {}),
        JSON.stringify(project.data_sources || {}),
        JSON.stringify(project.public_engagement || {}),
        JSON.stringify(project.location || {}),
        project.project_id
    ]);
}

// Insert new project into local database
async function insertLocalProject(project) {
    const query = `
        INSERT INTO projects (
            project_id,
            name,
            description,
            implementing_agency,
            sector,
            ministry,
            state_department,
            category_id,
            timeline,
            budget,
            progress,
            notes,
            data_sources,
            public_engagement,
            location,
            created_at,
            updated_at,
            voided
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb, $15::jsonb, $16, $17, $18)
    `;
    
    await localPool.query(query, [
        project.project_id,
        project.name,
        project.description,
        project.implementing_agency,
        project.sector,
        project.ministry,
        project.state_department,
        project.category_id,
        JSON.stringify(project.timeline || {}),
        JSON.stringify(project.budget || {}),
        JSON.stringify(project.progress || {}),
        JSON.stringify(project.notes || {}),
        JSON.stringify(project.data_sources || {}),
        JSON.stringify(project.public_engagement || {}),
        JSON.stringify(project.location || {}),
        project.created_at || new Date(),
        project.updated_at || new Date(),
        project.voided || false
    ]);
}

// Sync referenced tables (programs, subprograms, categories)
async function syncReferencedTables(projects) {
    console.log('\nSyncing referenced tables...');
    
    const programs = new Map();
    const subprograms = new Map();
    const categories = new Map();
    
    // Collect unique referenced data
    projects.forEach(project => {
        if (project.program_id && project.program_name) {
            programs.set(project.program_id, {
                programId: project.program_id,
                programme: project.program_name
            });
        }
        if (project.subprogram_id && project.subprogram_name) {
            subprograms.set(project.subprogram_id, {
                subProgramId: project.subprogram_id,
                subProgramme: project.subprogram_name,
                programId: project.program_id
            });
        }
        if (project.category_id_ref && project.category_name) {
            categories.set(project.category_id_ref, {
                categoryId: project.category_id_ref,
                categoryName: project.category_name
            });
        }
    });
    
    // Sync programs
    if (programs.size > 0) {
        console.log(`  Syncing ${programs.size} programs...`);
        for (const [id, program] of programs) {
            try {
                const exists = await localPool.query('SELECT "programId" FROM programs WHERE "programId" = $1', [id]);
                if (exists.rows.length > 0) {
                    await localPool.query(
                        'UPDATE programs SET "programme" = $1 WHERE "programId" = $2',
                        [program.programme, id]
                    );
                } else {
                    await localPool.query(
                        'INSERT INTO programs ("programId", "programme", voided) VALUES ($1, $2, false)',
                        [id, program.programme]
                    );
                }
            } catch (err) {
                console.warn(`  Warning: Could not sync program ${id}:`, err.message);
            }
        }
        console.log(`  ✓ Synced ${programs.size} programs`);
    }
    
    // Sync subprograms
    if (subprograms.size > 0) {
        console.log(`  Syncing ${subprograms.size} subprograms...`);
        for (const [id, subprogram] of subprograms) {
            try {
                const exists = await localPool.query('SELECT "subProgramId" FROM subprograms WHERE "subProgramId" = $1', [id]);
                if (exists.rows.length > 0) {
                    await localPool.query(
                        'UPDATE subprograms SET "subProgramme" = $1, "programId" = $2 WHERE "subProgramId" = $3',
                        [subprogram.subProgramme, subprogram.programId, id]
                    );
                } else {
                    await localPool.query(
                        'INSERT INTO subprograms ("subProgramId", "subProgramme", "programId", voided) VALUES ($1, $2, $3, false)',
                        [id, subprogram.subProgramme, subprogram.programId]
                    );
                }
            } catch (err) {
                console.warn(`  Warning: Could not sync subprogram ${id}:`, err.message);
            }
        }
        console.log(`  ✓ Synced ${subprograms.size} subprograms`);
    }
    
    // Sync categories
    if (categories.size > 0) {
        console.log(`  Syncing ${categories.size} categories...`);
        for (const [id, category] of categories) {
            try {
                const exists = await localPool.query('SELECT "categoryId" FROM categories WHERE "categoryId" = $1', [id]);
                if (exists.rows.length > 0) {
                    await localPool.query(
                        'UPDATE categories SET "categoryName" = $1 WHERE "categoryId" = $2',
                        [category.categoryName, id]
                    );
                } else {
                    await localPool.query(
                        'INSERT INTO categories ("categoryId", "categoryName", voided) VALUES ($1, $2, false)',
                        [id, category.categoryName]
                    );
                }
            } catch (err) {
                console.warn(`  Warning: Could not sync category ${id}:`, err.message);
            }
        }
        console.log(`  ✓ Synced ${categories.size} categories`);
    }
}

// Main sync function
async function syncProjects() {
    try {
        await initConnections();
        
        const remoteProjects = await fetchRemoteProjects();
        
        if (remoteProjects.length === 0) {
            console.log('\nNo projects found in remote database.');
            return;
        }
        
        // Sync referenced tables first
        await syncReferencedTables(remoteProjects);
        
        // Sync projects
        console.log('\nSyncing projects...');
        let updated = 0;
        let inserted = 0;
        let errors = 0;
        
        await localPool.query('BEGIN');
        
        try {
            for (const project of remoteProjects) {
                try {
                    const exists = await projectExistsLocally(project.project_id);
                    
                    if (exists) {
                        await updateLocalProject(project);
                        updated++;
                        if (updated % 10 === 0) {
                            console.log(`  Processed ${updated + inserted} projects...`);
                        }
                    } else {
                        await insertLocalProject(project);
                        inserted++;
                        if (inserted % 10 === 0) {
                            console.log(`  Processed ${updated + inserted} projects...`);
                        }
                    }
                } catch (err) {
                    console.error(`  Error processing project ${project.project_id} (${project.name}):`, err.message);
                    errors++;
                }
            }
            
            await localPool.query('COMMIT');
            
            console.log('\n✓ Sync completed!');
            console.log(`  Updated: ${updated} projects`);
            console.log(`  Inserted: ${inserted} projects`);
            console.log(`  Errors: ${errors} projects`);
            console.log(`  Total: ${remoteProjects.length} projects`);
            
        } catch (err) {
            await localPool.query('ROLLBACK');
            throw err;
        }
        
    } catch (err) {
        console.error('\n✗ Sync failed:', err);
        process.exit(1);
    } finally {
        if (remotePool) await remotePool.end();
        if (localPool) await localPool.end();
    }
}

// Run the sync
if (require.main === module) {
    syncProjects()
        .then(() => {
            console.log('\nDone!');
            process.exit(0);
        })
        .catch(err => {
            console.error('\nFatal error:', err);
            process.exit(1);
        });
}

module.exports = { syncProjects };
