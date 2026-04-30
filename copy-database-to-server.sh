#!/bin/bash

# Script to copy local PostgreSQL database to remote server
# Set SERVER_USER, SERVER_IP, SERVER_PATH, SSH_KEY for your target (do not commit secrets).

# Configuration
SERVER_USER="${SERVER_USER:-deploy}"
SERVER_IP="${SERVER_IP:-localhost}"
SERVER_PATH="${SERVER_PATH:-/opt/app}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_rsa}"
LOCAL_DB_CONTAINER="gov_postgres"
LOCAL_DB_NAME="government_projects"
LOCAL_DB_USER="postgres"
LOCAL_DB_PASSWORD="postgres"
REMOTE_DB_CONTAINER="gov_postgres"
REMOTE_DB_NAME="government_projects"
REMOTE_DB_USER="postgres"
REMOTE_DB_PASSWORD="postgres"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
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

# Check if SSH key exists
check_ssh_key() {
    if [ ! -f "$SSH_KEY" ]; then
        print_error "SSH key not found at: $SSH_KEY"
        print_status "Please ensure your SSH key is set up correctly"
        exit 1
    fi
    print_success "SSH key found"
}

# Test SSH connection
test_ssh_connection() {
    print_status "Testing SSH connection to $SERVER_USER@$SERVER_IP..."
    if ssh -i "$SSH_KEY" -o ConnectTimeout=10 "$SERVER_USER@$SERVER_IP" "echo 'Connection successful'" > /dev/null 2>&1; then
        print_success "SSH connection successful"
    else
        print_error "Failed to connect to server. Please check your SSH configuration."
        exit 1
    fi
}

# Check if local database container is running
check_local_db() {
    print_status "Checking local database container..."
    if docker ps | grep -q "$LOCAL_DB_CONTAINER"; then
        print_success "Local database container is running"
    else
        print_error "Local database container '$LOCAL_DB_CONTAINER' is not running"
        print_status "Please start your local database: docker-compose up -d postgres_db"
        exit 1
    fi
}

# Check if remote database container is running
check_remote_db() {
    print_status "Checking remote database container..."
    if ssh -i "$SSH_KEY" "$SERVER_USER@$SERVER_IP" "docker ps | grep -q $REMOTE_DB_CONTAINER" 2>/dev/null; then
        print_success "Remote database container is running"
    else
        print_warning "Remote database container '$REMOTE_DB_CONTAINER' is not running"
        print_status "Attempting to start remote database container..."
        ssh -i "$SSH_KEY" "$SERVER_USER@$SERVER_IP" "cd $SERVER_PATH && docker-compose up -d postgres_db" || {
            print_error "Failed to start remote database container"
            exit 1
        }
        print_status "Waiting for database to be ready..."
        sleep 10
    fi
}

# Create database dump
create_dump() {
    print_status "Creating database dump from local database..."
    
    DUMP_FILE="government_projects_$(date +%Y%m%d_%H%M%S).sql"
    
    # Create dump using docker exec
    # Use --format=plain for better compatibility, exclude --create to avoid database creation issues
    docker exec "$LOCAL_DB_CONTAINER" pg_dump -U "$LOCAL_DB_USER" -d "$LOCAL_DB_NAME" --clean --if-exists --no-owner --no-acl > "$DUMP_FILE" 2>/dev/null
    
    if [ $? -eq 0 ] && [ -f "$DUMP_FILE" ] && [ -s "$DUMP_FILE" ]; then
        print_success "Database dump created: $DUMP_FILE"
        echo "$DUMP_FILE"
    else
        print_error "Failed to create database dump"
        rm -f "$DUMP_FILE"
        exit 1
    fi
}

# Compress dump file
compress_dump() {
    local dump_file=$1
    print_status "Compressing dump file..."
    
    gzip -f "$dump_file"
    
    if [ $? -eq 0 ] && [ -f "${dump_file}.gz" ]; then
        print_success "Dump file compressed: ${dump_file}.gz"
        echo "${dump_file}.gz"
    else
        print_error "Failed to compress dump file"
        exit 1
    fi
}

# Transfer dump to server
transfer_dump() {
    local dump_file=$1
    print_status "Transferring dump file to server..."
    
    scp -i "$SSH_KEY" "$dump_file" "$SERVER_USER@$SERVER_IP:$SERVER_PATH/" || {
        print_error "Failed to transfer dump file"
        exit 1
    }
    
    print_success "Dump file transferred successfully"
}

# Restore database on remote server
restore_database() {
    local dump_file=$1
    local remote_dump_file=$(basename "$dump_file")
    
    print_status "Restoring database on remote server..."
    print_warning "This will replace the existing database on the remote server!"
    
    # Decompress and restore
    ssh -i "$SSH_KEY" "$SERVER_USER@$SERVER_IP" << EOF
        set -e
        cd $SERVER_PATH
        
        print_status() { echo "[INFO] \$1"; }
        print_success() { echo "[SUCCESS] \$1"; }
        print_error() { echo "[ERROR] \$1"; }
        
        print_status "Decompressing dump file..."
        gunzip -f "$remote_dump_file" || {
            print_error "Failed to decompress dump file"
            exit 1
        }
        
        local_sql_file="${remote_dump_file%.gz}"
        
        print_status "Restoring database..."
        # Drop existing connections and recreate database
        docker exec -i "$REMOTE_DB_CONTAINER" psql -U "$REMOTE_DB_USER" -d postgres << PSQL_EOF
            SELECT pg_terminate_backend(pg_stat_activity.pid)
            FROM pg_stat_activity
            WHERE pg_stat_activity.datname = '$REMOTE_DB_NAME'
              AND pid <> pg_backend_pid();
            
            DROP DATABASE IF EXISTS $REMOTE_DB_NAME;
            CREATE DATABASE $REMOTE_DB_NAME;
PSQL_EOF
        
        print_status "Importing data (this may take a few minutes)..."
        # Use psql with ON_ERROR_STOP to catch errors
        docker exec -i "$REMOTE_DB_CONTAINER" psql -U "$REMOTE_DB_USER" -d "$REMOTE_DB_NAME" -v ON_ERROR_STOP=1 < "\$local_sql_file" || {
            print_error "Failed to restore database"
            exit 1
        }
        
        print_status "Cleaning up..."
        rm -f "\$local_sql_file"
        
        print_success "Database restored successfully!"
EOF
    
    if [ $? -eq 0 ]; then
        print_success "Database restoration completed"
    else
        print_error "Failed to restore database on remote server"
        exit 1
    fi
}

# Cleanup local dump file
cleanup() {
    local dump_file=$1
    print_status "Cleaning up local dump file..."
    rm -f "$dump_file"
    print_success "Cleanup completed"
}

# Main execution
main() {
    print_status "Starting database copy process..."
    print_status "Source: Local database ($LOCAL_DB_NAME)"
    print_status "Destination: $SERVER_USER@$SERVER_IP:$SERVER_PATH"
    echo
    
    # Run checks
    check_ssh_key
    test_ssh_connection
    check_local_db
    check_remote_db
    echo
    
    # Create dump
    DUMP_FILE=$(create_dump)
    echo
    
    # Compress dump
    COMPRESSED_DUMP=$(compress_dump "$DUMP_FILE")
    echo
    
    # Transfer dump
    transfer_dump "$COMPRESSED_DUMP"
    echo
    
    # Restore database
    restore_database "$COMPRESSED_DUMP"
    echo
    
    # Cleanup
    cleanup "$COMPRESSED_DUMP"
    echo
    
    print_success "========================================="
    print_success "   DATABASE COPY COMPLETED SUCCESSFULLY! "
    print_success "========================================="
    echo
    print_status "Your local database has been copied to the remote server"
    print_status "Server: $SERVER_IP"
    print_status "Database: $REMOTE_DB_NAME"
    echo
}

# Run main function
main
