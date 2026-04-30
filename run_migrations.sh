#!/bin/bash

# Script to run migrations for Citizen Features
# Uses credentials from docker-compose.yml

DB_USER="${MYSQL_USER:-impesUser}"
DB_PASS="${MYSQL_PASSWORD:-${DB_PASSWORD:-postgres}}"
DB_NAME="gov_imbesdb"
DB_HOST="localhost"
DB_PORT="3308"

echo "Running migrations for Citizen Features..."
echo "Database: $DB_NAME"
echo ""

# Check if we're using Docker
if docker ps | grep -q gov_db; then
    echo "Docker MySQL container detected. Running migrations through Docker..."
    
    # Run migrations through Docker
    docker exec -i gov_db mysql -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" < api/migrations/create_citizen_proposals_table.sql
    docker exec -i gov_db mysql -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" < api/migrations/create_county_proposed_projects_table.sql
    docker exec -i gov_db mysql -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" < api/migrations/create_project_announcements_table.sql
    docker exec -i gov_db mysql -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" < api/migrations/seed_sample_data.sql
    
    echo ""
    echo "Migrations completed!"
    echo "Verifying tables..."
    docker exec -i gov_db mysql -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" -e "SHOW TABLES LIKE 'citizen_proposals'; SHOW TABLES LIKE 'county_proposed_projects'; SHOW TABLES LIKE 'project_announcements';"
else
    echo "Running migrations directly..."
    
    # Try direct connection (if not using Docker)
    mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" < api/migrations/create_citizen_proposals_table.sql
    mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" < api/migrations/create_county_proposed_projects_table.sql
    mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" < api/migrations/create_project_announcements_table.sql
    mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" < api/migrations/seed_sample_data.sql
    
    echo ""
    echo "Migrations completed!"
fi

echo ""
echo "Done! Tables should now exist. Restart your API server if needed."

