#!/bin/bash
# scripts/manage-seeds.sh
# Manage county seed files

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SEEDS_DIR="$PROJECT_ROOT/api/seeds"
INIT_SQL="$PROJECT_ROOT/api/init.sql"

function list_seeds() {
    echo "📋 Available seed files:"
    echo ""
    if [ -d "$SEEDS_DIR" ]; then
        ls -1 "$SEEDS_DIR"/*.sql 2>/dev/null | xargs -n1 basename | sed 's/^/  - /' || echo "  (no seed files found)"
    else
        echo "  (seeds directory does not exist)"
    fi
    echo ""
}

function create_seed() {
    COUNTY_CODE=$1
    if [ -z "$COUNTY_CODE" ]; then
        echo "Usage: $0 create <county-code>"
        exit 1
    fi

    SEED_FILE="$SEEDS_DIR/${COUNTY_CODE}_setup.sql"
    
    if [ -f "$SEED_FILE" ]; then
        echo "❌ Seed file already exists: $SEED_FILE"
        exit 1
    fi

    if [ ! -f "$INIT_SQL" ]; then
        echo "❌ Base init.sql not found: $INIT_SQL"
        exit 1
    fi

    echo "📝 Creating seed file for $COUNTY_CODE..."
    cp "$INIT_SQL" "$SEED_FILE"
    
    # Add a comment at the top
    sed -i "1i-- ${COUNTY_CODE^^} County Seed Data\n-- Generated from init.sql\n-- Customize this file for ${COUNTY_CODE^^} County specific data\n" "$SEED_FILE"
    
    echo "✓ Created: $SEED_FILE"
    echo ""
    echo "📝 Next steps:"
    echo "   1. Edit $SEED_FILE to add ${COUNTY_CODE^^} County specific data"
    echo "   2. Update config/counties/${COUNTY_CODE}.json to reference this seed file"
    echo "   3. Deploy using your deployment script (e.g., ./deploy-gprs-server.sh)"
}

function copy_seed() {
    SOURCE=$1
    TARGET=$2
    
    if [ -z "$SOURCE" ] || [ -z "$TARGET" ]; then
        echo "Usage: $0 copy <source-county-code> <target-county-code>"
        exit 1
    fi

    SOURCE_FILE="$SEEDS_DIR/${SOURCE}_setup.sql"
    TARGET_FILE="$SEEDS_DIR/${TARGET}_setup.sql"
    
    if [ ! -f "$SOURCE_FILE" ]; then
        echo "❌ Source seed file not found: $SOURCE_FILE"
        exit 1
    fi

    if [ -f "$TARGET_FILE" ]; then
        echo "⚠️  Target seed file already exists: $TARGET_FILE"
        read -p "Overwrite? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi

    echo "📋 Copying seed file from $SOURCE to $TARGET..."
    cp "$SOURCE_FILE" "$TARGET_FILE"
    
    # Update comments
    sed -i "s/${SOURCE^^}/${TARGET^^}/g" "$TARGET_FILE"
    
    echo "✓ Copied: $TARGET_FILE"
    echo "⚠️  Remember to customize this file for ${TARGET^^} County"
}

function show_usage() {
    echo "Usage: $0 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  list                          List all seed files"
    echo "  create <county-code>          Create a new seed file from init.sql"
    echo "  copy <source> <target>        Copy seed file from one county to another"
    echo ""
    echo "Examples:"
    echo "  $0 list"
    echo "  $0 create nyando"
    echo "  $0 copy kitui nyando"
}

case "$1" in
    list)
        list_seeds
        ;;
    create)
        create_seed "$2"
        ;;
    copy)
        copy_seed "$2" "$3"
        ;;
    *)
        show_usage
        exit 1
        ;;
esac




