#!/bin/bash
# Create remaining tables using mysqldump and psql
# This approach avoids the pg parameterization issue

set -e

MYSQL_USER="${MYSQL_USER:-impesUser}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-postgres}"

echo "Creating remaining tables from MySQL..."

# Export MySQL schema for all tables
echo "Step 1: Exporting MySQL schema..."
docker exec gov_db mysqldump -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" \
  --no-data --skip-triggers --skip-add-drop-table \
  gov_imbesdb 2>/dev/null | \
  grep -E "^CREATE TABLE" | \
  sed 's/`//g' | \
  sed 's/ENGINE=InnoDB.*//' | \
  sed 's/DEFAULT CHARSET=.*//' | \
  sed 's/COLLATE=.*//' | \
  sed 's/AUTO_INCREMENT=[0-9]*//' | \
  sed 's/tinyint(1)/BOOLEAN/gi' | \
  sed 's/tinyint/SMALLINT/gi' | \
  sed 's/int([0-9]*)/INTEGER/gi' | \
  sed 's/int/INTEGER/gi' | \
  sed 's/bigint([0-9]*)/BIGINT/gi' | \
  sed 's/datetime/TIMESTAMP/gi' | \
  sed 's/decimal/NUMERIC/gi' | \
  sed 's/ON UPDATE CURRENT_TIMESTAMP//gi' | \
  sed 's/AUTO_INCREMENT//gi' | \
  sed 's/PRIMARY KEY (`\([^)]*\)`)/PRIMARY KEY (\1)/gi' > /tmp/mysql_schema_clean.sql

# Get list of tables that don't exist in PostgreSQL
EXISTING=$(docker exec gov_postgres psql -U postgres -d government_projects -t -c \
  "SELECT tablename FROM pg_tables WHERE schemaname = 'public';" 2>/dev/null | \
  tr -d ' ' | sort)

MYSQL_TABLES=$(docker exec gov_db mysql -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" gov_imbesdb -e \
  "SHOW TABLES;" 2>/dev/null | grep -v "Tables_in" | sort)

echo "Step 2: Processing tables one by one..."

for table in $MYSQL_TABLES; do
  # Check if table already exists
  if echo "$EXISTING" | grep -q "^${table}$"; then
    echo "⏭️  Skipping $table (already exists)"
    continue
  fi
  
  echo "📋 Creating $table..."
  
  # Get CREATE TABLE from MySQL
  CREATE_SQL=$(docker exec gov_db mysql -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" gov_imbesdb -e \
    "SHOW CREATE TABLE \`$table\`\G" 2>/dev/null | \
    grep -A 100 "Create Table" | \
    tail -n +2 | \
    sed 's/Create Table: //' | \
    sed 's/`//g' | \
    sed 's/ENGINE=InnoDB.*//' | \
    sed 's/DEFAULT CHARSET=.*//' | \
    sed 's/COLLATE=.*//' | \
    sed 's/AUTO_INCREMENT=[0-9]*//' | \
    sed 's/tinyint(1)/BOOLEAN/gi' | \
    sed 's/tinyint/SMALLINT/gi' | \
    sed 's/int([0-9]*)/INTEGER/gi' | \
    sed 's/int/INTEGER/gi' | \
    sed 's/bigint([0-9]*)/BIGINT/gi' | \
    sed 's/datetime/TIMESTAMP/gi' | \
    sed 's/decimal/NUMERIC/gi' | \
    sed 's/ON UPDATE CURRENT_TIMESTAMP//gi' | \
    sed 's/AUTO_INCREMENT//gi' | \
    sed 's/PRIMARY KEY (`\([^)]*\)`)/PRIMARY KEY (\1)/gi' | \
    sed 's/CREATE TABLE/CREATE TABLE IF NOT EXISTS/gi')
  
  # Convert AUTO_INCREMENT to SERIAL
  if echo "$CREATE_SQL" | grep -q "INTEGER.*NOT NULL.*AUTO_INCREMENT"; then
    CREATE_SQL=$(echo "$CREATE_SQL" | sed 's/\([a-zA-Z0-9_]*\) INTEGER NOT NULL AUTO_INCREMENT/\1 SERIAL/gi')
  fi
  
  # Remove KEY definitions (we'll create indexes separately if needed)
  CREATE_SQL=$(echo "$CREATE_SQL" | sed 's/,\s*KEY [^,)]*//gi')
  CREATE_SQL=$(echo "$CREATE_SQL" | sed 's/,\s*UNIQUE KEY [^,)]*//gi')
  
  # Clean up trailing commas
  CREATE_SQL=$(echo "$CREATE_SQL" | sed 's/,\s*)/)/g')
  
  # Apply to PostgreSQL
  echo "$CREATE_SQL" | docker exec -i gov_postgres psql -U postgres -d government_projects 2>&1 | \
    grep -v "CREATE TABLE" | grep -v "^$" || echo "✓ Created $table"
done

echo ""
echo "Step 3: Checking final table count..."
docker exec gov_postgres psql -U postgres -d government_projects -c \
  "SELECT COUNT(*) as total_tables FROM pg_tables WHERE schemaname = 'public';" 2>&1 | \
  grep -v "total_tables\|---\|row"
