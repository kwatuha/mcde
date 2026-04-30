#!/usr/bin/env node
/**
 * Analyze database schema for JSON column optimization opportunities
 * Identifies tables that could benefit from PostgreSQL JSON/JSONB features
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const mysqlConfig = {
    host: process.env.MYSQL_HOST || 'localhost',
    port: process.env.MYSQL_PORT || 3308,
    user: process.env.MYSQL_USER || 'impesUser',
    password: process.env.MYSQL_PASSWORD || process.env.MYSQL_PASS || 'postgres',
    database: process.env.MYSQL_DATABASE || 'gov_imbesdb',
};

async function getTableStructure(conn, tableName) {
    const [rows] = await conn.execute(`DESCRIBE ${tableName}`);
    return rows;
}

async function analyzeTable(conn, tableName) {
    const columns = await getTableStructure(conn, tableName);
    
    // Criteria for JSON optimization:
    // 1. Multiple text/varchar fields that could be grouped
    // 2. Settings/preferences fields
    // 3. Metadata fields
    // 4. Already has JSON field (can be optimized)
    
    const textFields = columns.filter(col => 
        col.Type.includes('TEXT') || 
        col.Type.includes('VARCHAR') ||
        col.Type.includes('CHAR')
    );
    
    const jsonFields = columns.filter(col => col.Type.includes('JSON'));
    
    // Count fields that might be consolidated
    const potentialJsonFields = columns.filter(col => {
        const name = col.Field.toLowerCase();
        return name.includes('setting') ||
               name.includes('config') ||
               name.includes('metadata') ||
               name.includes('preference') ||
               name.includes('option') ||
               name.includes('data') ||
               name.includes('extra') ||
               name.includes('additional');
    });
    
    // Check for multiple related fields (e.g., address_line1, address_line2, city, state)
    const addressFields = columns.filter(col => 
        col.Field.toLowerCase().includes('address') ||
        col.Field.toLowerCase().includes('location') ||
        col.Field.toLowerCase().includes('contact')
    );
    
    const dateFields = columns.filter(col => 
        col.Type.includes('DATE') || col.Type.includes('TIME')
    );
    
    const score = {
        hasJson: jsonFields.length > 0,
        textFieldCount: textFields.length,
        potentialJsonFields: potentialJsonFields.length,
        addressFields: addressFields.length,
        totalFields: columns.length,
        recommendation: 'none'
    };
    
    // Generate recommendation
    if (jsonFields.length > 0) {
        score.recommendation = 'optimize-json';
        score.reason = 'Already has JSON fields - consider using JSONB for better performance';
    } else if (potentialJsonFields.length >= 3) {
        score.recommendation = 'consolidate-settings';
        score.reason = 'Multiple settings/config fields - consider consolidating into JSON';
    } else if (addressFields.length >= 3) {
        score.recommendation = 'consolidate-address';
        score.reason = 'Multiple address/location fields - consider consolidating into JSON';
    } else if (textFields.length >= 5 && score.totalFields > 10) {
        score.recommendation = 'consider-json';
        score.reason = 'Many text fields - consider if some can be grouped into JSON';
    }
    
    return {
        table: tableName,
        columns: columns.length,
        ...score,
        sampleFields: columns.slice(0, 10).map(c => c.Field)
    };
}

async function main() {
    console.log('Analyzing database schema for JSON optimization opportunities...\n');
    
    let conn;
    try {
        conn = await mysql.createConnection(mysqlConfig);
        console.log('✓ Connected to MySQL database\n');
        
        // Get all tables
        const [tables] = await conn.execute('SHOW TABLES');
        const tableNames = tables.map(row => Object.values(row)[0]);
        
        console.log(`Analyzing ${tableNames.length} tables...\n`);
        
        const results = [];
        for (const tableName of tableNames) {
            const analysis = await analyzeTable(conn, tableName);
            results.push(analysis);
        }
        
        // Sort by recommendation priority
        const priority = {
            'optimize-json': 1,
            'consolidate-settings': 2,
            'consolidate-address': 3,
            'consider-json': 4,
            'none': 5
        };
        
        results.sort((a, b) => {
            const aPriority = priority[a.recommendation] || 99;
            const bPriority = priority[b.recommendation] || 99;
            return aPriority - bPriority;
        });
        
        // Print results
        console.log('='.repeat(80));
        console.log('JSON OPTIMIZATION OPPORTUNITIES');
        console.log('='.repeat(80));
        
        const recommendations = {
            'optimize-json': [],
            'consolidate-settings': [],
            'consolidate-address': [],
            'consider-json': [],
            'none': []
        };
        
        results.forEach(r => {
            recommendations[r.recommendation].push(r);
        });
        
        for (const [recType, tables] of Object.entries(recommendations)) {
            if (tables.length > 0 && recType !== 'none') {
                console.log(`\n${recType.toUpperCase().replace(/-/g, ' ')} (${tables.length} tables):`);
                console.log('-'.repeat(80));
                
                for (const table of tables) {
                    console.log(`\n  Table: ${table.table}`);
                    console.log(`    Reason: ${table.reason}`);
                    console.log(`    Fields: ${table.columns} total`);
                    if (table.hasJson) {
                        console.log(`    ⚠ Already has JSON fields`);
                    }
                    if (table.sampleFields.length > 0) {
                        console.log(`    Sample fields: ${table.sampleFields.join(', ')}`);
                    }
                }
            }
        }
        
        // Summary
        console.log(`\n${'='.repeat(80)}`);
        console.log('SUMMARY');
        console.log(`${'='.repeat(80)}`);
        console.log(`Total tables analyzed: ${results.length}`);
        console.log(`Tables with JSON optimization opportunities: ${
            results.filter(r => r.recommendation !== 'none').length
        }`);
        console.log(`  - Optimize existing JSON: ${recommendations['optimize-json'].length}`);
        console.log(`  - Consolidate settings: ${recommendations['consolidate-settings'].length}`);
        console.log(`  - Consolidate address: ${recommendations['consolidate-address'].length}`);
        console.log(`  - Consider JSON: ${recommendations['consider-json'].length}`);
        
        // Write detailed report
        const outputFile = path.join(__dirname, 'json-optimization-report.json');
        fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
        console.log(`\nDetailed report written to: ${outputFile}`);
        
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    } finally {
        if (conn) await conn.end();
    }
}

if (require.main === module) {
    main();
}

module.exports = { analyzeTable, main };
