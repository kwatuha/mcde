#!/bin/bash

# GPRS Application Deployment Script to Remote Server
# Server: 102.210.149.119
# User: fortress

# Configuration
SERVER_USER="fortress"
SERVER_IP="102.210.149.119"
SERVER_PATH="/home/fortress/gprs"
SSH_KEY="$HOME/.ssh/id_gprs_server"
APP_DOMAIN="login.gpris.go.ke"

# To copy PostgreSQL data from this server to your laptop for analysis (e.g. organization scopes),
# deployment does not run pg_dump. Use the same SSH_* values as above:
#   ./scripts/pull-remote-postgres-for-local.sh
#   ./scripts/pull-remote-postgres-for-local.sh --org-only   # smaller: users, user_organization_scope, agencies, roles

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
        print_status "Please run: ssh-keygen -t ed25519 -f $SSH_KEY -N ''"
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

# Check Docker installation on server
check_docker() {
    print_status "Checking Docker installation on server..."
    
    # Check if docker command is available and works
    DOCKER_CHECK=$(ssh -i "$SSH_KEY" "$SERVER_USER@$SERVER_IP" "docker --version 2>&1" 2>&1)
    
    if echo "$DOCKER_CHECK" | grep -q "Docker version\|version"; then
        print_success "Docker is installed and accessible"
        echo "  $DOCKER_CHECK"
        
        # Check docker-compose
        COMPOSE_CHECK=$(ssh -i "$SSH_KEY" "$SERVER_USER@$SERVER_IP" "
            if command -v docker-compose &> /dev/null; then
                docker-compose --version 2>&1
            elif docker compose version &> /dev/null 2>&1; then
                docker compose version 2>&1
            else
                echo 'NOT_INSTALLED'
            fi
        " 2>&1)
        
        if echo "$COMPOSE_CHECK" | grep -q "NOT_INSTALLED"; then
            print_warning "docker-compose is not installed"
            print_status "You may need to install it manually: sudo apt-get install -y docker-compose"
        else
            print_success "docker-compose is available"
            echo "  $COMPOSE_CHECK"
        fi
    else
        print_error "Docker is not installed or not accessible on the server"
        print_status ""
        print_status "Please install Docker on the server first:"
        echo ""
        echo "  Option 1: Use the installation script"
        echo "    scp -i $SSH_KEY install-docker-on-server.sh $SERVER_USER@$SERVER_IP:~/"
        echo "    ssh -i $SSH_KEY $SERVER_USER@$SERVER_IP"
        echo "    bash install-docker-on-server.sh"
        echo ""
        echo "  Option 2: Quick install (run on server):"
        echo "    curl -fsSL https://get.docker.com -o get-docker.sh"
        echo "    sudo sh get-docker.sh"
        echo "    sudo usermod -aG docker \$USER"
        echo "    sudo apt-get install -y docker-compose"
        echo "    # Then log out and back in"
        echo ""
        print_error "Deployment cannot continue without Docker. Exiting."
        exit 1
    fi
}

# Create directory on server
create_server_directory() {
    print_status "Creating directory on server: $SERVER_PATH"
    ssh -i "$SSH_KEY" "$SERVER_USER@$SERVER_IP" "mkdir -p $SERVER_PATH"
    print_success "Directory created"
}

# Sync files to server
# Note: public-dashboard is excluded as it's no longer used. To re-enable:
# 1. Remove '--exclude public-dashboard' from rsync commands below
# 2. Uncomment public-dashboard service in docker-compose.prod.yml
sync_files() {
    print_status "Syncing files to server..."
    print_warning "This may take a few minutes..."
    
    rsync -avz --progress \
        -e "ssh -i $SSH_KEY" \
        --exclude 'node_modules' \
        --exclude '.git' \
        --exclude '.env' \
        --exclude '.env.local' \
        --exclude '.env.production' \
        --exclude '*.log' \
        --exclude 'dist' \
        --exclude 'build' \
        --exclude '.DS_Store' \
        --exclude '__pycache__' \
        --exclude '*.pyc' \
        --exclude '.vscode' \
        --exclude '.idea' \
        --exclude 'db_data' \
        --exclude 'uploads/*' \
        --exclude '*.sql' \
        --exclude '*.txt' \
        --exclude '*.html' \
        --include 'frontend/index.html' \
        --exclude '*.md' \
        --exclude 'api/migrations' \
        --exclude 'api/dump' \
        --exclude 'scripts/migration' \
        --exclude 'screenshots' \
        --exclude 'docs' \
        --exclude 'adp' \
        --exclude 'remote_119db' \
        --exclude 'public-dashboard' \
        --exclude 'process_budget_mapping.py' \
        --exclude 'fix_metadata_endpoint.py' \
        --exclude 'original_docker_compose.yml' \
        --exclude 'test-guide' \
        --exclude 'test*.sh' \
        --exclude 'test*.js' \
        --exclude 'diagnose*.sh' \
        --exclude 'check*.sh' \
        --exclude 'import*.sh' \
        --exclude 'copy*.sh' \
        --exclude 'sync*.sh' \
        --exclude 'verify*.sh' \
        --exclude 'setup*.sh' \
        --exclude 'install*.sh' \
        --exclude 'fix*.sh' \
        --exclude 'run*.sh' \
        --exclude 'deploy*.sh' \
        --include 'deploy-gprs-server.sh' \
        --include 'nginx-gprs-server.conf' \
        --include 'nginx/' \
        --include 'nginx/nginx-production.conf' \
        --include 'frontend/nginx-frontend.conf' \
        ./ "$SERVER_USER@$SERVER_IP:$SERVER_PATH/"
    
    if [ $? -eq 0 ]; then
        print_success "Files synced successfully"
    else
        print_error "Failed to sync files"
        exit 1
    fi
    
    # Manually ensure index.html is synced (rsync pattern may not work correctly)
    print_status "Ensuring frontend/index.html is synced..."
    rsync -avz -e "ssh -i $SSH_KEY" \
        ./frontend/index.html "$SERVER_USER@$SERVER_IP:$SERVER_PATH/frontend/index.html"
    if [ $? -eq 0 ]; then
        print_success "frontend/index.html synced"
    else
        print_warning "Failed to sync frontend/index.html, but continuing..."
    fi
}

# Deploy application on server
deploy_on_server() {
    print_status "Deploying application on server..."
    
    ssh -i "$SSH_KEY" "$SERVER_USER@$SERVER_IP" << EOF
        set -e
        cd $SERVER_PATH
        
        # Make scripts executable
        chmod +x *.sh 2>/dev/null || true
        chmod +x scripts/*.sh 2>/dev/null || true
        
        # Stop existing containers (if any)
        print_status() { echo "[INFO] \$1"; }
        print_success() { echo "[SUCCESS] \$1"; }
        print_warning() { echo "[WARNING] \$1"; }
        print_error() { echo "[ERROR] \$1"; }
        
        print_status "Stopping existing containers..."
        # Prefer docker compose plugin, fall back to docker-compose
        if docker compose version &> /dev/null; then
            DOCKER_COMPOSE_CMD="docker compose"
        else
            DOCKER_COMPOSE_CMD="docker-compose"
        fi
        COMPOSE_FILE="docker-compose.prod.yml"

        # Stop and remove public dashboard container if it exists (no longer needed)
        print_status "Stopping and removing public dashboard container (if exists)..."
        docker stop gov_public_dashboard 2>/dev/null || true
        docker rm gov_public_dashboard 2>/dev/null || true

        # Stop and remove any existing containers that might conflict
        print_status "Removing any existing containers..."
        docker stop gov_react_frontend gov_node_api gov_nginx_proxy 2>/dev/null || true
        docker rm gov_react_frontend gov_node_api gov_nginx_proxy 2>/dev/null || true

        \$DOCKER_COMPOSE_CMD -f \$COMPOSE_FILE down --remove-orphans 2>/dev/null || true
        
        # Verify docker-compose.prod.yml was synced
        if [ ! -f \$COMPOSE_FILE ]; then
            print_error "docker-compose.prod.yml not found! Deployment cannot continue."
            print_status "Please ensure the file was synced correctly."
            exit 1
        fi
        print_success "docker-compose.prod.yml found"
        
        # Build and start containers
        print_status "Building and starting containers..."
        # Use Docker layer cache for faster, less resource-intensive deploys.
        # If you need a clean rebuild, run manually on server:
        #   docker compose -f docker-compose.prod.yml build --no-cache
        \$DOCKER_COMPOSE_CMD -f \$COMPOSE_FILE build
        
        print_status "Starting services..."
        \$DOCKER_COMPOSE_CMD -f \$COMPOSE_FILE up -d
        
        # Wait for containers to be fully started
        print_status "Waiting for containers to start..."
        sleep 5
        
        # Get frontend container IP and update nginx config if needed
        print_status "Getting frontend container IP address..."
        # Wait a bit more for network to be fully initialized
        sleep 2
        FRONTEND_IP=\$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' gov_react_frontend 2>/dev/null || echo "")
        if [ -n "\$FRONTEND_IP" ] && [ "\$FRONTEND_IP" != "" ]; then
            print_status "Frontend container IP: \$FRONTEND_IP"
            # Update nginx config with the actual frontend IP
            if [ -f ./nginx/nginx-production.conf ]; then
                # Check if IP needs to be updated (only if different)
                # Use a more reliable method to extract current IP
                CURRENT_IP=\$(grep -oE 'http://[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}:80' ./nginx/nginx-production.conf | grep -oE '[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}' | head -1 || echo "")
                if [ "\$CURRENT_IP" != "\$FRONTEND_IP" ]; then
                    print_status "Updating nginx config with frontend IP: \$FRONTEND_IP (was: \$CURRENT_IP)"
                    # Update all occurrences of the frontend IP in nginx config
                    sed -i "s|http://[0-9]\{1,3\}\.[0-9]\{1,3\}\.[0-9]\{1,3\}\.[0-9]\{1,3\}:80|http://\$FRONTEND_IP:80|g" ./nginx/nginx-production.conf
                    # Restart nginx_proxy to pick up the new config
                    print_status "Restarting nginx_proxy to apply new frontend IP..."
                    \$DOCKER_COMPOSE_CMD -f \$COMPOSE_FILE restart nginx_proxy
                    sleep 3
                    print_success "Nginx config updated with frontend IP: \$FRONTEND_IP"
                else
                    print_status "Nginx config already has correct frontend IP: \$FRONTEND_IP"
                fi
            else
                print_warning "nginx/nginx-production.conf not found, skipping IP update"
            fi
        else
            print_warning "Could not get frontend container IP, nginx may need manual configuration"
            print_status "You may need to manually update nginx/nginx-production.conf with the frontend container IP"
        fi
        
        # Restart API to reconnect to database (in case of configuration changes)
        print_status "Restarting API to reconnect to database..."
        \$DOCKER_COMPOSE_CMD -f \$COMPOSE_FILE restart api
        
        # Restart frontend to pick up latest code changes
        print_status "Restarting frontend to load latest changes..."
        \$DOCKER_COMPOSE_CMD -f \$COMPOSE_FILE restart frontend
        
        sleep 3
        
        # Check status
        print_status "Checking container status..."
        \$DOCKER_COMPOSE_CMD -f \$COMPOSE_FILE ps
        
        # NOTE: PostgreSQL password reset cron jobs have been removed
        # The app now connects to localhost PostgreSQL, not a Docker container
        # Remove any existing PostgreSQL password reset cronjobs if they exist
        print_status "Cleaning up any existing PostgreSQL password reset cron jobs..."
        TEMP_CRON=$(mktemp)
        crontab -l 2>/dev/null | grep -v "reset-postgres-password.sh" | grep -v "ALTER USER postgres WITH PASSWORD" > "\$TEMP_CRON" || true
        crontab "\$TEMP_CRON" 2>/dev/null || true
        rm -f "\$TEMP_CRON"
        print_success "PostgreSQL cron jobs cleaned up (using localhost PostgreSQL now)"
        
        # Setup system nginx configuration for port 80 proxy
        # Only update if the config file doesn't exist or is different
        print_status "Checking system nginx configuration..."
        if [ -f "$SERVER_PATH/nginx-gprs-server.conf" ]; then
            # Check if system nginx config already exists and is working
            if [ -f /etc/nginx/sites-available/gprs ] && [ -L /etc/nginx/sites-enabled/gprs ]; then
                # Compare files - only update if different
                if ! diff -q "$SERVER_PATH/nginx-gprs-server.conf" /etc/nginx/sites-available/gprs >/dev/null 2>&1; then
                    print_status "System nginx config differs, updating..."
                    if sudo -n cp "$SERVER_PATH/nginx-gprs-server.conf" /etc/nginx/sites-available/gprs 2>/dev/null; then
                        if sudo -n nginx -t 2>/dev/null; then
                            sudo -n systemctl reload nginx 2>/dev/null || true
                            print_success "System nginx configuration updated and reloaded"
                        else
                            print_warning "Nginx configuration test failed, keeping existing config"
                        fi
                    else
                        print_warning "Could not update system nginx config (requires sudo)"
                        print_status "Existing config will be used"
                    fi
                else
                    print_status "System nginx config is up to date, skipping update"
                fi
            else
                # Config doesn't exist, try to create it (non-fatal)
                print_status "System nginx config not found, attempting to create..."
                if sudo -n cp "$SERVER_PATH/nginx-gprs-server.conf" /etc/nginx/sites-available/gprs 2>/dev/null; then
                    sudo -n ln -sf /etc/nginx/sites-available/gprs /etc/nginx/sites-enabled/gprs 2>/dev/null || true
                    if sudo -n nginx -t 2>/dev/null; then
                        sudo -n systemctl reload nginx 2>/dev/null || true
                        print_success "System nginx configuration created and reloaded"
                    else
                        print_warning "Nginx configuration test failed, but continuing..."
                    fi
                else
                    print_warning "Could not create system nginx config (requires sudo without password)"
                    print_status "If system nginx is already configured, this is fine"
                    print_status "Otherwise, manually run: sudo cp $SERVER_PATH/nginx-gprs-server.conf /etc/nginx/sites-available/gprs"
                    print_status "     sudo ln -sf /etc/nginx/sites-available/gprs /etc/nginx/sites-enabled/gprs"
                    print_status "     sudo nginx -t && sudo systemctl reload nginx"
                fi
            fi
        else
            print_warning "nginx-gprs-server.conf not found in deployment"
            print_status "If system nginx is already configured, this is fine"
        fi
        
        print_success "Deployment completed!"
EOF
    
    if [ $? -eq 0 ]; then
        print_success "Application deployed successfully"
    else
        print_error "Failed to deploy application"
        exit 1
    fi
}

# Show deployment info
show_deployment_info() {
    echo
    print_success "========================================="
    print_success "   DEPLOYMENT COMPLETED SUCCESSFULLY!   "
    print_success "========================================="
    echo
    print_status "Server Information:"
    print_status "  - IP: $SERVER_IP"
    print_status "  - User: $SERVER_USER"
    print_status "  - Path: $SERVER_PATH"
    print_status "  - Domain: $APP_DOMAIN"
    echo
        print_status "Access your application at:"
        print_status "  - Admin Frontend (HTTPS): https://$APP_DOMAIN/"
        print_status "  - Admin Frontend (Port 80): http://$SERVER_IP/"
        print_status "  - Admin Frontend (Port 8081): http://$SERVER_IP:8081/"
        print_status "  - API (Port 80): http://$SERVER_IP/api/"
        print_status "  - API (Port 8081): http://$SERVER_IP:8081/api/"
        print_status ""
        print_status "Note: Database connection uses localhost PostgreSQL (not Docker container)"
        print_status "      Ensure .env file has correct DB_HOST=127.0.0.1 configuration"
        print_status "      System nginx on port 80 proxies to Docker containers on port 8081"
        print_status "      For TLS cert (one-time on server): sudo certbot --nginx -d $APP_DOMAIN"
    echo
    print_status "Useful commands:"
    print_status "  - Pull DB dump to your machine: ./scripts/pull-remote-postgres-for-local.sh [--org-only]"
    print_status "  - View logs: ssh -i $SSH_KEY $SERVER_USER@$SERVER_IP 'cd $SERVER_PATH && (docker compose -f docker-compose.prod.yml logs -f || docker-compose -f docker-compose.prod.yml logs -f)'"
    print_status "  - Restart: ssh -i $SSH_KEY $SERVER_USER@$SERVER_IP 'cd $SERVER_PATH && (docker compose -f docker-compose.prod.yml restart || docker-compose -f docker-compose.prod.yml restart)'"
    print_status "  - Stop: ssh -i $SSH_KEY $SERVER_USER@$SERVER_IP 'cd $SERVER_PATH && (docker compose -f docker-compose.prod.yml down || docker-compose -f docker-compose.prod.yml down)'"
    print_status "  - SSH: ssh -i $SSH_KEY $SERVER_USER@$SERVER_IP"
    echo
}

# Main execution
main() {
    print_status "Starting GPRS Application Deployment to Remote Server..."
    print_status "Target: $SERVER_USER@$SERVER_IP:$SERVER_PATH"
    echo
    
    # Run checks
    check_ssh_key
    test_ssh_connection
    echo
    
    # Check Docker installation
    check_docker
    echo
    
    # Create directory
    create_server_directory
    echo
    
    # Sync files
    sync_files
    echo
    
    # Deploy
    deploy_on_server
    echo
    
    # Show info
    show_deployment_info
}

# Show help
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    echo "GPRS Application Remote Deployment Script"
    echo "Usage: $0 [--help|-h|--dry-run]"
    echo
    echo "This script deploys the GPRS application to a remote server"
    echo
    echo "Options:"
    echo "  --help, -h    Show this help message"
    echo "  --dry-run     Show what would be synced without actually syncing"
    echo
    echo "Configuration (edit script to change):"
    echo "  SERVER_USER: $SERVER_USER"
    echo "  SERVER_IP: $SERVER_IP"
    echo "  SERVER_PATH: $SERVER_PATH"
    echo "  SSH_KEY: $SSH_KEY"
    exit 0
fi

# Dry run option
if [ "$1" = "--dry-run" ]; then
    print_status "DRY RUN - Showing files that would be synced..."
    rsync -avz --dry-run \
        -e "ssh -i $SSH_KEY" \
        --exclude 'node_modules' \
        --exclude '.git' \
        --exclude '.env' \
        --exclude '*.log' \
        --exclude 'dist' \
        --exclude 'build' \
        --exclude '.DS_Store' \
        --exclude '__pycache__' \
        --exclude '*.pyc' \
        --exclude '.vscode' \
        --exclude '.idea' \
        --exclude 'db_data' \
        --exclude 'uploads/*' \
        --exclude '*.sql' \
        --exclude '*.txt' \
        --exclude '*.html' \
        --include 'frontend/' \
        --include 'frontend/index.html' \
        --exclude '*.md' \
        --exclude 'api/migrations' \
        --exclude 'api/dump' \
        --exclude 'scripts/migration' \
        --exclude 'adp' \
        --exclude 'remote_119db' \
        --exclude 'public-dashboard' \
        --exclude 'process_budget_mapping.py' \
        --exclude 'fix_metadata_endpoint.py' \
        --exclude 'original_docker_compose.yml' \
        --exclude 'test-guide' \
        --exclude 'test*.sh' \
        --exclude 'test*.js' \
        --exclude 'deploy*.sh' \
        --include 'deploy-gprs-server.sh' \
        ./ "$SERVER_USER@$SERVER_IP:$SERVER_PATH/"
    exit 0
fi

# Run main function
main
