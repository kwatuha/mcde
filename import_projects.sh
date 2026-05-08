#!/bin/bash

# Script to import updated projects table to server
# This script will backup the existing table and import the updated one

echo "=== Kemri Projects Table Import Script ==="
echo "This script will update the projects table on the server with the corrected dates"
echo ""

# Configuration - Update these values for your server
SERVER_HOST="your-server-host"
SERVER_USER="your-username"
SERVER_DB="imbesdb"
SERVER_PORT="3306"

# Local file path
DUMP_FILE="projects_updated.sql"

echo "📋 Import Plan:"
echo "1. Backup existing projects table on server"
echo "2. Drop existing projects table"
echo "3. Import updated projects table with correct dates"
echo "4. Verify import was successful"
echo ""

read -p "Do you want to continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Import cancelled"
    exit 1
fi

echo ""
echo "🔧 Please update the server connection details in this script first:"
echo "   SERVER_HOST: $SERVER_HOST"
echo "   SERVER_USER: $SERVER_USER"
echo "   SERVER_DB: $SERVER_DB"
echo "   SERVER_PORT: $SERVER_PORT"
echo ""
echo "📁 Dump file: $DUMP_FILE"
echo ""

read -p "Have you updated the server details? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Please update server details first"
    exit 1
fi

echo ""
echo "🚀 Starting import process..."

# Step 1: Backup existing table
echo "📦 Step 1: Creating backup of existing projects table..."
BACKUP_FILE="projects_backup_$(date +%Y%m%d_%H%M%S).sql"
mysqldump -h $SERVER_HOST -P $SERVER_PORT -u $SERVER_USER -p $SERVER_DB projects > $BACKUP_FILE

if [ $? -eq 0 ]; then
    echo "✅ Backup created: $BACKUP_FILE"
else
    echo "❌ Backup failed!"
    exit 1
fi

# Step 2: Drop and recreate table
echo ""
echo "🗑️  Step 2: Dropping existing projects table..."
mysql -h $SERVER_HOST -P $SERVER_PORT -u $SERVER_USER -p $SERVER_DB -e "DROP TABLE IF EXISTS projects;"

if [ $? -eq 0 ]; then
    echo "✅ Table dropped successfully"
else
    echo "❌ Failed to drop table!"
    exit 1
fi

# Step 3: Import updated table
echo ""
echo "📥 Step 3: Importing updated projects table..."
mysql -h $SERVER_HOST -P $SERVER_PORT -u $SERVER_USER -p $SERVER_DB < $DUMP_FILE

if [ $? -eq 0 ]; then
    echo "✅ Import completed successfully"
else
    echo "❌ Import failed!"
    echo "🔄 Restoring from backup..."
    mysql -h $SERVER_HOST -P $SERVER_PORT -u $SERVER_USER -p $SERVER_DB < $BACKUP_FILE
    echo "✅ Backup restored"
    exit 1
fi

# Step 4: Verify import
echo ""
echo "🔍 Step 4: Verifying import..."

# Count total projects
TOTAL_PROJECTS=$(mysql -h $SERVER_HOST -P $SERVER_PORT -u $SERVER_USER -p $SERVER_DB -e "SELECT COUNT(*) FROM projects;" -s -N)

# Count projects with dates
PROJECTS_WITH_DATES=$(mysql -h $SERVER_HOST -P $SERVER_PORT -u $SERVER_USER -p $SERVER_DB -e "SELECT COUNT(*) FROM projects WHERE startDate IS NOT NULL AND endDate IS NOT NULL;" -s -N)

# Show sample of updated projects
echo ""
echo "📊 Import Verification:"
echo "   Total projects: $TOTAL_PROJECTS"
echo "   Projects with dates: $PROJECTS_WITH_DATES"
echo ""

echo "📋 Sample of updated projects:"
mysql -h $SERVER_HOST -P $SERVER_PORT -u $SERVER_USER -p $SERVER_DB -e "
SELECT 
    id, 
    projectName, 
    startDate, 
    endDate 
FROM projects 
WHERE projectName IN ('KCSAP', 'ASDSP', 'EU', 'Development of horticultural value chains(Assorted seeds)')
ORDER BY projectName;
"

echo ""
echo "✅ Import completed successfully!"
echo "📁 Backup file saved as: $BACKUP_FILE"
echo "📁 Updated data imported from: $DUMP_FILE"
echo ""
echo "🎉 The projects table now has correct start and end dates!"
























