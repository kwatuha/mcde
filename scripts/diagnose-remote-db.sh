#!/bin/bash

# Script to diagnose database connection issues on remote server
# Usage: ssh to remote server and run this script

echo "========================================="
echo "Database Connection Diagnostics"
echo "========================================="
echo ""

# Check if we're in the right directory
if [ ! -f "docker-compose.yml" ]; then
    echo "ERROR: docker-compose.yml not found. Please run from project root."
    exit 1
fi

echo "1. Checking Docker containers status..."
echo "----------------------------------------"
docker-compose ps
echo ""

echo "2. Checking PostgreSQL container health..."
echo "----------------------------------------"
docker-compose ps postgres_db
echo ""

echo "3. Testing PostgreSQL connectivity from API container..."
echo "----------------------------------------"
docker exec gov_node_api ping -c 3 postgres_db 2>/dev/null || echo "Ping failed - containers may not be on same network"
echo ""

echo "4. Testing PostgreSQL port connectivity..."
echo "----------------------------------------"
docker exec gov_node_api nc -zv postgres_db 5432 2>/dev/null || echo "Port test failed"
echo ""

echo "5. Checking PostgreSQL connection from API container..."
echo "----------------------------------------"
docker exec gov_node_api sh -c 'PGPASSWORD=postgres psql -h postgres_db -U postgres -d government_projects -c "SELECT NOW();"' 2>&1
echo ""

echo "6. Checking PostgreSQL max_connections setting..."
echo "----------------------------------------"
docker exec gov_postgres psql -U postgres -c "SHOW max_connections;" 2>/dev/null
echo ""

echo "7. Checking current active connections..."
echo "----------------------------------------"
docker exec gov_postgres psql -U postgres -d government_projects -c "SELECT count(*) as active_connections FROM pg_stat_activity WHERE datname = 'government_projects';" 2>/dev/null
echo ""

echo "8. Checking PostgreSQL logs (last 20 lines)..."
echo "----------------------------------------"
docker-compose logs --tail=20 postgres_db
echo ""

echo "9. Checking API container logs for database errors (last 30 lines)..."
echo "----------------------------------------"
docker-compose logs --tail=30 api | grep -i -E "error|connection|database|postgres|timeout" || echo "No database-related errors found in recent logs"
echo ""

echo "10. Checking container resource usage..."
echo "----------------------------------------"
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" | grep -E "CONTAINER|gov_"
echo ""

echo "11. Testing database connection with connection pool settings..."
echo "----------------------------------------"
docker exec gov_postgres psql -U postgres -d government_projects -c "
SELECT 
    setting as max_connections,
    (SELECT count(*) FROM pg_stat_activity WHERE datname = 'government_projects') as current_connections,
    setting::int - (SELECT count(*) FROM pg_stat_activity WHERE datname = 'government_projects') as available_connections
FROM pg_settings 
WHERE name = 'max_connections';
" 2>/dev/null
echo ""

echo "========================================="
echo "Diagnostics complete!"
echo "========================================="
