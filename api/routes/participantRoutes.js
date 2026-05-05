// routes/participantRoutes.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db'); // Import the database connection pool
const ExcelJS = require('exceljs'); // For Excel export
const puppeteer = require('puppeteer'); // For PDF export
const { getPuppeteerLaunchOptions } = require('../utils/puppeteerLaunch');

// --- CRUD Operations for Study Participants (studyparticipants) ---

/**
 * @route POST /api/participants/study_participants/filtered
 * @description Get filtered study participants from the studyparticipants table.
 * For this test data, it fetches all rows (up to a large limit).
 * @access Private
 */
router.post('/study_participants/filtered', async (req, res) => {
    // For this simplified version, we'll ignore page, pageSize, offset
    // and just apply filters and sorting.
    const { filters, orderBy = 'individualId', order = 'ASC' } = req.body;

    // Base query parts
    let whereClause = 'WHERE 1=1'; // Start with a true condition for easy AND concatenation
    const filterParameters = []; // This array will hold parameters specifically for filters

    // Apply filters
    if (filters) {
        if (filters.county) {
            whereClause += ' AND county = ?';
            filterParameters.push(filters.county);
        }
        if (filters.subCounty) {
            whereClause += ' AND subCounty = ?';
            filterParameters.push(filters.subCounty);
        }
        if (filters.gender) {
            whereClause += ' AND gender = ?';
            filterParameters.push(filters.gender);
        }
        if (filters.ageGroup) {
            const ageParts = String(filters.ageGroup).split('-'); // Ensure it's a string before split
            if (ageParts.length === 2) {
                const minAge = parseInt(ageParts[0]);
                const maxAge = parseInt(ageParts[1]);
                if (!isNaN(minAge) && !isNaN(maxAge)) {
                    whereClause += ' AND age BETWEEN ? AND ?';
                    filterParameters.push(minAge, maxAge);
                }
            } else if (String(filters.ageGroup).includes('+')) { // Handle "50+" case
                const minAge = parseInt(String(filters.ageGroup).replace('+', ''));
                if (!isNaN(minAge)) {
                    whereClause += ' AND age >= ?';
                    filterParameters.push(minAge);
                }
            }
        }
        if (filters.diseaseStatusMalaria) {
            whereClause += ' AND diseaseStatusMalaria = ?';
            filterParameters.push(filters.diseaseStatusMalaria);
        }
        if (filters.diseaseStatusDengue) {
            whereClause += ' AND diseaseStatusDengue = ?';
            filterParameters.push(filters.diseaseStatusDengue);
        }
        if (filters.educationLevel) {
            whereClause += ' AND educationLevel = ?';
            filterParameters.push(filters.educationLevel);
        }
        if (filters.occupation) {
            whereClause += ' AND occupation = ?';
            filterParameters.push(filters.occupation);
        }
        if (filters.housingType) {
            whereClause += ' AND housingType = ?';
            filterParameters.push(filters.housingType);
        }
        if (filters.waterSource) {
            whereClause += ' AND waterSource = ?';
            filterParameters.push(filters.waterSource);
        }
        if (filters.mosquitoNetUse) {
            whereClause += ' AND mosquitoNetUse = ?';
            filterParameters.push(filters.mosquitoNetUse);
        }
        if (filters.accessToHealthcare) {
            whereClause += ' AND accessToHealthcare = ?';
            filterParameters.push(filters.accessToHealthcare);
        }
        if (filters.projectId) {
            whereClause += ' AND projectId = ?';
            filterParameters.push(filters.projectId);
        }
    }

    // Add sorting
    const validOrderByColumns = [
        'individualId', 'householdId', 'gpsLatitudeIndividual', 'gpsLongitudeIndividual',
        'county', 'subCounty', 'gender', 'age', 'occupation', 'educationLevel',
        'diseaseStatusMalaria', 'diseaseStatusDengue', 'mosquitoNetUse',
        'waterStoragePractices', 'climatePerception', 'recentRainfall',
        'averageTemperatureC', 'householdSize', 'accessToHealthcare', 'projectId'
    ];
    const safeOrderBy = validOrderByColumns.includes(orderBy) ? orderBy : 'individualId';
    const safeOrder = (order.toUpperCase() === 'ASC' || order.toUpperCase() === 'DESC') ? order.toUpperCase() : 'ASC';

    // Construct the full data query - HARDCODED LIMIT for small dataset
    const dataQuery = `SELECT * FROM studyparticipants ${whereClause} ORDER BY ${safeOrderBy} ${safeOrder} LIMIT 10000`; // Hardcoded limit
    const dataQueryParams = filterParameters; // Only filter params, no limit/offset params needed for hardcoded limit

    // Construct the full count query
    const countQuery = `SELECT COUNT(*) as totalCount FROM studyparticipants ${whereClause}`;
    const countQueryParams = filterParameters; // Only filter parameters for count

    try {
        // Log queries and parameters for debugging
        console.log('--- Debugging Participant Filtered Data (Simplified) ---');
        console.log('Final Data Query:', dataQuery);
        console.log('Final Data Query Parameters:', dataQueryParams);
        console.log('Final Count Query:', countQuery);
        console.log('Final Count Query Parameters:', countQueryParams);

        // Execute count query first to get total number of rows
        const [countRows] = await pool.execute(countQuery, countQueryParams);
        const totalCount = countRows[0].totalCount;

        // Execute data query
        const [rows] = await pool.execute(dataQuery, dataQueryParams);

        // Log the retrieved rows to inspect the data for individualId and householdId
        console.log('Retrieved study participants rows:', rows);

        res.status(200).json({
            data: rows,
            totalCount: totalCount,
            // For a hardcoded limit, page/pageSize/totalPages become less relevant for frontend pagination control
            // but we can return them based on the totalCount for consistency if the frontend still expects them.
            page: 1,
            pageSize: totalCount, // Indicate all data is returned in one "page"
            totalPages: 1
        });
    } catch (error) {
        console.error('Error fetching filtered study participants:', error);
        res.status(500).json({ message: 'Error fetching filtered study participants', error: error.message });
    }
});


/**
 * @route GET /api/participants/study_participants/:individualId
 * @description Get a single study participant by individualId from the studyparticipants table.
 * @access Private
 */
router.get('/study_participants/:individualId', async (req, res) => {
    const { individualId } = req.params;
    try {
        const [rows] = await pool.query('SELECT * FROM studyparticipants WHERE individualId = ?', [individualId]);
        if (rows.length > 0) {
            res.status(200).json(rows[0]);
        } else {
            res.status(404).json({ message: 'Study participant not found' });
        }
    } catch (error) {
        console.error('Error fetching study participant:', error);
        res.status(500).json({ message: 'Error fetching study participant', error: error.message });
    }
});

/**
 * @route POST /api/participants/study_participants
 * @description Create a new study participant in the studyparticipants table.
 * @access Private
 */
router.post('/study_participants', async (req, res) => {
    const newStudyParticipant = {
        ...req.body
    };
    try {
        const [result] = await pool.query('INSERT INTO studyparticipants SET ?', newStudyParticipant);
        if (result.insertId) {
            newStudyParticipant.individualId = result.insertId;
        }
        res.status(201).json(newStudyParticipant);
    } catch (error) {
        console.error('Error creating study participant:', error);
        res.status(500).json({ message: 'Error creating study participant', error: error.message });
    }
});

/**
 * @route PUT /api/participants/study_participants/:individualId
 * @description Update an existing study participant by individualId in the studyparticipants table.
 * @access Private
 */
router.put('/study_participants/:individualId', async (req, res) => {
    const { individualId } = req.params;
    const fieldsToUpdate = { ...req.body };
    try {
        const [rows] = await pool.query('UPDATE studyparticipants SET ? WHERE individualId = ?', [fieldsToUpdate, individualId]);
        if (rows.affectedRows > 0) {
            const [updatedParticipant] = await pool.query('SELECT * FROM studyparticipants WHERE individualId = ?', [individualId]);
            res.status(200).json(updatedParticipant[0]);
        } else {
            res.status(404).json({ message: 'Study participant not found' });
        }
    } catch (error) {
        console.error('Error updating study participant:', error);
        res.status(500).json({ message: 'Error updating study participant', error: error.message });
    }
});

/**
 * @route DELETE /api/participants/study_participants/:individualId
 * @description Delete a study participant by individualId from the studyparticipants table.
 * @access Private
 */
router.delete('/study_participants/:individualId', async (req, res) => {
    const { individualId } = req.params;
    try {
        const [result] = await pool.query('DELETE FROM studyparticipants WHERE individualId = ?', [individualId]);
        if (result.affectedRows > 0) {
            res.status(204).send();
        } else {
            res.status(404).json({ message: 'Study participant not found' });
        }
    } catch (error) {
        console.error('Error deleting study participant:', error);
        res.status(500).json({ message: 'Error deleting study participant', error: error.message });
    }
});

/**
 * @route POST /api/participants/study_participants/export/excel
 * @description Export filtered study participant data to an Excel file.
 * @access Private
 */
router.post('/study_participants/export/excel', async (req, res) => {
    const { filters, excelHeadersMapping, orderBy = 'individualId', order = 'ASC' } = req.body;

    // Re-use the filtering and sorting logic to fetch all relevant data
    let whereClause = 'WHERE 1=1';
    const filterParameters = [];

    if (filters) {
        if (filters.county) {
            whereClause += ' AND county = ?';
            filterParameters.push(filters.county);
        }
        if (filters.gender) {
            whereClause += ' AND gender = ?';
            filterParameters.push(filters.gender);
        }
        // Add all other filter conditions here, mirroring the /filtered endpoint
        if (filters.subCounty) { whereClause += ' AND subCounty = ?'; filterParameters.push(filters.subCounty); }
        if (filters.ageGroup) {
            const ageParts = String(filters.ageGroup).split('-');
            if (ageParts.length === 2) {
                const minAge = parseInt(ageParts[0]); const maxAge = parseInt(ageParts[1]);
                if (!isNaN(minAge) && !isNaN(maxAge)) { whereClause += ' AND age BETWEEN ? AND ?'; filterParameters.push(minAge, maxAge); }
            } else if (String(filters.ageGroup).includes('+')) {
                const minAge = parseInt(String(filters.ageGroup).replace('+', ''));
                if (!isNaN(minAge)) { whereClause += ' AND age >= ?'; filterParameters.push(minAge); }
            }
        }
        if (filters.diseaseStatusMalaria) { whereClause += ' AND diseaseStatusMalaria = ?'; filterParameters.push(filters.diseaseStatusMalaria); }
        if (filters.diseaseStatusDengue) { whereClause += ' AND diseaseStatusDengue = ?'; filterParameters.push(filters.diseaseStatusDengue); }
        if (filters.educationLevel) { whereClause += ' AND educationLevel = ?'; filterParameters.push(filters.educationLevel); }
        if (filters.occupation) { whereClause += ' AND occupation = ?'; filterParameters.push(filters.occupation); }
        if (filters.housingType) { whereClause += ' AND housingType = ?'; filterParameters.push(filters.housingType); }
        if (filters.waterSource) { whereClause += ' AND waterSource = ?'; filterParameters.push(filters.waterSource); }
        if (filters.mosquitoNetUse) { whereClause += ' AND mosquitoNetUse = ?'; filterParameters.push(filters.mosquitoNetUse); }
        if (filters.accessToHealthcare) { whereClause += ' AND accessToHealthcare = ?'; filterParameters.push(filters.accessToHealthcare); }
        if (filters.projectId) { whereClause += ' AND projectId = ?'; filterParameters.push(filters.projectId); }
    }

    const validOrderByColumns = [
        'individualId', 'householdId', 'gpsLatitudeIndividual', 'gpsLongitudeIndividual',
        'county', 'subCounty', 'gender', 'age', 'occupation', 'educationLevel',
        'diseaseStatusMalaria', 'diseaseStatusDengue', 'mosquitoNetUse',
        'waterStoragePractices', 'climatePerception', 'recentRainfall',
        'averageTemperatureC', 'householdSize', 'accessToHealthcare', 'projectId'
    ];
    const safeOrderBy = validOrderByColumns.includes(orderBy) ? orderBy : 'individualId';
    const safeOrder = (order.toUpperCase() === 'ASC' || order.toUpperCase() === 'DESC') ? order.toUpperCase() : 'ASC';

    const dataQuery = `SELECT * FROM studyparticipants ${whereClause} ORDER BY ${safeOrderBy} ${safeOrder}`; // No LIMIT/OFFSET for export all
    const queryParams = [...filterParameters]; // Parameters for the query

    try {
        const [rows] = await pool.execute(dataQuery, queryParams);

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Participants Data');

        // Define columns based on the mapping provided by the frontend
        const columns = Object.keys(excelHeadersMapping).map(key => ({
            header: excelHeadersMapping[key], // Human-readable label
            key: key, // The actual data property name (camelCase)
            width: 20
        }));
        worksheet.columns = columns;

        // Add rows, ensuring data matches the `key` in columns
        worksheet.addRows(rows);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=participants_export.xlsx');

        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error('Error exporting study participants to Excel:', error);
        res.status(500).json({ message: 'Error exporting data to Excel', error: error.message });
    }
});

/**
 * @route POST /api/participants/study_participants/export/pdf
 * @description Export filtered study participant data (HTML table) to a PDF file.
 * @access Private
 */
router.post('/study_participants/export/pdf', async (req, res) => {
    const { filters, tableHtml, orderBy = 'individualId', order = 'ASC' } = req.body;

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
                <title>KEMRI Participants Report</title>
                <style>
                    body { font-family: sans-serif; margin: 20px; }
                    h1 { color: #0A2342; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 9pt; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                    th { background-color: #f2f2f2; }
                    .header { text-align: center; margin-bottom: 20px; }
                    .footer { font-size: 8pt; text-align: center; margin-top: 30px; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>KEMRI Participants Data Report</h1>
                    <p>Generated on: ${new Date().toLocaleDateString()}</p>
                </div>
                ${tableHtml}
                <div class="footer">
                    Page <span class="pageNumber"></span> of <span class="totalPages"></span>
                </div>
            </body>
            </html>
        `,
            { waitUntil: 'domcontentloaded', timeout: 45000 }
        );

        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            displayHeaderFooter: true,
            headerTemplate: '<div style="font-size: 8px; margin-left: 20px;">KEMRI Report</div>',
            footerTemplate:
                '<div style="font-size: 8px; margin-right: 20px; margin-left: 20px; width: 100%; text-align: right;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=participants_report.pdf');
        res.send(pdfBuffer);
    } catch (error) {
        console.error('Error exporting study participants to PDF:', error);
        res.status(500).json({ message: 'Error exporting data to PDF', error: error.message });
    } finally {
        if (browser) {
            try {
                await browser.close();
            } catch (e) {
                console.warn('participants export/pdf: browser.close failed:', e.message);
            }
        }
    }
});


module.exports = router;
