#!/bin/bash
# Export schema from MySQL database
# Usage: ./export-mysql-schema.sh

MYSQL_HOST="${MYSQL_HOST:-gov_db}"
MYSQL_USER="${MYSQL_USER:-impesUser}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-postgres}"
MYSQL_DATABASE="${MYSQL_DATABASE:-gov_imbesdb}"
OUTPUT_FILE="scripts/migration/schema/mysql-schema.sql"

echo "Exporting schema from MySQL database..."

# Export schema only (no data)
docker exec "$MYSQL_HOST" mysqldump \
    -u "$MYSQL_USER" \
    -p"$MYSQL_PASSWORD" \
    "$MYSQL_DATABASE" \
    --no-data \
    --skip-triggers \
    --skip-routines \
    --skip-events \
    --single-transaction \
    > "$OUTPUT_FILE" 2>&1

if [ $? -eq 0 ]; then
    echo "✓ Schema exported to $OUTPUT_FILE"
    
    # Also export table list
    docker exec "$MYSQL_HOST" mysql \
        -u "$MYSQL_USER" \
        -p"$MYSQL_PASSWORD" \
        "$MYSQL_DATABASE" \
        -e "SHOW TABLES;" > "scripts/migration/schema/mysql-tables.txt" 2>&1
    
    # Export table count
    docker exec "$MYSQL_HOST" mysql \
        -u "$MYSQL_USER" \
        -p"$MYSQL_PASSWORD" \
        "$MYSQL_DATABASE" \
        -e "SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema = '$MYSQL_DATABASE';" \
        >> "scripts/migration/schema/mysql-tables.txt" 2>&1
    
    echo "✓ Table list exported"
else
    echo "✗ Failed to export schema"
    exit 1
fi
