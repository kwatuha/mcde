#!/bin/bash

# ============================================
# Production Deployment Script (Main)
# ============================================
# This is the main deployment script for the new production server
# Target: http://102.210.149.119:8081/impes/
# Usage: ./deploy.sh

set -e  # Exit on any error

# Configuration - New Production Server (GPRS) 
REMOTE_USER="fortress"
REMOTE_HOST="102.210.149.119"
REMOTE_DIR="/home/fortress/gprs"
SSH_KEY="$HOME/.ssh/id_gprs_server"
LOCAL_DIR="."

echo "🚀 Starting production deployment to new server..."
echo "   Target: http://102.210.149.119:8081/impes/"
echo ""

# Step 1: Check if we're in the correct directory
if [ ! -f "docker-compose.prod.yml" ]; then
    echo "❌ Error: docker-compose.prod.yml not found!"
    echo "Please run this script from the project root directory"
    exit 1
fi

# Step 2: Show deployment details
echo "📋 Deployment Details:"
echo "   Source: $(pwd)"
echo "   Target: $REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR"
echo "   Application URL: http://102.210.149.119:8081/impes/"
echo ""

# Step 3: Remove any local .env.local files that shouldn't be deployed
echo "🧹 Cleaning up local environment files (.env.local)..."
find . -name ".env.local" -type f -exec rm -f {} \; 2>/dev/null || true
echo "✓ Cleanup complete"
echo ""

# Step 4: Sync files to remote server
echo "📦 Syncing files to production server..."
rsync -avz --progress \
    -e "ssh -i $SSH_KEY" \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude '*.log' \
    --exclude 'dist' \
    --exclude 'build' \
    --exclude 'uploads/*' \
    --exclude '.env.local' \
    --exclude '.DS_Store' \
    $LOCAL_DIR/ $REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR/
echo "✓ Files synced"
echo ""

# Step 5: Clean up remote .env.local files
echo "🧹 Cleaning up remote environment files..."
ssh -i $SSH_KEY $REMOTE_USER@$REMOTE_HOST "find $REMOTE_DIR -name '.env.local' -type f -delete 2>/dev/null || true"
echo "✓ Remote cleanup complete"
echo ""

# Step 6: Build and deploy
echo "🔨 Building and deploying containers..."
ssh -i $SSH_KEY $REMOTE_USER@$REMOTE_HOST << 'ENDSSH'
    cd /home/fortress/gprs
    
    # Stop all services
    echo "⏸️  Stopping services..."
    docker-compose -f docker-compose.prod.yml down || true
    
    # Remove old containers
    echo "🗑️  Removing old containers..."
    docker-compose -f docker-compose.prod.yml rm -f || true
    
    # Build with no cache for fresh build
    echo "🔨 Building services..."
    docker-compose -f docker-compose.prod.yml build --no-cache
    
    # Start services
    echo "▶️  Starting services..."
    docker-compose -f docker-compose.prod.yml up -d
    
    # Wait a moment for services to start
    sleep 10
    
    # Show running containers
    echo ""
    echo "📊 Running containers:"
    docker-compose -f docker-compose.prod.yml ps
    
    # Show logs for troubleshooting
    echo ""
    echo "📋 Recent logs (last 20 lines):"
    docker-compose -f docker-compose.prod.yml logs --tail=20
ENDSSH

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🌐 Application URLs:"
echo "   Main App:         http://102.210.149.119:8081/impes"
echo "   API:              http://102.210.149.119:3010"
echo "   Public Dashboard: http://102.210.149.119:5177"
echo ""
echo "📝 Next steps:"
echo "   1. Test the application: http://102.210.149.119:8081/impes/"
echo "   2. Check logs: ssh -i $SSH_KEY $REMOTE_USER@$REMOTE_HOST 'cd $REMOTE_DIR && docker-compose -f docker-compose.prod.yml logs -f'"
echo ""
