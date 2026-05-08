#!/bin/bash

# Production Server Import Guide
# This script helps you import the updated projects table to production

echo "=== Production Server Import Guide ==="
echo ""
echo "📋 Files Ready for Import:"
echo "✅ projects_updated.sql (19KB) - Database dump with correct dates"
echo "✅ import_projects.sh (executable) - Import script"
echo "✅ check_production_dates.sh (executable) - Verification script"
echo ""

echo "🚀 Step-by-Step Import Process:"
echo ""
echo "STEP 1: Upload Files to Production Server"
echo "========================================"
echo "You need to upload these files to your production server:"
echo ""
echo "Option A: Using SCP (if you have SSH access)"
echo "scp projects_updated.sql user@production-server:/path/to/backup/"
echo "scp import_projects.sh user@production-server:/path/to/scripts/"
echo "scp check_production_dates.sh user@production-server:/path/to/scripts/"
echo ""
echo "Option B: Using SFTP or File Manager"
echo "- Upload projects_updated.sql to production server"
echo "- Upload import_projects.sh to production server"
echo "- Upload check_production_dates.sh to production server"
echo ""

echo "STEP 2: Connect to Production Server"
echo "===================================="
echo "SSH into your production server:"
echo "ssh user@production-server"
echo ""

echo "STEP 3: Prepare Import Script"
echo "============================="
echo "1. Navigate to the script directory:"
echo "   cd /path/to/scripts/"
echo ""
echo "2. Make script executable:"
echo "   chmod +x import_projects.sh"
echo ""
echo "3. Edit the script with production database details:"
echo "   nano import_projects.sh"
echo ""
echo "   Update these variables:"
echo "   SERVER_HOST=\"localhost\"  # or your DB host"
echo "   SERVER_USER=\"your-db-user\""
echo "   SERVER_DB=\"imbesdb\""
echo "   SERVER_PORT=\"3306\""
echo ""

echo "STEP 4: Run the Import"
echo "====================="
echo "Execute the import script:"
echo "./import_projects.sh"
echo ""
echo "The script will:"
echo "✅ Create backup of existing table"
echo "✅ Drop existing projects table"
echo "✅ Import updated table with correct dates"
echo "✅ Verify import was successful"
echo ""

echo "STEP 5: Verify Import Success"
echo "============================"
echo "1. Run the verification script:"
echo "   ./check_production_dates.sh"
echo ""
echo "2. Or check manually:"
echo "   mysql -h localhost -u your-user -p imbesdb -e \""
echo "   SELECT id, projectName, startDate, endDate"
echo "   FROM projects"
echo "   WHERE projectName IN ('KCSAP', 'ASDSP', 'EU')"
echo "   ORDER BY projectName;\""
echo ""

echo "STEP 6: Test Dashboard"
echo "====================="
echo "1. Visit your production dashboard"
echo "2. Check if agriculture projects show correct dates"
echo "3. Test Quick Stats modals work with real dates"
echo ""

echo "⚠️  IMPORTANT NOTES:"
echo "==================="
echo "• Always backup before importing"
echo "• Test on staging server first if possible"
echo "• Verify database permissions"
echo "• Check for foreign key constraints"
echo "• Monitor application after import"
echo ""

echo "🔧 Troubleshooting:"
echo "=================="
echo "If import fails:"
echo "• Check database connection details"
echo "• Verify file permissions"
echo "• Check MySQL user permissions"
echo "• Look for foreign key constraint errors"
echo "• Restore from backup if needed"
echo ""

echo "📞 Need Help?"
echo "============="
echo "If you encounter issues:"
echo "1. Check the error messages"
echo "2. Verify database connectivity"
echo "3. Check file permissions"
echo "4. Review the import logs"
echo ""

read -p "Press Enter to continue or Ctrl+C to exit..."
























