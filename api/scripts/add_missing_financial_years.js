/**
 * Script to add missing financial years from 2013/2014 to current year
 * Financial years run from July 1 to June 30 of the following year
 * 
 * Usage:
 *   From host: docker exec -it node_api node /app/scripts/add_missing_financial_years.js
 *   Or use: ./api/scripts/run_add_financial_years.sh
 * 
 * Database connection uses environment variables from docker-compose.yml:
 *   - DB_HOST, DB_USER, DB_PASSWORD, DB_NAME (set via api/.env; never commit secrets)
 */

const pool = require('../config/db');

async function addMissingFinancialYears() {
  let connection;
  
  try {
    connection = await pool.getConnection();
    
    // Get current year to determine how many years to add
    const currentYear = new Date().getFullYear();
    const endYear = currentYear + 1; // Add one more year for planning
    
    console.log(`Adding financial years from 2013/2014 to ${currentYear}/${endYear}...`);
    
    // Generate financial years from 2013/2014 to current year
    // Store with "FY" prefix for uniformity (e.g., "FY2013/2014")
    const financialYears = [];
    for (let year = 2013; year <= currentYear; year++) {
      const nextYear = year + 1;
      const startDate = `${year}-07-01 00:00:00`;
      const endDate = `${nextYear}-06-30 23:59:59`;
      
      financialYears.push({
        name: `FY${year}/${nextYear}`, // Store with FY prefix for uniformity
        startDate,
        endDate,
        remarks: `Financial year ${year}/${nextYear}`
      });
    }
    
    // Check existing financial years
    const [existing] = await connection.query(
      'SELECT finYearId, finYearName, startDate, endDate FROM financialyears WHERE voided = 0'
    );
    
    console.log(`Found ${existing.length} existing financial year(s) in database.`);
    console.log(`Processing ${financialYears.length} required financial years...\n`);
    
    // Process each required financial year
    let insertedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    
    for (const fy of financialYears) {
      try {
        // fy.name is already in format "FY2013/2014"
        // Normalize for comparison: remove FY prefix and standardize separators
        const normalizedNameWithoutFY = fy.name.replace(/^FY/i, '').replace(/[- ]/g, '/'); // e.g., "2013/2014"
        
        // Find existing records that match this year (any format)
        const matching = existing.filter(e => {
          const eName = e.finYearName || '';
          const eNormalized = eName.replace(/^FY/i, '').replace(/[- ]/g, '/'); // Remove FY, convert dash/space to slash
          return eNormalized === normalizedNameWithoutFY;
        });
        
        if (matching.length > 0) {
          // Check if name or dates need updating
          const needsNameUpdate = matching.some(m => m.finYearName !== fy.name);
          const needsDateUpdate = matching.some(m => 
            m.startDate !== fy.startDate || m.endDate !== fy.endDate
          );
          
          if (needsNameUpdate || needsDateUpdate) {
            // Update all matching records with correct name (FY prefix) and dates
            for (const match of matching) {
              await connection.query(
                `UPDATE financialyears 
                 SET finYearName = ?, startDate = ?, endDate = ?, remarks = ?, updatedAt = CURRENT_TIMESTAMP 
                 WHERE finYearId = ? AND voided = 0`,
                [fy.name, fy.startDate, fy.endDate, fy.remarks, match.finYearId]
              );
            }
            updatedCount++;
            console.log(`↻ Updated: ${matching.map(m => m.finYearName).join(', ')} → ${fy.name} (corrected name and dates)`);
          } else {
            skippedCount++;
            console.log(`⊘ Exists: ${matching.map(m => m.finYearName).join(', ')} (name and dates correct)`);
          }
        } else {
          // Check if this exact name already exists (case-insensitive check)
          const [existingByName] = await connection.query(
            `SELECT finYearId, finYearName FROM financialyears 
             WHERE finYearName = ? AND voided = 0`,
            [fy.name]
          );
          
          if (existingByName.length > 0) {
            skippedCount++;
            console.log(`⊘ Already exists: ${fy.name}`);
          } else {
            // Insert new financial year
            try {
              await connection.query(
                `INSERT INTO financialyears (finYearName, startDate, endDate, remarks, voided, userId) 
                 VALUES (?, ?, ?, ?, 0, 1)`,
                [fy.name, fy.startDate, fy.endDate, fy.remarks]
              );
              insertedCount++;
              console.log(`✓ Added: ${fy.name}`);
            } catch (error) {
              // Handle duplicate key error (in case unique constraint exists)
              if (error.code === 'ER_DUP_ENTRY') {
                skippedCount++;
                console.log(`⊘ Skipped (duplicate): ${fy.name}`);
              } else {
                throw error;
              }
            }
          }
        }
      } catch (error) {
        // Skip duplicates (in case of race conditions)
        if (error.code === 'ER_DUP_ENTRY') {
          console.log(`⊘ Skipped (duplicate): ${fy.name}`);
          skippedCount++;
        } else {
          console.error(`✗ Error processing ${fy.name}:`, error.message);
        }
      }
    }
    
    console.log(`\n=== Summary ===`);
    console.log(`Added: ${insertedCount} financial year(s)`);
    console.log(`Updated: ${updatedCount} existing record(s)`);
    console.log(`Skipped: ${skippedCount} (already exists with correct dates)`);
    console.log(`\nCompleted!`);
    
  } catch (error) {
    console.error('Error adding financial years:', error);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
    process.exit(0);
  }
}

// Run the script
addMissingFinancialYears().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

