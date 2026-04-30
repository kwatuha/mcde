#!/bin/bash

# Script to compare projects table structure between Docker and local PostgreSQL

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_status "=== Comparing Projects Table Structure ==="
echo ""

# Docker database schema
print_status "Fetching Docker database schema..."
DOCKER_SCHEMA=$(docker exec gov_postgres psql -U postgres -d government_projects -tAc "
SELECT 
    column_name || '|' || 
    data_type || '|' || 
    is_nullable || '|' || 
    COALESCE(column_default, 'NULL')
FROM information_schema.columns 
WHERE table_name = 'projects' 
ORDER BY ordinal_position;
" 2>&1)

if [ $? -ne 0 ]; then
    print_error "Failed to get Docker schema"
    echo "$DOCKER_SCHEMA"
    exit 1
fi

# Local database schema - try different connection methods
print_status "Fetching local database schema..."

# Try to get credentials from environment or use defaults
LOCAL_DB_USER="${DB_USER:-postgres_user}"
LOCAL_DB_PASSWORD="${DB_PASSWORD:-postgres}"

export PGPASSWORD="${LOCAL_DB_PASSWORD}"

LOCAL_SCHEMA=$(psql -h 127.0.0.1 -U "${LOCAL_DB_USER}" -d government_projects -tAc "
SELECT 
    column_name || '|' || 
    data_type || '|' || 
    is_nullable || '|' || 
    COALESCE(column_default, 'NULL')
FROM information_schema.columns 
WHERE table_name = 'projects' 
ORDER BY ordinal_position;
" 2>&1)

if [ $? -ne 0 ]; then
    print_warning "Failed to connect with ${LOCAL_DB_USER}, trying postgres user..."
    unset PGPASSWORD
    
    # Try with postgres user (might need sudo)
    LOCAL_SCHEMA=$(sudo -u postgres psql -d government_projects -tAc "
    SELECT 
        column_name || '|' || 
        data_type || '|' || 
        is_nullable || '|' || 
        COALESCE(column_default, 'NULL')
    FROM information_schema.columns 
    WHERE table_name = 'projects' 
    ORDER BY ordinal_position;
    " 2>&1)
    
    if [ $? -ne 0 ]; then
        print_error "Failed to get local schema"
        echo "$LOCAL_SCHEMA"
        exit 1
    fi
fi

unset PGPASSWORD

# Compare schemas
echo ""
print_status "=== Docker Database Schema ==="
echo "$DOCKER_SCHEMA" | while IFS='|' read -r col_name data_type is_null default; do
    printf "%-25s %-30s %-10s %s\n" "$col_name" "$data_type" "$is_null" "$default"
done

echo ""
print_status "=== Local Database Schema ==="
echo "$LOCAL_SCHEMA" | while IFS='|' read -r col_name data_type is_null default; do
    printf "%-25s %-30s %-10s %s\n" "$col_name" "$data_type" "$is_null" "$default"
done

echo ""
print_status "=== Comparison ==="

# Convert to sorted lists for comparison
DOCKER_COLS=$(echo "$DOCKER_SCHEMA" | cut -d'|' -f1 | sort)
LOCAL_COLS=$(echo "$LOCAL_SCHEMA" | cut -d'|' -f1 | sort)

# Check if column lists match
if [ "$DOCKER_COLS" = "$LOCAL_COLS" ]; then
    print_success "Column names match!"
else
    print_error "Column names differ!"
    echo ""
    print_status "Columns in Docker but not in Local:"
    comm -23 <(echo "$DOCKER_COLS") <(echo "$LOCAL_COLS") | while read col; do
        echo "  - $col"
    done
    echo ""
    print_status "Columns in Local but not in Docker:"
    comm -13 <(echo "$DOCKER_COLS") <(echo "$LOCAL_COLS") | while read col; do
        echo "  - $col"
    done
fi

# Compare data types
print_status "Comparing data types..."
DIFF_COUNT=0
while IFS='|' read -r col_name data_type is_null default; do
    LOCAL_TYPE=$(echo "$LOCAL_SCHEMA" | grep "^${col_name}|" | cut -d'|' -f2)
    if [ "$data_type" != "$LOCAL_TYPE" ]; then
        print_warning "Type mismatch for $col_name: Docker=$data_type, Local=$LOCAL_TYPE"
        DIFF_COUNT=$((DIFF_COUNT + 1))
    fi
done <<< "$DOCKER_SCHEMA"

if [ $DIFF_COUNT -eq 0 ]; then
    print_success "All data types match!"
else
    print_error "Found $DIFF_COUNT data type mismatches"
fi

# Check row counts
echo ""
print_status "=== Row Counts ==="
DOCKER_COUNT=$(docker exec gov_postgres psql -U postgres -d government_projects -tAc "SELECT COUNT(*) FROM projects;" 2>&1)
print_status "Docker database: $DOCKER_COUNT rows"

export PGPASSWORD="${LOCAL_DB_PASSWORD}"
LOCAL_COUNT=$(psql -h 127.0.0.1 -U "${LOCAL_DB_USER}" -d government_projects -tAc "SELECT COUNT(*) FROM projects;" 2>&1)
if [ $? -ne 0 ]; then
    LOCAL_COUNT=$(sudo -u postgres psql -d government_projects -tAc "SELECT COUNT(*) FROM projects;" 2>&1)
fi
unset PGPASSWORD

print_status "Local database: $LOCAL_COUNT rows"

if [ "$DOCKER_COUNT" = "$LOCAL_COUNT" ]; then
    print_success "Row counts match!"
else
    print_warning "Row counts differ: Docker=$DOCKER_COUNT, Local=$LOCAL_COUNT"
fi

echo ""
print_status "=== Comparison Complete ==="
