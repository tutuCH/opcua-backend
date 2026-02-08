#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# OPC UA Backend - SIT Logs Viewer (SSM-based)
# =============================================================================
# Views application logs from the SIT EC2 instance using AWS SSM.
#
# Usage:
#   ./scripts/utilities/logs.sh                  # Last 50 lines
#   ./scripts/utilities/logs.sh 100              # Last 100 lines
#   ./scripts/utilities/logs.sh 200 postgres     # Last 200 lines of postgres
# =============================================================================

# Colors for output
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
REGION="us-east-1"
INSTANCE_ID="i-031be0ff1e8e4195b"
APP_DIR="/opt/opcua-backend"

# Parse arguments
LINES="${1:-50}"
SERVICE="${2:-app}"

echo -e "${BLUE}Fetching last $LINES lines of $SERVICE logs from SIT...${NC}"
echo ""

COMMAND_ID=$(aws ssm send-command \
    --region "$REGION" \
    --instance-ids "$INSTANCE_ID" \
    --document-name "AWS-RunShellScript" \
    --parameters "{\"commands\":[
        \"cd $APP_DIR\",
        \"docker compose logs --tail=$LINES $SERVICE\"
    ]}" \
    --output text \
    --query 'Command.CommandId')

# Wait for command to complete
aws ssm wait command-executed \
    --region "$REGION" \
    --command-id "$COMMAND_ID" \
    --instance-id "$INSTANCE_ID" \
    2>/dev/null || true

# Get and display output
OUTPUT=$(aws ssm get-command-invocation \
    --region "$REGION" \
    --command-id "$COMMAND_ID" \
    --instance-id "$INSTANCE_ID" \
    --query 'StandardOutputContent' \
    --output text)

echo "$OUTPUT"
