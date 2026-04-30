#!/bin/bash
# Phase 1: Clean 1:1 MySQL to PostgreSQL Migration
# This script performs a complete migration without merging schemas

set -e  # Exit on error

echo "=========================================="
echo "Phase 1: Clean MySQL → PostgreSQL Migration"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
MYSQL_HOST="${MYSQL_HOST:-localhost}"
MYSQL_PORT="${MYSQL_PORT:-3308}"
MYSQL_USER="${MYSQL_USER:-impesUser}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-postgres}"
MYSQL_DATABASE="${MYSQL_DATABASE:-gov_imbesdb}"

PG_HOST="${PG_HOST:-localhost}"
PG_PORT="${PG_PORT:-5433}"
PG_USER="${PG_USER:-postgres}"
PG_PASSWORD="${PG_PASSWORD:-postgres}"
PG_DATABASE="${PG_DATABASE:-government_projects}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCHEMA_DIR="${SCRIPT_DIR}/schema"

echo -e "${YELLOW}Step 1: Export MySQL Schema${NC}"
echo "----------------------------------------"
if [ ! -f "${SCHEMA_DIR}/mysql-schema.sql" ]; then
    echo "Exporting MySQL schema..."
    "${SCRIPT_DIR}/export-mysql-schema.sh"
    echo -e "${GREEN}✓ MySQL schema exported${NC}"
else
    echo -e "${GREEN}✓ MySQL schema already exists${NC}"
fi
echo ""

echo -e "${YELLOW}Step 2: Convert MySQL Schema to PostgreSQL${NC}"
echo "----------------------------------------"
if [ ! -f "${SCHEMA_DIR}/postgres-schema-converted.sql" ]; then
    echo "Converting MySQL schema to PostgreSQL..."
    node "${SCRIPT_DIR}/convert-mysql-to-postgres.js"
    echo -e "${GREEN}✓ Schema converted${NC}"
else
    echo -e "${GREEN}✓ Converted schema already exists${NC}"
fi
echo ""

echo -e "${YELLOW}Step 3: Fix Common Schema Issues${NC}"
echo "----------------------------------------"
echo "Fixing PostgreSQL syntax issues..."
node "${SCRIPT_DIR}/fix-converted-schema.js"
echo -e "${GREEN}✓ Schema fixed${NC}"
echo ""

echo -e "${YELLOW}Step 4: Create Fresh PostgreSQL Database${NC}"
echo "----------------------------------------"
read -p "This will DROP the existing database. Continue? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Dropping existing database..."
    PGPASSWORD="${PG_PASSWORD}" psql -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" -c "DROP DATABASE IF EXISTS ${PG_DATABASE};" postgres
    echo "Creating fresh database..."
    PGPASSWORD="${PG_PASSWORD}" psql -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" -c "CREATE DATABASE ${PG_DATABASE};" postgres
    echo -e "${GREEN}✓ Fresh database created${NC}"
else
    echo -e "${YELLOW}⚠ Skipping database recreation${NC}"
fi
echo ""

echo -e "${YELLOW}Step 5: Apply Converted Schema${NC}"
echo "----------------------------------------"
echo "Applying PostgreSQL schema..."
PGPASSWORD="${PG_PASSWORD}" psql -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" -d "${PG_DATABASE}" -f "${SCHEMA_DIR}/postgres-schema-fixed.sql" 2>&1 | grep -v "NOTICE:" | grep -v "does not exist" || true
echo -e "${GREEN}✓ Schema applied${NC}"
echo ""

echo -e "${YELLOW}Step 6: Verify Schema${NC}"
echo "----------------------------------------"
TABLE_COUNT=$(PGPASSWORD="${PG_PASSWORD}" psql -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" -d "${PG_DATABASE}" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" | xargs)
echo "Tables created: ${TABLE_COUNT}"
echo ""

echo -e "${YELLOW}Step 7: Migrate Data${NC}"
echo "----------------------------------------"
echo "Starting data migration..."
export MYSQL_HOST="${MYSQL_HOST}"
export MYSQL_PORT="${MYSQL_PORT}"
export MYSQL_USER="${MYSQL_USER}"
export MYSQL_PASSWORD="${MYSQL_PASSWORD}"
export MYSQL_DATABASE="${MYSQL_DATABASE}"
export DB_HOST="${PG_HOST}"
export DB_PORT="${PG_PORT}"
export DB_USER="${PG_USER}"
export DB_PASSWORD="${PG_PASSWORD}"
export DB_NAME="${PG_DATABASE}"

node "${SCRIPT_DIR}/migrate-data.js"
echo -e "${GREEN}✓ Data migration complete${NC}"
echo ""

echo -e "${YELLOW}Step 8: Verify Migration${NC}"
echo "----------------------------------------"
echo "Comparing table counts..."
MYSQL_COUNT=$(docker exec gov_db mysql -u "${MYSQL_USER}" -p"${MYSQL_PASSWORD}" "${MYSQL_DATABASE}" -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '${MYSQL_DATABASE}';" 2>/dev/null | tail -1 | xargs)
PG_COUNT=$(PGPASSWORD="${PG_PASSWORD}" psql -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" -d "${PG_DATABASE}" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" | xargs)

echo "MySQL tables: ${MYSQL_COUNT}"
echo "PostgreSQL tables: ${PG_COUNT}"

if [ "${MYSQL_COUNT}" -eq "${PG_COUNT}" ]; then
    echo -e "${GREEN}✓ Table counts match!${NC}"
else
    echo -e "${RED}⚠ Table counts don't match${NC}"
fi
echo ""

echo "=========================================="
echo -e "${GREEN}Phase 1 Migration Complete!${NC}"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Update app to use PostgreSQL (set DB_TYPE=postgresql)"
echo "2. Test all endpoints"
echo "3. Once stable, proceed to Phase 2 (optimization)"
