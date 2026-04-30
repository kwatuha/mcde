#!/bin/bash

set -euo pipefail

# County Government of Machakos deployment script
# Safety-first defaults: placeholders + explicit confirmation required.

# -------------------------------------------------------------------
# REQUIRED CONFIGURATION (replace before real deployment)
# -------------------------------------------------------------------
SERVER_USER="${SERVER_USER:-CHANGE_ME_USER}"
SERVER_IP="${SERVER_IP:-CHANGE_ME_SERVER_IP}"
SERVER_PATH="${SERVER_PATH:-/home/CHANGE_ME_USER/machos-app}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/CHANGE_ME_KEY}"
APP_DOMAIN="${APP_DOMAIN:-CHANGE_ME_DOMAIN}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-machos}"

# Safety guard: must pass --confirm-deploy and set this env var.
REQUIRED_CONFIRM_ENV="${REQUIRED_CONFIRM_ENV:-ALLOW_MACHOS_DEPLOY}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

usage() {
  echo "County Government of Machakos Deployment Script"
  echo "Usage: $0 [--dry-run] [--confirm-deploy]"
  echo
  echo "Safety requirements for real deployment:"
  echo "  1) Replace placeholder server values in this script (or env vars)"
  echo "  2) Export $REQUIRED_CONFIRM_ENV=true"
  echo "  3) Run with --confirm-deploy"
}

is_placeholder_config() {
  [[ "$SERVER_USER" == CHANGE_ME_* ]] || \
  [[ "$SERVER_IP" == CHANGE_ME_* ]] || \
  [[ "$SERVER_PATH" == *CHANGE_ME_* ]] || \
  [[ "$SSH_KEY" == *CHANGE_ME_* ]] || \
  [[ "$APP_DOMAIN" == CHANGE_ME_* ]]
}

validate_safety() {
  if is_placeholder_config; then
    print_error "Deployment config still has placeholder values."
    print_status "Update SERVER_USER/SERVER_IP/SERVER_PATH/SSH_KEY/APP_DOMAIN first."
    exit 1
  fi

  if [[ "${!REQUIRED_CONFIRM_ENV:-false}" != "true" ]]; then
    print_error "Missing deployment confirmation env var."
    print_status "Run: export $REQUIRED_CONFIRM_ENV=true"
    exit 1
  fi
}

check_ssh_key() {
  if [[ ! -f "$SSH_KEY" ]]; then
    print_error "SSH key not found at: $SSH_KEY"
    exit 1
  fi
}

test_ssh() {
  print_status "Testing SSH connection to $SERVER_USER@$SERVER_IP..."
  ssh -i "$SSH_KEY" -o ConnectTimeout=10 "$SERVER_USER@$SERVER_IP" "echo ok" >/dev/null
  print_success "SSH connection successful"
}

sync_files() {
  local rsync_mode="${1:-}"
  print_status "Syncing files to $SERVER_USER@$SERVER_IP:$SERVER_PATH ..."

  rsync -avz $rsync_mode --progress \
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
    --exclude '*.md' \
    --exclude 'api/dump' \
    --exclude 'scripts/migration' \
    --exclude 'screenshots' \
    --exclude 'docs' \
    --exclude 'remote_119db' \
    --exclude 'test*.sh' \
    --exclude 'test*.js' \
    --exclude 'deploy*.sh' \
    --include 'deploy-machos-server.sh' \
    ./ "$SERVER_USER@$SERVER_IP:$SERVER_PATH/"
}

deploy_remote() {
  print_status "Running remote deploy..."
  ssh -i "$SSH_KEY" "$SERVER_USER@$SERVER_IP" << EOF
set -e
cd "$SERVER_PATH"

if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
else
  DC="docker-compose"
fi

\$DC -p "$COMPOSE_PROJECT_NAME" -f docker-compose.prod.yml down --remove-orphans || true
\$DC -p "$COMPOSE_PROJECT_NAME" -f docker-compose.prod.yml build
\$DC -p "$COMPOSE_PROJECT_NAME" -f docker-compose.prod.yml up -d
\$DC -p "$COMPOSE_PROJECT_NAME" -f docker-compose.prod.yml ps
EOF
  print_success "Deployment completed"
}

main() {
  local mode="${1:-}"

  if [[ "$mode" == "--help" || "$mode" == "-h" ]]; then
    usage
    exit 0
  fi

  print_status "Target: $SERVER_USER@$SERVER_IP:$SERVER_PATH"

  if [[ "$mode" == "--dry-run" ]]; then
    print_warning "DRY RUN mode"
    check_ssh_key
    sync_files "--dry-run"
    exit 0
  fi

  if [[ "$mode" != "--confirm-deploy" ]]; then
    print_error "Refusing deployment without --confirm-deploy"
    usage
    exit 1
  fi

  validate_safety
  check_ssh_key
  test_ssh
  sync_files
  deploy_remote

  print_status "Application URL: https://$APP_DOMAIN/"
}

main "${1:-}"
