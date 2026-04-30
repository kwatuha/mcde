#!/bin/bash

# Migration script to migrate programs and subprograms from MySQL to PostgreSQL
# This script exports data from MySQL and imports it into PostgreSQL

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Programs and Subprograms Migration Script ===${NC}\n"

# Check if we're running on the server or locally
if [ -f "/.dockerenv" ] || docker ps | grep -q "gov_postgres"; then
    echo -e "${YELLOW}Detected Docker environment${NC}"
    USE_DOCKER=true
else
    echo -e "${YELLOW}Using direct database connections${NC}"
    USE_DOCKER=false
fi

# MySQL connection details (original database)
MYSQL_HOST="${MYSQL_HOST:-localhost}"
MYSQL_PORT="${MYSQL_PORT:-3308}"
MYSQL_USER="${MYSQL_USER:-impesUser}"
MYSQL_PASS="${MYSQL_PASS:-${MYSQL_PASSWORD:-postgres}}"
MYSQL_DB="${MYSQL_DB:-gov_imbesdb}"

# PostgreSQL connection details (target database)
PG_HOST="${PG_HOST:-localhost}"
PG_PORT="${PG_PORT:-5432}"
PG_USER="${PG_USER:-postgres}"
PG_PASS="${PG_PASS:-postgres}"
PG_DB="${PG_DB:-government_projects}"

# Temporary files
TEMP_DIR=$(mktemp -d)
PROGRAMS_SQL="${TEMP_DIR}/programs_export.sql"
SUBPROGRAMS_SQL="${TEMP_DIR}/subprograms_export.sql"
MIGRATION_LOG="${TEMP_DIR}/migration.log"

echo -e "${GREEN}Step 1: Exporting programs from MySQL...${NC}"

if [ "$USE_DOCKER" = true ]; then
    # Export from MySQL container
    docker exec gov_db mysqldump -u "$MYSQL_USER" -p"$MYSQL_PASS" "$MYSQL_DB" programs \
        --no-create-info --skip-triggers --skip-lock-tables \
        --where="voided=0" > "$PROGRAMS_SQL" 2>>"$MIGRATION_LOG" || {
        echo -e "${RED}Error exporting programs from MySQL${NC}"
        exit 1
    }
else
    # Export from remote MySQL
    mysqldump -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER" -p"$MYSQL_PASS" "$MYSQL_DB" programs \
        --no-create-info --skip-triggers --skip-lock-tables \
        --where="voided=0" > "$PROGRAMS_SQL" 2>>"$MIGRATION_LOG" || {
        echo -e "${RED}Error exporting programs from MySQL${NC}"
        exit 1
    }
fi

echo -e "${GREEN}Step 2: Exporting subprograms from MySQL...${NC}"

if [ "$USE_DOCKER" = true ]; then
    # Export from MySQL container
    docker exec gov_db mysqldump -u "$MYSQL_USER" -p"$MYSQL_PASS" "$MYSQL_DB" subprograms \
        --no-create-info --skip-triggers --skip-lock-tables \
        --where="voided=0" > "$SUBPROGRAMS_SQL" 2>>"$MIGRATION_LOG" || {
        echo -e "${RED}Error exporting subprograms from MySQL${NC}"
        exit 1
    }
else
    # Export from remote MySQL
    mysqldump -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER" -p"$MYSQL_PASS" "$MYSQL_DB" subprograms \
        --no-create-info --skip-triggers --skip-lock-tables \
        --where="voided=0" > "$SUBPROGRAMS_SQL" 2>>"$MIGRATION_LOG" || {
        echo -e "${RED}Error exporting subprograms from MySQL${NC}"
        exit 1
    }
fi

echo -e "${GREEN}Step 3: Converting MySQL syntax to PostgreSQL...${NC}"

# Convert MySQL INSERT statements to PostgreSQL format
python3 << 'PYTHON_SCRIPT'
import re
import sys

def convert_mysql_to_postgres(mysql_file, postgres_file):
    with open(mysql_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Remove MySQL-specific syntax
    content = re.sub(r'LOCK TABLES.*?UNLOCK TABLES;', '', content, flags=re.DOTALL)
    content = re.sub(r'/\*!.*?\*/;', '', content, flags=re.DOTALL)
    
    # Convert INSERT syntax if needed (MySQL and PostgreSQL INSERT are similar)
    # But we need to handle backticks and quotes
    content = re.sub(r'`([^`]+)`', r'"\1"', content)  # Backticks to double quotes
    
    # Remove SET statements that might be MySQL-specific
    content = re.sub(r'SET\s+@[^;]+;', '', content, flags=re.IGNORECASE)
    
    # Write converted content
    with open(postgres_file, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print(f"Converted {mysql_file} to {postgres_file}")

if __name__ == '__main__':
    import os
    temp_dir = os.environ.get('TEMP_DIR', '/tmp')
    convert_mysql_to_postgres(f'{temp_dir}/programs_export.sql', f'{temp_dir}/programs_postgres.sql')
    convert_mysql_to_postgres(f'{temp_dir}/subprograms_export.sql', f'{temp_dir}/subprograms_postgres.sql')
PYTHON_SCRIPT

TEMP_DIR=$TEMP_DIR python3 -c "
import re
import os

temp_dir = os.environ['TEMP_DIR']

def convert_file(mysql_file, postgres_file):
    with open(mysql_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Remove MySQL-specific syntax
    content = re.sub(r'LOCK TABLES.*?UNLOCK TABLES;', '', content, flags=re.DOTALL)
    content = re.sub(r'/\*!.*?\*/;', '', content, flags=re.DOTALL)
    content = re.sub(r'`([^`]+)`', r'\"\1\"', content)
    content = re.sub(r'SET\s+@[^;]+;', '', content, flags=re.IGNORECASE)
    
    with open(postgres_file, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print(f'Converted {mysql_file}')

convert_file(f'{temp_dir}/programs_export.sql', f'{temp_dir}/programs_postgres.sql')
convert_file(f'{temp_dir}/subprograms_export.sql', f'{temp_dir}/subprograms_postgres.sql')
"

echo -e "${GREEN}Step 4: Importing programs into PostgreSQL...${NC}"

if [ "$USE_DOCKER" = true ]; then
    docker exec -i gov_postgres psql -U "$PG_USER" -d "$PG_DB" < "${TEMP_DIR}/programs_postgres.sql" 2>>"$MIGRATION_LOG" || {
        echo -e "${YELLOW}Warning: Some programs may already exist. Continuing...${NC}"
    }
else
    PGPASSWORD="$PG_PASS" psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DB" < "${TEMP_DIR}/programs_postgres.sql" 2>>"$MIGRATION_LOG" || {
        echo -e "${YELLOW}Warning: Some programs may already exist. Continuing...${NC}"
    }
fi

echo -e "${GREEN}Step 5: Importing subprograms into PostgreSQL...${NC}"

if [ "$USE_DOCKER" = true ]; then
    docker exec -i gov_postgres psql -U "$PG_USER" -d "$PG_DB" < "${TEMP_DIR}/subprograms_postgres.sql" 2>>"$MIGRATION_LOG" || {
        echo -e "${YELLOW}Warning: Some subprograms may already exist. Continuing...${NC}"
    }
else
    PGPASSWORD="$PG_PASS" psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DB" < "${TEMP_DIR}/subprograms_postgres.sql" 2>>"$MIGRATION_LOG" || {
        echo -e "${YELLOW}Warning: Some subprograms may already exist. Continuing...${NC}"
    }
fi

echo -e "${GREEN}Step 6: Verifying migration...${NC}"

if [ "$USE_DOCKER" = true ]; then
    PROGRAMS_COUNT=$(docker exec gov_postgres psql -U "$PG_USER" -d "$PG_DB" -t -c "SELECT COUNT(*) FROM programs WHERE voided = false;" 2>/dev/null | tr -d ' ')
    SUBPROGRAMS_COUNT=$(docker exec gov_postgres psql -U "$PG_USER" -d "$PG_DB" -t -c "SELECT COUNT(*) FROM subprograms WHERE voided = false;" 2>/dev/null | tr -d ' ')
else
    PROGRAMS_COUNT=$(PGPASSWORD="$PG_PASS" psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DB" -t -c "SELECT COUNT(*) FROM programs WHERE voided = false;" 2>/dev/null | tr -d ' ')
    SUBPROGRAMS_COUNT=$(PGPASSWORD="$PG_PASS" psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DB" -t -c "SELECT COUNT(*) FROM subprograms WHERE voided = false;" 2>/dev/null | tr -d ' ')
fi

echo -e "${GREEN}Migration completed!${NC}"
echo -e "Programs migrated: ${PROGRAMS_COUNT}"
echo -e "Subprograms migrated: ${SUBPROGRAMS_COUNT}"
echo -e "\nLog file: ${MIGRATION_LOG}"
echo -e "Temporary files: ${TEMP_DIR}"

# Cleanup
read -p "Do you want to keep temporary files? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    rm -rf "$TEMP_DIR"
    echo -e "${GREEN}Temporary files cleaned up.${NC}"
else
    echo -e "${YELLOW}Temporary files kept at: ${TEMP_DIR}${NC}"
fi
