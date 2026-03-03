#!/bin/bash

# GPRS Application Deployment Script to Remote Server
# Server: 102.210.149.119
# User: fortress

# Configuration
SERVER_USER="fortress"
SERVER_IP="102.210.149.119"
SERVER_PATH="/home/fortress/gprs"
SSH_KEY="$HOME/.ssh/id_gprs_server"

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
        --exclude 'scripts/migration' \
        --exclude 'screenshots' \
        --exclude 'docs' \
        ./ "$SERVER_USER@$SERVER_IP:$SERVER_PATH/"
    
    if [ $? -eq 0 ]; then
        print_success "Files synced successfully"
    else
        print_error "Failed to sync files"
        exit 1
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
        
        # Stop existing containers (if any)
        print_status() { echo "[INFO] \$1"; }
        print_success() { echo "[SUCCESS] \$1"; }
        
        print_status "Stopping existing containers..."
        # Prefer docker compose plugin, fall back to docker-compose
        if docker compose version &> /dev/null; then
            DOCKER_COMPOSE_CMD="docker compose"
        else
            DOCKER_COMPOSE_CMD="docker-compose"
        fi
        COMPOSE_FILE="docker-compose.prod.yml"

        \$DOCKER_COMPOSE_CMD -f \$COMPOSE_FILE down 2>/dev/null || true
        
        # Build and start containers
        print_status "Building and starting containers..."
        \$DOCKER_COMPOSE_CMD -f \$COMPOSE_FILE build --no-cache
        
        print_status "Starting services..."
        \$DOCKER_COMPOSE_CMD -f \$COMPOSE_FILE up -d
        
        # Restart API to reconnect to database (in case of configuration changes)
        print_status "Restarting API to reconnect to database..."
        \$DOCKER_COMPOSE_CMD -f \$COMPOSE_FILE restart api
        
        # Restart frontend to pick up latest code changes
        print_status "Restarting frontend to load latest changes..."
        \$DOCKER_COMPOSE_CMD -f \$COMPOSE_FILE restart frontend
        
        sleep 5
        
        # Check status
        print_status "Checking container status..."
        \$DOCKER_COMPOSE_CMD -f \$COMPOSE_FILE ps
        
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
    echo
    print_status "Access your application at:"
    print_status "  - Admin Frontend: http://$SERVER_IP:8081/impes/"
    print_status "  - Public Dashboard: http://$SERVER_IP:5177/"
    print_status "  - API: http://$SERVER_IP:3010/api/"
    echo
    print_status "Useful commands:"
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
        ./ "$SERVER_USER@$SERVER_IP:$SERVER_PATH/"
    exit 0
fi

# Run main function
main
