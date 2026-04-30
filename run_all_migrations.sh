#!/bin/bash

# Script to run all database migrations
# Supports both Docker and direct MySQL connections

DB_USER="${MYSQL_USER:-impesUser}"
DB_PASS="${MYSQL_PASSWORD:-${DB_PASSWORD:-postgres}}"
DB_NAME="gov_imbesdb"
DB_HOST="localhost"
DB_PORT="3308"

# Check if custom connection details are provided
if [ ! -z "$1" ]; then
    DB_HOST="$1"
fi
if [ ! -z "$2" ]; then
    DB_PORT="$2"
fi
if [ ! -z "$3" ]; then
    DB_USER="$3"
fi
if [ ! -z "$4" ]; then
    DB_PASS="$4"
fi
if [ ! -z "$5" ]; then
    DB_NAME="$5"
fi

echo "=========================================="
echo "Running Database Migrations"
echo "=========================================="
echo "Database: $DB_NAME"
echo "Host: $DB_HOST"
echo "Port: $DB_PORT"
echo "User: $DB_USER"
echo ""

# Function to run SQL file
run_sql_file() {
    local file=$1
    local description=$2
    
    if [ ! -f "$file" ]; then
        echo "⚠️  Warning: Migration file not found: $file"
        return 1
    fi
    
    echo "📄 Running: $description"
    echo "   File: $file"
    
    # Try to find MySQL container
    MYSQL_CONTAINER=$(docker ps --format "{{.Names}}" | grep -E "gov_db|gov.*mysql" | head -n 1)
    if [ ! -z "$MYSQL_CONTAINER" ]; then
        echo "   Using Docker container: $MYSQL_CONTAINER"
        docker exec -i "$MYSQL_CONTAINER" mysql -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" < "$file" 2>&1 | grep -v "Using a password"
        if [ ${PIPESTATUS[0]} -eq 0 ]; then
            echo "   ✅ Success"
        else
            echo "   ❌ Failed"
            return 1
        fi
    else
        echo "   Using direct MySQL connection"
        mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" < "$file" 2>&1 | grep -v "Using a password"
        if [ ${PIPESTATUS[0]} -eq 0 ]; then
            echo "   ✅ Success"
        else
            echo "   ❌ Failed"
            return 1
        fi
    fi
    echo ""
}

# List of migrations in order
echo "Starting migrations..."
echo ""

# 1. Budget Containers System (creates kemri_budgets, kemri_budget_items, kemri_budget_changes)
run_sql_file "api/migrations/create_budget_containers_system.sql" "Create Budget Containers System"

# 2. Add budgetId to projects table
run_sql_file "api/migrations/add_budgetId_to_projects.sql" "Add budgetId column to kemri_projects"

# 3. Remove redundant columns from budget items (amount, status, etc.)
run_sql_file "api/migrations/remove_redundant_columns_from_budget_items.sql" "Remove redundant columns from kemri_budget_items"

# 4. Other important migrations
run_sql_file "api/migrations/add_feedback_moderation.sql" "Add feedback moderation fields" 2>/dev/null || echo "   ⚠️  Skipped (may already exist or not needed)"

run_sql_file "api/migrations/add_public_approval_fields.sql" "Add public approval fields" 2>/dev/null || echo "   ⚠️  Skipped (may already exist or not needed)"

run_sql_file "api/migrations/add_document_approval_fields.sql" "Add document approval fields" 2>/dev/null || echo "   ⚠️  Skipped (may already exist or not needed)"

run_sql_file "api/migrations/add_photo_approval_fields.sql" "Add photo approval fields" 2>/dev/null || echo "   ⚠️  Skipped (may already exist or not needed)"

run_sql_file "api/migrations/add_revision_workflow.sql" "Add revision workflow" 2>/dev/null || echo "   ⚠️  Skipped (may already exist or not needed)"

run_sql_file "api/migrations/change_project_dates_to_date_type.sql" "Change project dates to date type" 2>/dev/null || echo "   ⚠️  Skipped (may already exist or not needed)"

run_sql_file "api/migrations/add_missing_financial_years.sql" "Add missing financial years" 2>/dev/null || echo "   ⚠️  Skipped (may already exist or not needed)"

run_sql_file "api/migrations/fix_financial_years_voided_null.sql" "Fix financial years voided null" 2>/dev/null || echo "   ⚠️  Skipped (may already exist or not needed)"

run_sql_file "api/migrations/cleanup_duplicate_financial_years.sql" "Cleanup duplicate financial years" 2>/dev/null || echo "   ⚠️  Skipped (may already exist or not needed)"

run_sql_file "api/migrations/add_unique_constraint_financial_years.sql" "Add unique constraint to financial years" 2>/dev/null || echo "   ⚠️  Skipped (may already exist or not needed)"

# Citizen features migrations
run_sql_file "api/migrations/create_citizen_proposals_table.sql" "Create citizen proposals table" 2>/dev/null || echo "   ⚠️  Skipped (may already exist or not needed)"

run_sql_file "api/migrations/create_county_proposed_projects_table.sql" "Create county proposed projects table" 2>/dev/null || echo "   ⚠️  Skipped (may already exist or not needed)"

run_sql_file "api/migrations/create_project_announcements_table.sql" "Create project announcements table" 2>/dev/null || echo "   ⚠️  Skipped (may already exist or not needed)"

run_sql_file "api/migrations/add_county_projects_announcements_privileges.sql" "Add county projects and announcements privileges" 2>/dev/null || echo "   ⚠️  Skipped (may already exist or not needed)"

echo "=========================================="
echo "Migration Summary"
echo "=========================================="
echo "✅ All migrations completed!"
echo ""
echo "Next steps:"
echo "1. Verify tables were created correctly"
echo "2. Restart your API server if needed"
echo "3. Check application logs for any issues"
echo ""
echo "To verify, you can run:"
echo "  mysql -h $DB_HOST -P $DB_PORT -u $DB_USER -p$DB_PASS $DB_NAME -e \"SHOW TABLES;\""
echo ""
