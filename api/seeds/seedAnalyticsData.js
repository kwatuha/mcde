/**
 * Seed script to generate sample data for Project Analytics
 * This script creates sample projects with various statuses, departments, 
 * financial years, budgets, and progress to demonstrate analytics features
 */

require('dotenv').config();
const pool = require('../config/db');

const DB_TYPE = process.env.DB_TYPE || 'postgresql';

// Sample data configurations
const SAMPLE_DEPARTMENTS = [
    { name: 'Ministry of Health', alias: 'MOH' },
    { name: 'Ministry of Education', alias: 'MOE' },
    { name: 'Ministry of Infrastructure', alias: 'MOI' },
    { name: 'Ministry of Agriculture', alias: 'MOA' },
    { name: 'Ministry of Water', alias: 'MOW' },
    { name: 'Ministry of Energy', alias: 'MOE' },
];

const SAMPLE_STATUSES = [
    'Ongoing',
    'Completed',
    'At Risk',
    'Delayed',
    'Planning',
    'On Hold',
    'Cancelled'
];

const SAMPLE_SECTORS = [
    'Infrastructure',
    'Healthcare',
    'Education',
    'Agriculture',
    'Water & Sanitation',
    'Energy',
    'Transport'
];

const FINANCIAL_YEARS = [
    '2020/2021',
    '2021/2022',
    '2022/2023',
    '2023/2024',
    '2024/2025'
];

// Helper function to get random element from array
const randomElement = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Helper function to get random number in range
const randomRange = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// Helper function to get random date
const randomDate = (start, end) => {
    const startTime = start.getTime();
    const endTime = end.getTime();
    const randomTime = startTime + Math.random() * (endTime - startTime);
    return new Date(randomTime);
};

// Helper function to format date for PostgreSQL
const formatDate = (date) => {
    return date.toISOString().split('T')[0];
};

// Generate sample projects
const generateSampleProjects = async () => {
    console.log('🌱 Starting to seed analytics sample data...\n');

    try {
        // Check if we already have projects
        let existingProjects;
        if (DB_TYPE === 'postgresql') {
            const result = await pool.query('SELECT COUNT(*) as count FROM projects WHERE voided = false');
            existingProjects = parseInt(result.rows[0]?.count || 0);
        } else {
            const [result] = await pool.query('SELECT COUNT(*) as count FROM projects WHERE voided = 0');
            existingProjects = parseInt(result[0]?.count || 0);
        }

        if (existingProjects > 0) {
            console.log(`⚠️  Found ${existingProjects} existing projects. Skipping seed to avoid duplicates.`);
            console.log('   If you want to add sample data, please clear existing projects first.\n');
            return;
        }

        // Get or create financial years
        const financialYearMap = {};
        for (const yearName of FINANCIAL_YEARS) {
            let finYearId;
            if (DB_TYPE === 'postgresql') {
                const result = await pool.query(
                    'SELECT finYearId FROM financialyears WHERE finYearName = $1 AND (voided = false OR voided IS NULL) LIMIT 1',
                    [yearName]
                );
                if (result.rows.length > 0) {
                    finYearId = result.rows[0].finYearId;
                } else {
                    // Create financial year if it doesn't exist
                    const insertResult = await pool.query(
                        'INSERT INTO financialyears (finYearName, voided) VALUES ($1, false) RETURNING finYearId',
                        [yearName]
                    );
                    finYearId = insertResult.rows[0].finYearId;
                }
            } else {
                const [result] = await pool.query(
                    'SELECT finYearId FROM financialyears WHERE finYearName = ? AND (voided = 0 OR voided IS NULL) LIMIT 1',
                    [yearName]
                );
                if (result.length > 0) {
                    finYearId = result[0].finYearId;
                } else {
                    const [insertResult] = await pool.query(
                        'INSERT INTO financialyears (finYearName, voided) VALUES (?, 0)',
                        [yearName]
                    );
                    finYearId = insertResult.insertId || insertResult[0]?.insertId;
                }
            }
            financialYearMap[yearName] = finYearId;
        }

        // Get or create departments
        const departmentMap = {};
        for (const dept of SAMPLE_DEPARTMENTS) {
            let deptId;
            if (DB_TYPE === 'postgresql') {
                const result = await pool.query(
                    'SELECT departmentId FROM departments WHERE name = $1 AND (voided = false OR voided IS NULL) LIMIT 1',
                    [dept.name]
                );
                if (result.rows.length > 0) {
                    deptId = result.rows[0].departmentId;
                } else {
                    const insertResult = await pool.query(
                        'INSERT INTO departments (name, alias, voided) VALUES ($1, $2, false) RETURNING departmentId',
                        [dept.name, dept.alias]
                    );
                    deptId = insertResult.rows[0].departmentId;
                }
            } else {
                const [result] = await pool.query(
                    'SELECT departmentId FROM departments WHERE name = ? AND (voided = 0 OR voided IS NULL) LIMIT 1',
                    [dept.name]
                );
                if (result.length > 0) {
                    deptId = result[0].departmentId;
                } else {
                    const [insertResult] = await pool.query(
                        'INSERT INTO departments (name, alias, voided) VALUES (?, ?, 0)',
                        [dept.name, dept.alias]
                    );
                    deptId = insertResult.insertId || insertResult[0]?.insertId;
                }
            }
            departmentMap[dept.name] = deptId;
        }

        // Generate projects
        const projectsToInsert = [];
        const numProjects = 150; // Generate 150 sample projects

        for (let i = 1; i <= numProjects; i++) {
            const status = randomElement(SAMPLE_STATUSES);
            const department = randomElement(SAMPLE_DEPARTMENTS);
            const sector = randomElement(SAMPLE_SECTORS);
            const financialYear = randomElement(FINANCIAL_YEARS);
            
            // Generate realistic budget (in KES)
            const budget = randomRange(500000, 50000000); // 500K to 50M
            
            // Generate paid amount based on status and progress
            let paidAmount = 0;
            let progress = 0;
            
            if (status === 'Completed') {
                progress = randomRange(95, 100);
                paidAmount = Math.floor(budget * (progress / 100) * randomRange(0.9, 1.0)); // 90-100% of budget
            } else if (status === 'Ongoing') {
                progress = randomRange(20, 80);
                paidAmount = Math.floor(budget * (progress / 100) * randomRange(0.7, 1.0)); // 70-100% of progress
            } else if (status === 'At Risk') {
                progress = randomRange(10, 50);
                paidAmount = Math.floor(budget * randomRange(0.6, 0.9)); // High spending, low progress
            } else if (status === 'Delayed') {
                progress = randomRange(5, 40);
                paidAmount = Math.floor(budget * randomRange(0.4, 0.7)); // Moderate spending, low progress
            } else if (status === 'Planning') {
                progress = randomRange(0, 15);
                paidAmount = Math.floor(budget * randomRange(0.0, 0.2)); // Minimal spending
            } else {
                progress = randomRange(0, 30);
                paidAmount = Math.floor(budget * randomRange(0.0, 0.5));
            }

            // Generate dates
            const startDate = randomDate(new Date(2020, 0, 1), new Date(2024, 11, 31));
            const endDate = new Date(startDate);
            endDate.setMonth(endDate.getMonth() + randomRange(6, 36)); // 6 to 36 months duration

            const projectName = `${sector} Project ${i} - ${department.name}`;
            const projectDescription = `Sample ${sector.toLowerCase()} project in ${department.name} for demonstration of analytics features.`;

            if (DB_TYPE === 'postgresql') {
                // PostgreSQL structure
                projectsToInsert.push({
                    name: projectName,
                    description: projectDescription,
                    ministry: department.name,
                    state_department: `${department.name} - ${sector} Division`,
                    sector: sector,
                    category_id: null, // Can be set if categories table exists
                    implementing_agency: department.name,
                    timeline: {
                        start_date: formatDate(startDate),
                        expected_completion_date: formatDate(endDate),
                        financial_year: financialYear
                    },
                    budget: {
                        allocated_amount_kes: budget,
                        disbursed_amount_kes: paidAmount,
                        source: 'Government',
                        contracted: status !== 'Planning'
                    },
                    progress: {
                        status: status,
                        percentage_complete: progress,
                        status_reason: `Sample project in ${status.toLowerCase()} status`,
                        latest_update_summary: `Project is ${progress}% complete`
                    },
                    notes: {
                        objective: `Improve ${sector.toLowerCase()} services`,
                        expected_output: `Enhanced ${sector.toLowerCase()} infrastructure`,
                        expected_outcome: `Better service delivery in ${sector.toLowerCase()} sector`
                    },
                    location: {
                        county: 'Nairobi',
                        constituency: 'Sample Constituency',
                        ward: 'Sample Ward',
                        geocoordinates: {
                            lat: -1.2921 + (Math.random() - 0.5) * 0.1,
                            lng: 36.8219 + (Math.random() - 0.5) * 0.1
                        }
                    },
                    data_sources: {
                        project_ref_num: `PRJ-${String(i).padStart(4, '0')}`
                    },
                    is_public: {
                        approved: Math.random() > 0.5,
                        approved_by: null,
                        approved_at: null,
                        approval_notes: null,
                        revision_requested: false,
                        revision_notes: null,
                        revision_requested_by: null,
                        revision_requested_at: null,
                        revision_submitted_at: null
                    },
                    public_engagement: {
                        feedback_enabled: Math.random() > 0.7
                    },
                    voided: false,
                    created_at: new Date(),
                    updated_at: new Date()
                });
            } else {
                // MySQL structure
                projectsToInsert.push({
                    projectName: projectName,
                    projectDescription: projectDescription,
                    directorate: department.name,
                    departmentId: departmentMap[department.name],
                    finYearId: financialYearMap[financialYear],
                    status: status,
                    costOfProject: budget,
                    paidOut: paidAmount,
                    overallProgress: progress,
                    startDate: formatDate(startDate),
                    endDate: formatDate(endDate),
                    objective: `Improve ${sector.toLowerCase()} services`,
                    expectedOutput: `Enhanced ${sector.toLowerCase()} infrastructure`,
                    expectedOutcome: `Better service delivery in ${sector.toLowerCase()} sector`,
                    statusReason: `Sample project in ${status.toLowerCase()} status`,
                    ProjectRefNum: `PRJ-${String(i).padStart(4, '0')}`,
                    Contracted: status !== 'Planning' ? 1 : 0,
                    voided: 0,
                    createdAt: new Date(),
                    updatedAt: new Date()
                });
            }
        }

        // Insert projects in batches
        console.log(`📊 Generating ${numProjects} sample projects...`);
        const batchSize = 50;
        
        for (let i = 0; i < projectsToInsert.length; i += batchSize) {
            const batch = projectsToInsert.slice(i, i + batchSize);
            
            if (DB_TYPE === 'postgresql') {
                // PostgreSQL batch insert - JSONB fields are passed as objects, pg handles conversion
                for (const project of batch) {
                    const columns = Object.keys(project).join(', ');
                    const placeholders = Object.keys(project).map((_, idx) => `$${idx + 1}`).join(', ');
                    const values = Object.values(project);
                    
                    await pool.query(
                        `INSERT INTO projects (${columns}) VALUES (${placeholders})`,
                        values
                    );
                }
            } else {
                // MySQL batch insert
                const columns = Object.keys(batch[0]).join(', ');
                const placeholders = batch.map(() => 
                    '(' + Object.keys(batch[0]).map(() => '?').join(', ') + ')'
                ).join(', ');
                const values = batch.flatMap(p => Object.values(p));
                
                await pool.query(
                    `INSERT INTO projects (${columns}) VALUES ${placeholders}`,
                    values
                );
            }
            
            console.log(`   ✓ Inserted batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(projectsToInsert.length / batchSize)}`);
        }

        console.log(`\n✅ Successfully seeded ${numProjects} sample projects!`);
        console.log('\n📈 Sample data includes:');
        console.log('   - Multiple project statuses (Ongoing, Completed, At Risk, Delayed, etc.)');
        console.log('   - Various departments and sectors');
        console.log('   - Different financial years');
        console.log('   - Realistic budgets and disbursements');
        console.log('   - Progress percentages aligned with statuses');
        console.log('\n🎯 You can now view the Project Analytics page to see the data in action!\n');

    } catch (error) {
        console.error('❌ Error seeding analytics data:', error);
        throw error;
    }
};

// Run the seed script
if (require.main === module) {
    generateSampleProjects()
        .then(() => {
            console.log('✨ Seed script completed successfully!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('💥 Seed script failed:', error);
            process.exit(1);
        });
}

module.exports = { generateSampleProjects };
