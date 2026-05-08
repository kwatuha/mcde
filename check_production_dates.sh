#!/bin/bash

# Script to check production server project dates
# This script will test the production API to see if agriculture projects have correct dates

echo "=== Production Server Date Verification ==="
echo "Checking if agriculture projects have correct start and end dates on production server"
echo ""

# Configuration - Update these values for your production server
PROD_HOST="your-production-host.com"
PROD_API_PORT="3000"
PROD_PROTOCOL="https"  # or "http" if not using SSL

# Agriculture projects to check
AGRICULTURE_PROJECTS=(
    "KCSAP"
    "ASDSP" 
    "EU"
    "Development of horticultural value chains(Assorted seeds)"
    "Procurement of vaccines, acaricides"
    "Dairy Cows"
    "One day old chicks"
    "Feed for the Chicks"
)

echo "🔧 Please update the production server details in this script:"
echo "   PROD_HOST: $PROD_HOST"
echo "   PROD_API_PORT: $PROD_API_PORT"
echo "   PROD_PROTOCOL: $PROD_PROTOCOL"
echo ""

read -p "Have you updated the production server details? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Please update production server details first"
    exit 1
fi

echo ""
echo "🚀 Testing production server API..."

# Test API connectivity
echo "📡 Testing API connectivity..."
API_URL="$PROD_PROTOCOL://$PROD_HOST:$PROD_API_PORT/api/projects"
echo "API URL: $API_URL"

# Test basic connectivity
if curl -s --connect-timeout 10 "$API_URL" > /dev/null; then
    echo "✅ API is accessible"
else
    echo "❌ API is not accessible. Please check:"
    echo "   - Server host and port"
    echo "   - Network connectivity"
    echo "   - API service status"
    exit 1
fi

echo ""
echo "🔍 Checking agriculture project dates..."

# Check each agriculture project
for project in "${AGRICULTURE_PROJECTS[@]}"; do
    echo ""
    echo "📋 Checking: $project"
    
    # URL encode the project name
    encoded_project=$(echo "$project" | sed 's/ /%20/g' | sed 's/(/%28/g' | sed 's/)/%29/g')
    
    # Make API call
    response=$(curl -s "$API_URL?projectName=$encoded_project")
    
    if [ $? -eq 0 ] && [ -n "$response" ]; then
        # Extract project data using jq if available, otherwise use grep
        if command -v jq &> /dev/null; then
            project_data=$(echo "$response" | jq '.[0]' 2>/dev/null)
            if [ "$project_data" != "null" ] && [ -n "$project_data" ]; then
                project_name=$(echo "$project_data" | jq -r '.projectName // "N/A"')
                start_date=$(echo "$project_data" | jq -r '.startDate // "NULL"')
                end_date=$(echo "$project_data" | jq -r '.endDate // "NULL"')
                
                echo "   Project Name: $project_name"
                echo "   Start Date: $start_date"
                echo "   End Date: $end_date"
                
                # Check if dates are correct
                if [[ "$start_date" == "2022-07-01T00:00:00.000Z" ]] && [[ "$end_date" == "2023-06-30T00:00:00.000Z" ]]; then
                    echo "   ✅ Dates are CORRECT"
                elif [[ "$start_date" == "NULL" ]] || [[ "$end_date" == "NULL" ]]; then
                    echo "   ❌ Dates are MISSING"
                else
                    echo "   ⚠️  Dates are DIFFERENT than expected"
                fi
            else
                echo "   ❌ Project not found"
            fi
        else
            # Fallback without jq
            echo "   Raw response: $response"
            echo "   ⚠️  Install jq for better parsing: sudo apt install jq"
        fi
    else
        echo "   ❌ Failed to fetch project data"
    fi
done

echo ""
echo "📊 Summary:"
echo "Expected dates:"
echo "   Start: 2022-07-01T00:00:00.000Z"
echo "   End: 2023-06-30T00:00:00.000Z"
echo ""
echo "If dates are missing or incorrect, you need to:"
echo "1. Import the projects_updated.sql file to production"
echo "2. Run the import script on the production server"
echo "3. Verify the import was successful"
























