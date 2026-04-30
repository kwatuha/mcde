#!/bin/bash

# Container Stability Fix Deployment Script
# This script deploys the fixes for the unstable port 5175 container

set -e  # Exit on error

# Configuration (set for your environment; do not commit real hosts/keys)
REMOTE_USER="${REMOTE_USER:-deploy}"
REMOTE_HOST="${REMOTE_HOST:-localhost}"
REMOTE_PATH="${REMOTE_PATH:-/opt/app}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_rsa}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}  Container Stability Fix Deployment${NC}"
echo -e "${GREEN}  Target: ${REMOTE_HOST}:5175${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""

# Function to print status
print_status() {
    echo -e "${YELLOW}▶ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Step 1: Copy updated files
print_status "Step 1: Copying updated configuration files to remote server..."

echo "  - Copying vite.config.js..."
scp -i "$SSH_KEY" frontend/vite.config.js "$REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH/frontend/" || {
    print_error "Failed to copy vite.config.js"
    exit 1
}

echo "  - Copying Dockerfile..."
scp -i "$SSH_KEY" frontend/Dockerfile "$REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH/frontend/" || {
    print_error "Failed to copy Dockerfile"
    exit 1
}

echo "  - Copying docker-compose.yml..."
scp -i "$SSH_KEY" docker-compose.yml "$REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH/" || {
    print_error "Failed to copy docker-compose.yml"
    exit 1
}

print_success "All files copied successfully"
echo ""

# Step 2: Rebuild and restart container on remote server
print_status "Step 2: Rebuilding container on remote server..."

ssh -i "$SSH_KEY" "$REMOTE_USER@$REMOTE_HOST" << 'ENDSSH'
cd /projects/imes

echo "  - Stopping frontend container..."
docker-compose stop frontend

echo "  - Removing old container..."
docker-compose rm -f frontend

echo "  - Rebuilding with new configuration (this may take a few minutes)..."
docker-compose build --no-cache frontend

echo "  - Starting container with new configuration..."
docker-compose up -d frontend

echo ""
echo "  - Waiting 10 seconds for container to initialize..."
sleep 10
ENDSSH

print_success "Container rebuilt and restarted"
echo ""

# Step 3: Verify deployment
print_status "Step 3: Verifying container status..."

ssh -i "$SSH_KEY" "$REMOTE_USER@$REMOTE_HOST" << 'ENDSSH'
cd /projects/imes

echo ""
echo "Container Status:"
docker ps | grep react_frontend || echo "Container not found!"

echo ""
echo "Recent Logs (last 20 lines):"
docker-compose logs --tail=20 frontend

echo ""
echo "Checking if Vite server is responding..."
sleep 5
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost:5175 || echo "Server not responding yet (this is normal, give it more time)"
ENDSSH

echo ""
print_success "Deployment completed!"
echo ""
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}  Next Steps:${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo "1. Monitor the container logs for stability:"
echo -e "   ${YELLOW}ssh -i $SSH_KEY $REMOTE_USER@$REMOTE_HOST${NC}"
echo -e "   ${YELLOW}cd $REMOTE_PATH && docker-compose logs -f frontend${NC}"
echo ""
echo "2. Test the application in your browser:"
echo -e "   ${YELLOW}http://${REMOTE_HOST}:5175${NC}"
echo ""
echo "3. Check container restarts over time (should stay at 0):"
echo -e "   ${YELLOW}docker ps | grep react_frontend${NC}"
echo ""
echo -e "${GREEN}The container should now be stable and not crash!${NC}"
echo ""


