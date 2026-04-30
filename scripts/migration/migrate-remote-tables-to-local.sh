#!/bin/bash
# Script to migrate tables with foreign keys to projects from remote to local database

REMOTE_HOST="${REMOTE_PG_HOST:-localhost}"
REMOTE_USER="${REMOTE_PG_USER:-postgres}"
REMOTE_PASS="${REMOTE_PG_PASSWORD:-postgres}"
REMOTE_DB="${REMOTE_PG_DATABASE:-government_projects}"

LOCAL_HOST="localhost"
LOCAL_PORT="5433"
LOCAL_USER="postgres"
LOCAL_PASS="postgres"
LOCAL_DB="government_projects"

echo "=========================================="
echo "Migrating tables with foreign keys to projects"
echo "from remote ($REMOTE_HOST) to local ($LOCAL_HOST:$LOCAL_PORT)"
echo "=========================================="
echo ""

# List of tables that reference projects table (from previous analysis)
TABLES=("feedback" "project_counties" "project_sites" "public_wifi" "project_rag_index" "project_rag_index0" "project_rag_index1")

for TABLE in "${TABLES[@]}"; do
    echo "Processing table: $TABLE"
    echo "----------------------------------------"
    
    # Check if table exists in remote
    TABLE_EXISTS=$(PGPASSWORD=$REMOTE_PASS psql -h $REMOTE_HOST -U $REMOTE_USER -d $REMOTE_DB -tAc "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '$TABLE');")
    
    if [ "$TABLE_EXISTS" = "t" ]; then
        echo "  ✓ Table exists in remote database"
        
        # Export schema from remote
        echo "  → Exporting schema..."
        PGPASSWORD=$REMOTE_PASS pg_dump -h $REMOTE_HOST -U $REMOTE_USER -d $REMOTE_DB --schema-only -t $TABLE > /tmp/${TABLE}_schema.sql 2>&1
        
        # Export data from remote
        echo "  → Exporting data..."
        PGPASSWORD=$REMOTE_PASS pg_dump -h $REMOTE_HOST -U $REMOTE_USER -d $REMOTE_DB --data-only -t $TABLE > /tmp/${TABLE}_data.sql 2>&1
        
        # Check if table exists in local
        LOCAL_EXISTS=$(PGPASSWORD=$LOCAL_PASS psql -h $LOCAL_HOST -p $LOCAL_PORT -U $LOCAL_USER -d $LOCAL_DB -tAc "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '$TABLE');")
        
        if [ "$LOCAL_EXISTS" = "t" ]; then
            echo "  ⚠ Table already exists in local database"
            echo "  → Dropping existing table..."
            PGPASSWORD=$LOCAL_PASS psql -h $LOCAL_HOST -p $LOCAL_PORT -U $LOCAL_USER -d $LOCAL_DB -c "DROP TABLE IF EXISTS $TABLE CASCADE;" 2>&1
        fi
        
        # Apply schema to local
        echo "  → Creating table in local database..."
        PGPASSWORD=$LOCAL_PASS psql -h $LOCAL_HOST -p $LOCAL_PORT -U $LOCAL_USER -d $LOCAL_DB -f /tmp/${TABLE}_schema.sql 2>&1 | grep -v "already exists" | grep -v "does not exist" || true
        
        # Import data to local
        echo "  → Importing data..."
        PGPASSWORD=$LOCAL_PASS psql -h $LOCAL_HOST -p $LOCAL_PORT -U $LOCAL_USER -d $LOCAL_DB -f /tmp/${TABLE}_data.sql 2>&1 | grep -v "already exists" || true
        
        # Count rows
        REMOTE_COUNT=$(PGPASSWORD=$REMOTE_PASS psql -h $REMOTE_HOST -U $REMOTE_USER -d $REMOTE_DB -tAc "SELECT COUNT(*) FROM $TABLE;")
        LOCAL_COUNT=$(PGPASSWORD=$LOCAL_PASS psql -h $LOCAL_HOST -p $LOCAL_PORT -U $LOCAL_USER -d $LOCAL_DB -tAc "SELECT COUNT(*) FROM $TABLE;")
        
        echo "  ✓ Remote rows: $REMOTE_COUNT, Local rows: $LOCAL_COUNT"
        echo ""
    else
        echo "  ✗ Table does not exist in remote database"
        echo ""
    fi
done

echo "=========================================="
echo "Migration complete!"
echo "=========================================="
