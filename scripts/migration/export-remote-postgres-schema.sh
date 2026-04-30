#!/bin/bash
# Export schema from remote PostgreSQL database
# Usage: ./export-remote-postgres-schema.sh [password]

REMOTE_HOST="${REMOTE_PG_HOST:-localhost}"
REMOTE_USER="${REMOTE_PG_USER:-postgres}"
REMOTE_DB="${REMOTE_PG_DATABASE:-government_projects}"
OUTPUT_FILE="scripts/migration/schema/remote-postgres-schema.sql"

# Password: first CLI arg, or REMOTE_PG_PASSWORD (no default — avoids leaking secrets).
if [ -n "$1" ]; then
    PASSWORD="$1"
elif [ -n "${REMOTE_PG_PASSWORD:-}" ]; then
    PASSWORD="$REMOTE_PG_PASSWORD"
else
    echo "Set REMOTE_PG_PASSWORD or pass the DB password as the first argument." >&2
    exit 1
fi

echo "Exporting schema from remote PostgreSQL database..."

# Export schema only (no data)
PGPASSWORD="$PASSWORD" pg_dump -h "$REMOTE_HOST" -U "$REMOTE_USER" -d "$REMOTE_DB" \
    --schema-only \
    --no-owner \
    --no-privileges \
    --file="$OUTPUT_FILE"

if [ $? -eq 0 ]; then
    echo "✓ Schema exported to $OUTPUT_FILE"
    
    # Also export table list
    PGPASSWORD="$PASSWORD" psql -h "$REMOTE_HOST" -U "$REMOTE_USER" -d "$REMOTE_DB" \
        -c "\dt" > "scripts/migration/schema/remote-postgres-tables.txt" 2>&1
    
    # Export table count
    PGPASSWORD="$PASSWORD" psql -h "$REMOTE_HOST" -U "$REMOTE_USER" -d "$REMOTE_DB" \
        -c "SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema = 'public';" \
        >> "scripts/migration/schema/remote-postgres-tables.txt" 2>&1
    
    echo "✓ Table list exported"
else
    echo "✗ Failed to export schema"
    exit 1
fi
