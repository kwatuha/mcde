// routes/dashboardRoutes.js
const express = require('express');
const router = express.Router();
// Removed: const { mapKeysToCamelCase, mapKeysToSnakeCase } = require('../utils/fieldFormatter'); // No longer needed
const pool = require('../config/db'); // Import the database connection pool
const ExcelJS = require('exceljs'); // For Excel export
const puppeteer = require('puppeteer'); // For PDF export
const { getPuppeteerLaunchOptions } = require('../utils/puppeteerLaunch');

/**
 * @file Backend routes for Dashboard data and analytics.
 * @description Provides endpoints for summary statistics, demographic data,
 * disease prevalence, and export functionalities, fetching data from the database.
 */

// --- Helper Functions for Data Simulation (will be replaced by DB queries) ---
// These are placeholders. In a real app, these would be complex SQL queries.

const simulateSummaryData = async (filters) => {
    // Example: Fetch total participants from DB
    // const [rows] = await pool.query('SELECT COUNT(*) as total FROM participants');
    // const totalParticipants = rows[0].total;

    // For now, simulate based on filters
    let totalParticipants = 1000;
    if (filters.county === 'Nairobi') totalParticipants = 500;
    if (filters.gender === 'Female') totalParticipants /= 2;

    return {
        totalParticipants: totalParticipants,
        averageAge: Math.floor(Math.random() * 20) + 25, // Random age between 25-45
        malariaPrevalence: (Math.random() * 10 + 5).toFixed(2), // 5-15%
        denguePrevalence: (Math.random() * 3 + 1).toFixed(2), // 1-4%
    };
};

const simulateDemographicData = async (filters) => {
    // Example: Fetch gender distribution from DB
    // const [genderRows] = await pool.query('SELECT gender, COUNT(*) as count FROM participants GROUP BY gender');
    return {
        genderData: [
            { name: 'Male', value: Math.floor(Math.random() * 100) + 150 },
            { name: 'Female', value: Math.floor(Math.random() * 100) + 150 },
            { name: 'Other', value: Math.floor(Math.random() * 20) + 10 }
        ],
        ageGroupData: [
            { name: '0-10', value: Math.floor(Math.random() * 50) + 50 },
            { name: '11-20', value: Math.floor(Math.random() * 50) + 70 },
            { name: '21-30', value: Math.floor(Math.random() * 50) + 100 },
            { name: '31-40', value: Math.floor(Math.random() * 50) + 90 },
            { name: '41-50', value: Math.floor(Math.random() * 50) + 80 },
            { name: '50+', value: Math.floor(Math.random() * 50) + 60 }
        ],
        educationLevelData: [
            { name: 'None', value: Math.floor(Math.random() * 50) + 20 },
            { name: 'Primary', value: Math.floor(Math.random() * 100) + 80 },
            { name: 'Secondary', value: Math.floor(Math.random() * 100) + 120 },
            { name: 'Tertiary', value: Math.floor(Math.random() * 50) + 60 }
        ],
        occupationData: [
            { name: 'Farmer', value: Math.floor(Math.random() * 100) + 100 },
            { name: 'Trader', value: Math.floor(Math.random() * 50) + 50 },
            { name: 'Student', value: Math.floor(Math.random() * 50) + 70 },
            { name: 'Unemployed', value: Math.floor(Math.random() * 50) + 40 },
            { name: 'Other', value: Math.floor(Math.random() * 50) + 30 }
        ]
    };
};

const simulateDiseasePrevalenceData = async (filters) => {
    return {
        malariaByCounty: [
            { name: 'Nairobi', value: (Math.random() * 5 + 2).toFixed(2) },
            { name: 'Mombasa', value: (Math.random() * 8 + 3).toFixed(2) },
            { name: 'Kisumu', value: (Math.random() * 10 + 5).toFixed(2) }
        ],
        dengueByCounty: [
            { name: 'Nairobi', value: (Math.random() * 2 + 0.5).toFixed(2) },
            { name: 'Mombasa', value: (Math.random() * 3 + 1).toFixed(2) }
        ],
        mosquitoNetUse: [
            { name: 'Always', value: Math.floor(Math.random() * 100) + 200 },
            { name: 'Sometimes', value: Math.floor(Math.random() * 50) + 50 },
            { name: 'Never', value: Math.floor(Math.random() * 30) + 20 }
        ]
    };
};

const simulateHouseholdSizeData = async (filters) => {
    return [
        { name: '1-2', value: Math.floor(Math.random() * 50) + 100 },
        { name: '3-4', value: Math.floor(Math.random() * 80) + 150 },
        { name: '5+', value: Math.floor(Math.random() * 60) + 80 }
    ];
};

const simulateHealthcareAccessData = async (filters) => {
    return [
        { name: 'Good', value: Math.floor(Math.random() * 100) + 200 },
        { name: 'Moderate', value: Math.floor(Math.random() * 50) + 100 },
        { name: 'Poor', value: Math.floor(Math.random() * 30) + 50 }
    ];
};

const simulateWaterStorageData = async (filters) => {
    return [
        { name: 'Covered', value: Math.floor(Math.random() * 100) + 250 },
        { name: 'Uncovered', value: Math.floor(Math.random() * 50) + 70 },
        { name: 'Other', value: Math.floor(Math.random() * 20) + 30 }
    ];
};

const simulateClimatePerceptionData = async (filters) => {
    return [
        { name: 'Improving', value: Math.floor(Math.random() * 50) + 50 },
        { name: 'Stable', value: Math.floor(Math.random() * 100) + 150 },
        { name: 'Worsening', value: Math.floor(Math.random() * 50) + 80 }
    ];
};

const simulateFilterOptions = async () => {
    // In a real application, these would come from distinct queries to your database
    return {
        counties: ['Nairobi', 'Mombasa', 'Kisumu', 'Nakuru'],
        genders: ['Male', 'Female', 'Other'],
        diseases: ['Malaria', 'Dengue', 'Leishmaniasis'],
        educationLevels: ['None', 'Primary', 'Secondary', 'Tertiary'],
        occupations: ['Farmer', 'Trader', 'Student', 'Unemployed', 'Other'],
        housingTypes: ['Mud Hut', 'Brick House', 'Apartment'],
        waterSources: ['Borehole', 'River', 'Tap Water'],
        mosquitoNetUsage: ['Always', 'Sometimes', 'Never']
    };
};

const simulateParticipantsData = async (filters, page, pageSize, sortBy, sortOrder) => {
    // This is a very simplified simulation. In a real app, you'd use SQL LIMIT/OFFSET and ORDER BY
    const allParticipants = [
        { id: 'p1', name: 'John Doe', age: 30, gender: 'Male', county: 'Nairobi', diseaseStatusMalaria: 'Negative' },
        { id: 'p2', name: 'Jane Smith', age: 25, gender: 'Female', county: 'Mombasa', diseaseStatusMalaria: 'Positive' },
        { id: 'p3', name: 'Peter Jones', age: 40, gender: 'Male', county: 'Nairobi', diseaseStatusMalaria: 'Negative' },
        { id: 'p4', name: 'Alice Brown', age: 35, gender: 'Female', county: 'Kisumu', diseaseStatusMalaria: 'Positive' },
        { id: 'p5', name: 'Bob White', age: 28, gender: 'Male', county: 'Nakuru', diseaseStatusMalaria: 'Negative' },
        { id: 'p6', name: 'Charlie Green', age: 45, gender: 'Male', county: 'Mombasa', diseaseStatusMalaria: 'Negative' },
        { id: 'p7', name: 'Diana Prince', age: 22, gender: 'Female', county: 'Nairobi', diseaseStatusMalaria: 'Positive' },
        { id: 'p8', name: 'Eve Adams', age: 50, gender: 'Female', county: 'Kisumu', diseaseStatusMalaria: 'Negative' },
        { id: 'p9', name: 'Frank Black', age: 33, gender: 'Male', county: 'Nakuru', diseaseStatusMalaria: 'Positive' },
        { id: 'p10', name: 'Grace Kelly', age: 29, gender: 'Female', county: 'Nairobi', diseaseStatusMalaria: 'Negative' },
    ];

    let filtered = allParticipants.filter(p => {
        let match = true;
        if (filters.county && p.county !== filters.county) match = false;
        if (filters.gender && p.gender !== filters.gender) match = false;
        // Add more filter logic here
        return match;
    });

    // Simple sort
    if (sortBy) {
        filtered.sort((a, b) => {
            const valA = a[sortBy];
            const valB = b[sortBy];
            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    }

    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const paginated = filtered.slice(start, end);

    return {
        data: paginated,
        totalCount: filtered.length,
        page,
        pageSize,
        totalPages: Math.ceil(filtered.length / pageSize)
    };
};


// --- Dashboard Endpoints ---

/**
 * @route GET /api/dashboard/filters/options
 * @description Get all available filter options for the dashboard.
 */
router.get('/filters/options', async (req, res) => {
    try {
        const options = await simulateFilterOptions(); // Replace with DB query
        res.status(200).json(options);
    } catch (error) {
        console.error('Error fetching filter options:', error);
        res.status(500).json({ message: 'Error fetching filter options', error: error.message });
    }
});

/**
 * @route POST /api/dashboard/summary
 * @description Get summary statistics based on applied filters.
 */
router.post('/summary', async (req, res) => {
    const { filters } = req.body;
    try {
        const summary = await simulateSummaryData(filters); // Replace with DB query
        res.status(200).json(summary);
    } catch (error) {
        console.error('Error fetching summary data:', error);
        res.status(500).json({ message: 'Error fetching summary data', error: error.message });
    }
});

/**
 * @route POST /api/dashboard/demographics
 * @description Get demographic data (gender, age, education, occupation) based on filters.
 */
router.post('/demographics', async (req, res) => {
    const { filters } = req.body;
    try {
        const demographics = await simulateDemographicData(filters); // Replace with DB query
        res.status(200).json(demographics);
    } catch (error) {
        console.error('Error fetching demographic data:', error);
        res.status(500).json({ message: 'Error fetching demographic data', error: error.message });
    }
});

/**
 * @route POST /api/dashboard/disease-prevalence
 * @description Get disease prevalence data (malaria, dengue, mosquito net use) based on filters.
 */
router.post('/disease-prevalence', async (req, res) => {
    const { filters } = req.body;
    try {
        const disease = await simulateDiseasePrevalenceData(filters); // Replace with DB query
        res.status(200).json(disease);
    } catch (error) {
        console.error('Error fetching disease prevalence data:', error);
        res.status(500).json({ message: 'Error fetching disease prevalence data', error: error.message });
    }
});

/**
 * @route POST /api/dashboard/heatmap-data
 * @description Get data for heatmap visualization based on filters.
 */
router.post('/heatmap-data', async (req, res) => {
    const { filters } = req.body;
    try {
        // Simulate heatmap data (e.g., geographical distribution of cases)
        const heatmapData = [
            { lat: 1.2921, lng: 36.8219, count: Math.floor(Math.random() * 50) + 10 }, // Nairobi
            { lat: -4.0437, lng: 39.6682, count: Math.floor(Math.random() * 50) + 10 }, // Mombasa
            { lat: -0.1022, lng: 34.7617, count: Math.floor(Math.random() * 50) + 10 }, // Kisumu
        ];
        res.status(200).json(heatmapData);
    } catch (error) {
        console.error('Error fetching heatmap data:', error);
        res.status(500).json({ message: 'Error fetching heatmap data', error: error.message });
    }
});

/**
 * @route POST /api/dashboard/participants
 * @description Get paginated and filtered participants data for tables.
 */
router.post('/participants', async (req, res) => {
    const { filters, page = 1, pageSize = 10, sortBy, sortOrder } = req.body;
    try {
        const participantsData = await simulateParticipantsData(filters, page, pageSize, sortBy, sortOrder);
        res.status(200).json(participantsData);
    } catch (error) {
        console.error('Error fetching participants data:', error);
        res.status(500).json({ message: 'Error fetching participants data', error: error.message });
    }
});

/**
 * @route POST /api/dashboard/export/excel
 * @description Export filtered data to an Excel file.
 */
router.post('/export/excel', async (req, res) => {
    const { filters, excelHeadersMapping } = req.body;
    try {
        // Fetch data based on filters (e.g., all participants or specific project data)
        const dataToExport = await simulateParticipantsData(filters, 1, 100000); // Fetch all data for export

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Report');

        // Define columns based on mapping
        const columns = Object.keys(excelHeadersMapping).map(key => ({
            header: excelHeadersMapping[key],
            key: key,
            width: 20
        }));
        worksheet.columns = columns;

        // Add rows
        worksheet.addRows(dataToExport.data);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=report.xlsx');

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Error exporting to Excel:', error);
        res.status(500).json({ message: 'Error exporting to Excel', error: error.message });
    }
});

/**
 * @route POST /api/dashboard/export/pdf
 * @description Export filtered data (HTML table) to a PDF file.
 */
router.post('/export/pdf', async (req, res) => {
    const { filters, tableHtml } = req.body; // tableHtml is expected to be the HTML string of the table
    let browser;
    try {
        browser = await puppeteer.launch(getPuppeteerLaunchOptions());
        const page = await browser.newPage();

        // Set content to the provided HTML. You might want to wrap it in a full HTML document.
        await page.setContent(
            `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Report PDF</title>
                <style>
                    body { font-family: sans-serif; margin: 20px; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                    th { background-color: #f2f2f2; }
                </style>
            </head>
            <body>
                <h1>Dashboard Report</h1>
                <p>Generated on: ${new Date().toLocaleDateString()}</p>
                ${tableHtml}
            </body>
            </html>
        `,
            { waitUntil: 'domcontentloaded', timeout: 45000 }
        );

        const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=report.pdf');
        res.send(pdfBuffer);
    } catch (error) {
        console.error('Error exporting to PDF:', error);
        res.status(500).json({ message: 'Error exporting to PDF', error: error.message });
    } finally {
        if (browser) {
            try {
                await browser.close();
            } catch (e) {
                console.warn('dashboard export/pdf: browser.close failed:', e.message);
            }
        }
    }
});


// --- NEW DASHBOARD ENDPOINTS ---

/**
 * @route GET /api/dashboard/:userId
 * @description Get dashboard data for a specific user
 */
router.get('/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Fetch basic dashboard data
        const dashboardData = {
            userId: parseInt(userId),
            notifications: [],
            recentActivity: [],
            metrics: {
                totalProjects: 0,
                activeProjects: 0,
                completedProjects: 0,
                pendingApprovals: 0
            }
        };
        
        res.status(200).json(dashboardData);
    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        res.status(500).json({ message: 'Error fetching dashboard data', error: error.message });
    }
});

/**
 * @route GET /api/dashboard/statistics/:userId
 * @description Get user statistics including project counts and activity
 */
router.get('/statistics/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Query project statistics
        const [projectStats] = await pool.query(`
            SELECT 
                COUNT(*) as totalProjects,
                SUM(CASE WHEN statusId = 2 THEN 1 ELSE 0 END) as activeProjects,
                SUM(CASE WHEN statusId = 3 THEN 1 ELSE 0 END) as completedProjects,
                SUM(CASE WHEN statusId = 1 THEN 1 ELSE 0 END) as pendingProjects
            FROM projects
        `);
        
        // Query user statistics
        const [userStats] = await pool.query(`
            SELECT 
                COUNT(*) as totalUsers,
                SUM(CASE WHEN isActive = 1 THEN 1 ELSE 0 END) as activeUsers,
                SUM(CASE WHEN isActive = 0 THEN 1 ELSE 0 END) as inactiveUsers
            FROM users
        `);
        
        const statistics = {
            projects: projectStats[0] || { totalProjects: 0, activeProjects: 0, completedProjects: 0, pendingProjects: 0 },
            users: userStats[0] || { totalUsers: 0, activeUsers: 0, inactiveUsers: 0 },
            lastUpdated: new Date().toISOString()
        };
        
        res.status(200).json(statistics);
    } catch (error) {
        console.error('Error fetching statistics:', error);
        res.status(500).json({ message: 'Error fetching statistics', error: error.message });
    }
});

/**
 * @route GET /api/dashboard/metrics/:userId
 * @description Get metrics and KPIs for a user
 */
router.get('/metrics/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { role } = req.query;
        
        // Query project metrics
        const [metrics] = await pool.query(`
            SELECT 
                COUNT(*) as totalProjects,
                SUM(CASE WHEN statusId = 2 THEN 1 ELSE 0 END) as activeProjects,
                SUM(CASE WHEN statusId = 3 THEN 1 ELSE 0 END) as completedProjects,
                SUM(budgetAllocated) as totalBudget,
                SUM(budgetUtilized) as utilizedBudget,
                COUNT(DISTINCT projectManagerId) as teamMembers
            FROM projects
        `);
        
        const metricsData = metrics[0] || {};
        metricsData.pendingApprovals = 0; // Placeholder for approvals
        metricsData.budgetUtilization = metricsData.totalBudget > 0 
            ? Math.round((metricsData.utilizedBudget / metricsData.totalBudget) * 100) 
            : 0;
        
        res.status(200).json(metricsData);
    } catch (error) {
        console.error('Error fetching metrics:', error);
        res.status(500).json({ message: 'Error fetching metrics', error: error.message });
    }
});

/**
 * @route GET /api/dashboard/activity/:userId
 * @description Get recent activity for a user
 */
router.get('/activity/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Query recent project updates
        const [activities] = await pool.query(`
            SELECT 
                projectName as action,
                updatedAt as time,
                'project' as type
            FROM projects
            ORDER BY updatedAt DESC
            LIMIT 10
        `);
        
        // Format activities
        const recentActivity = activities.map((activity, index) => ({
            id: index + 1,
            action: `Project "${activity.action}" updated`,
            time: activity.time,
            type: activity.type
        }));
        
        res.status(200).json(recentActivity);
    } catch (error) {
        console.error('Error fetching recent activity:', error);
        res.status(500).json({ message: 'Error fetching recent activity', error: error.message });
    }
});

/**
 * @route GET /api/dashboard/notifications/:userId
 * @description Get notifications for a user
 */
router.get('/notifications/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Return mock notifications for now
        const notifications = [
            { id: 1, type: 'timeline', title: 'New Timeline Notifications', count: 0, priority: 'low', icon: 'schedule' },
            { id: 2, type: 'project', title: 'New Project Updates', count: 1, priority: 'medium', icon: 'assignment' },
            { id: 3, type: 'task', title: "Today's Pending Tasks", count: 0, priority: 'high', icon: 'warning' },
            { id: 4, type: 'message', title: 'New Messages & Chats', count: 0, priority: 'low', icon: 'email' },
        ];
        
        res.status(200).json(notifications);
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ message: 'Error fetching notifications', error: error.message });
    }
});

/**
 * @route POST /api/dashboard/household-size-distribution
 * @description Get household size distribution data based on filters.
 */
router.post('/household-size-distribution', async (req, res) => {
    const { filters } = req.body;
    try {
        const data = await simulateHouseholdSizeData(filters); // Replace with DB query
        res.status(200).json(data);
    } catch (error) {
        console.error('Error fetching household size data:', error);
        res.status(500).json({ message: 'Error fetching household size data', error: error.message });
    }
});

/**
 * @route POST /api/dashboard/healthcare-access-distribution
 * @description Get healthcare access distribution data based on filters.
 */
router.post('/healthcare-access-distribution', async (req, res) => {
    const { filters } = req.body;
    try {
        const data = await simulateHealthcareAccessData(filters); // Replace with DB query
        res.status(200).json(data);
    } catch (error) {
        console.error('Error fetching healthcare access data:', error);
        res.status(500).json({ message: 'Error fetching healthcare access data', error: error.message });
    }
});

/**
 * @route POST /api/dashboard/water-storage-distribution
 * @description Get water storage distribution data based on filters.
 */
router.post('/water-storage-distribution', async (req, res) => {
    const { filters } = req.body;
    try {
        const data = await simulateWaterStorageData(filters); // Replace with DB query
        res.status(200).json(data);
    } catch (error) {
        console.error('Error fetching water storage data:', error);
        res.status(500).json({ message: 'Error fetching water storage data', error: error.message });
    }
});

/**
 * @route POST /api/dashboard/climate-perception-distribution
 * @description Get climate perception distribution data based on filters.
 */
router.post('/climate-perception-distribution', async (req, res) => {
    const { filters } = req.body;
    try {
        const data = await simulateClimatePerceptionData(filters); // Replace with DB query
        res.status(200).json(data);
    } catch (error) {
        console.error('Error fetching climate perception data:', error);
        res.status(500).json({ message: 'Error fetching climate perception data', error: error.message });
    }
});


module.exports = router;
