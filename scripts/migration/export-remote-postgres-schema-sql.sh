#!/bin/bash
# Export schema from remote PostgreSQL using SQL queries (works around pg_dump version mismatch)

REMOTE_HOST="${REMOTE_PG_HOST:-localhost}"
REMOTE_USER="${REMOTE_PG_USER:-postgres}"
REMOTE_DB="${REMOTE_PG_DATABASE:-government_projects}"
REMOTE_PASSWORD="${REMOTE_PG_PASSWORD:?Set REMOTE_PG_PASSWORD for the remote PostgreSQL user.}"
OUTPUT_FILE="scripts/migration/schema/remote-postgres-schema.sql"

echo "Exporting schema from remote PostgreSQL database using SQL queries..."

# Start building the schema file
{
  echo "-- PostgreSQL schema export"
  echo "-- Database: ${REMOTE_DB}"
  echo "-- Host: ${REMOTE_HOST}"
  echo
} > "$OUTPUT_FILE"

# Get all table names
TABLES=$(PGPASSWORD="$REMOTE_PASSWORD" psql -h "$REMOTE_HOST" -U "$REMOTE_USER" -d "$REMOTE_DB" -t -c "
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_type = 'BASE TABLE' 
ORDER BY table_name;
" 2>&1 | grep -v "Using a password" | tr -d ' ' | grep -v "^$")

echo "Found $(echo "$TABLES" | wc -l) tables"

# Export each table's CREATE statement
for table in $TABLES; do
    echo "Exporting table: $table"
    
    # Get CREATE TABLE statement
    PGPASSWORD="$REMOTE_PASSWORD" psql -h "$REMOTE_HOST" -U "$REMOTE_USER" -d "$REMOTE_DB" -c "\d+ $table" >> "$OUTPUT_FILE" 2>&1
    
    # Try to get actual CREATE statement using pg_get_tabledef or similar
    PGPASSWORD="$REMOTE_PASSWORD" psql -h "$REMOTE_HOST" -U "$REMOTE_USER" -d "$REMOTE_DB" -t -c "
    SELECT 'CREATE TABLE IF NOT EXISTS ' || quote_ident(table_name) || ' (' || E'\n' ||
    string_agg(
        quote_ident(column_name) || ' ' || 
        CASE 
            WHEN data_type = 'character varying' THEN 'VARCHAR(' || character_maximum_length || ')'
            WHEN data_type = 'character' THEN 'CHAR(' || character_maximum_length || ')'
            WHEN data_type = 'numeric' THEN 'NUMERIC(' || numeric_precision || ',' || numeric_scale || ')'
            WHEN data_type = 'integer' THEN 'INTEGER'
            WHEN data_type = 'bigint' THEN 'BIGINT'
            WHEN data_type = 'smallint' THEN 'SMALLINT'
            WHEN data_type = 'boolean' THEN 'BOOLEAN'
            WHEN data_type = 'timestamp without time zone' THEN 'TIMESTAMP'
            WHEN data_type = 'timestamp with time zone' THEN 'TIMESTAMPTZ'
            WHEN data_type = 'date' THEN 'DATE'
            WHEN data_type = 'time without time zone' THEN 'TIME'
            WHEN data_type = 'text' THEN 'TEXT'
            WHEN data_type = 'jsonb' THEN 'JSONB'
            WHEN data_type = 'json' THEN 'JSON'
            ELSE UPPER(data_type)
        END ||
        CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END ||
        CASE WHEN column_default IS NOT NULL THEN ' DEFAULT ' || column_default ELSE '' END,
        ',' || E'\n    '
        ORDER BY ordinal_position
    ) || E'\n);'
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = '$table'
    GROUP BY table_name;
    " >> "$OUTPUT_FILE" 2>&1
    
    echo "" >> "$OUTPUT_FILE"
done

echo "✓ Schema exported to $OUTPUT_FILE"
