#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# OPC UA Backend - SIT Deployment Script (SSM-based)
# =============================================================================
# Deploys the latest code to the existing SIT EC2 instance using AWS SSM.
# This script does NOT create new instances - it updates the running SIT environment.
#
# Prerequisites:
#   - AWS CLI configured with appropriate credentials
#   - .env.compose file exists on EC2 instance at /opt/opcua-backend/
#   - EC2 instance is running and SSM agent is active
#
# Usage: ./scripts/sit/deploy.sh [--skip-confirmation]
# =============================================================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REGION="us-east-1"
INSTANCE_ID="i-031be0ff1e8e4195b"
APP_DIR="/opt/opcua-backend"
PUBLIC_ENDPOINT="https://api-dashboard.harrytu.cv"
HEALTH_ENDPOINT="${PUBLIC_ENDPOINT}/health"

# Logging functions
log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

log_step() {
    echo ""
    echo "================================================================================"
    echo -e "${BLUE}$1${NC}"
    echo "================================================================================"
}

# Error handler
trap 'log_error "Deployment failed at line $LINENO. Check the output above for details."' ERR

# Parse arguments
SKIP_CONFIRMATION=false
if [[ "${1:-}" == "--skip-confirmation" ]]; then
    SKIP_CONFIRMATION=true
fi

# =============================================================================
# Pre-flight Checks
# =============================================================================

log_step "Pre-flight Checks"

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    log_error "AWS CLI not found. Please install it first."
    exit 1
fi
log_success "AWS CLI found"

# Check AWS credentials
if ! aws sts get-caller-identity --region "$REGION" &> /dev/null; then
    log_error "AWS credentials not configured or invalid"
    exit 1
fi
log_success "AWS credentials valid"

# Check instance status
INSTANCE_STATE=$(aws ec2 describe-instances \
    --region "$REGION" \
    --instance-ids "$INSTANCE_ID" \
    --query 'Reservations[0].Instances[0].State.Name' \
    --output text 2>/dev/null || echo "unknown")

if [[ "$INSTANCE_STATE" != "running" ]]; then
    log_error "Instance $INSTANCE_ID is not running (state: $INSTANCE_STATE)"
    exit 1
fi
log_success "EC2 instance is running"

# Check SSM connectivity
if ! aws ssm describe-instance-information \
    --region "$REGION" \
    --filters "Key=InstanceIds,Values=$INSTANCE_ID" \
    --query 'InstanceInformationList[0].PingStatus' \
    --output text 2>/dev/null | grep -q "Online"; then
    log_error "Instance is not reachable via SSM"
    exit 1
fi
log_success "SSM agent is online"

# =============================================================================
# Confirmation
# =============================================================================

if [[ "$SKIP_CONFIRMATION" == false ]]; then
    echo ""
    log_warning "This will deploy the latest code from master to SIT:"
    echo "  Region:         $REGION"
    echo "  Instance ID:    $INSTANCE_ID"
    echo "  Instance State: $INSTANCE_STATE"
    echo "  App Directory:  $APP_DIR"
    echo "  Endpoint:       $PUBLIC_ENDPOINT"
    echo ""
    read -p "Continue with deployment? (yes/NO): " -r
    echo ""

    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        log_info "Deployment cancelled"
        exit 0
    fi
fi

# =============================================================================
# Step 1: Pull Latest Code
# =============================================================================

log_step "Step 1: Pulling Latest Code from Git"

COMMAND_ID=$(aws ssm send-command \
    --region "$REGION" \
    --instance-ids "$INSTANCE_ID" \
    --document-name "AWS-RunShellScript" \
    --parameters '{"commands":[
        "cd /opt/opcua-backend",
        "echo === Verifying .env.compose exists before pull ===",
        "if [ -f .env.compose ]; then echo .env.compose found; else echo ERROR: .env.compose missing!; exit 1; fi",
        "",
        "echo === Pulling latest code ===",
        "git fetch origin",
        "git reset --hard origin/master",
        "",
        "echo === Verifying .env.compose preserved after pull ===",
        "if [ -f .env.compose ]; then echo .env.compose preserved; else echo ERROR: .env.compose was deleted!; exit 1; fi"
    ]}' \
    --output text \
    --query 'Command.CommandId')

log_info "Waiting for git pull to complete..."
aws ssm wait command-executed \
    --region "$REGION" \
    --command-id "$COMMAND_ID" \
    --instance-id "$INSTANCE_ID" \
    2>/dev/null || true

# Get command output
OUTPUT=$(aws ssm get-command-invocation \
    --region "$REGION" \
    --command-id "$COMMAND_ID" \
    --instance-id "$INSTANCE_ID" \
    --query 'StandardOutputContent' \
    --output text)

STATUS=$(aws ssm get-command-invocation \
    --region "$REGION" \
    --command-id "$COMMAND_ID" \
    --instance-id "$INSTANCE_ID" \
    --query 'Status' \
    --output text)

if [[ "$STATUS" != "Success" ]]; then
    log_error "Git pull failed:"
    echo "$OUTPUT"
    exit 1
fi

log_success "Git pull completed"
echo "$OUTPUT" | tail -5

# =============================================================================
# Step 2: Rebuild and Restart Services
# =============================================================================

log_step "Step 2: Rebuilding and Restarting Services"

COMMAND_ID=$(aws ssm send-command \
    --region "$REGION" \
    --instance-ids "$INSTANCE_ID" \
    --document-name "AWS-RunShellScript" \
    --parameters '{"commands":[
        "set -e",
        "cd /opt/opcua-backend",
        "if [ ! -f .env.local ]; then echo \"# auto-created for compose\" > .env.local; fi",
        "if docker compose version >/dev/null 2>&1; then COMPOSE_CMD=\"docker compose\"; else COMPOSE_CMD=\"docker-compose\"; fi",
        "echo === Using compose command: $COMPOSE_CMD ===",
        "echo === Ensure mock data enabled for SIT ===",
        "if [ -f .env.compose ]; then if grep -q \"^ENABLE_MOCK_DATA=\" .env.compose; then sed -i \"s/^ENABLE_MOCK_DATA=.*/ENABLE_MOCK_DATA=true/\" .env.compose; else echo ENABLE_MOCK_DATA=true >> .env.compose; fi; if ! grep -q \"^MOCK_MACHINES_COUNT=\" .env.compose; then echo MOCK_MACHINES_COUNT=3 >> .env.compose; fi; if ! grep -q \"^MOCK_DATA_INTERVAL=\" .env.compose; then echo MOCK_DATA_INTERVAL=5000 >> .env.compose; fi; grep -E \"^ENABLE_MOCK_DATA|^MOCK_MACHINES_COUNT|^MOCK_DATA_INTERVAL\" .env.compose; else echo ERROR:.env.compose.missing; exit 1; fi",
        "echo === Stopping services ===",
        "$COMPOSE_CMD down || true",
        "",
        "echo === Rebuilding application ===",
        "$COMPOSE_CMD build --no-cache backend",
        "",
        "echo === Starting all services ===",
        "$COMPOSE_CMD up -d",
        "",
        "echo === Waiting for services to be ready ===",
        "sleep 15",
        "",
        "echo === Checking service status ===",
        "$COMPOSE_CMD ps",
        "",
        "echo === Docker build and start completed ==="
    ]}' \
    --output text \
    --query 'Command.CommandId')

log_info "Waiting for rebuild and restart to complete (this may take 2-3 minutes)..."
aws ssm wait command-executed \
    --region "$REGION" \
    --command-id "$COMMAND_ID" \
    --instance-id "$INSTANCE_ID" \
    2>/dev/null || true

# Get command output
OUTPUT=$(aws ssm get-command-invocation \
    --region "$REGION" \
    --command-id "$COMMAND_ID" \
    --instance-id "$INSTANCE_ID" \
    --query 'StandardOutputContent' \
    --output text)

STATUS=$(aws ssm get-command-invocation \
    --region "$REGION" \
    --command-id "$COMMAND_ID" \
    --instance-id "$INSTANCE_ID" \
    --query 'Status' \
    --output text)

ERROR_OUTPUT=$(aws ssm get-command-invocation \
    --region "$REGION" \
    --command-id "$COMMAND_ID" \
    --instance-id "$INSTANCE_ID" \
    --query 'StandardErrorContent' \
    --output text)

if [[ "$STATUS" != "Success" ]]; then
    log_error "Rebuild/restart failed (SSM status: $STATUS):"
    echo "$OUTPUT"
    if [[ -n "$ERROR_OUTPUT" && "$ERROR_OUTPUT" != "None" ]]; then
        echo "$ERROR_OUTPUT"
    fi
    exit 1
fi

if echo "$OUTPUT" | grep -q "=== Docker build and start completed ==="; then
    log_success "Services rebuilt and restarted"
    echo "$OUTPUT" | tail -15
else
    log_warning "Rebuild/restart may have issues, checking health endpoint..."
    echo "$OUTPUT"
fi

# =============================================================================
# Step 3: Verify Health
# =============================================================================

log_step "Step 3: Verifying Deployment Health"

log_info "Waiting for application to be ready..."
sleep 5

# Check health endpoint
log_info "Checking health endpoint: $HEALTH_ENDPOINT"
for i in {1..10}; do
    if curl -sf "$HEALTH_ENDPOINT" > /dev/null 2>&1; then
        log_success "Health check passed"

        # Get and display health response
        HEALTH_RESPONSE=$(curl -s "$HEALTH_ENDPOINT" | jq '.' 2>/dev/null || echo "Health endpoint returned non-JSON response")
        echo "$HEALTH_RESPONSE"
        break
    else
        if [[ $i -eq 10 ]]; then
            log_error "Health check failed after 10 attempts"
            log_warning "Check application logs for errors"
            exit 1
        fi
        log_info "Health check attempt $i/10 failed, retrying in 3 seconds..."
        sleep 3
    fi
done

# =============================================================================
# Step 4: Check Application Logs
# =============================================================================

log_step "Step 4: Recent Application Logs"

COMMAND_ID=$(aws ssm send-command \
    --region "$REGION" \
    --instance-ids "$INSTANCE_ID" \
    --document-name "AWS-RunShellScript" \
    --parameters '{"commands":[
        "cd /opt/opcua-backend",
        "echo === Last 20 lines of application logs ===",
        "docker logs --tail=20 opcua-backend"
    ]}' \
    --output text \
    --query 'Command.CommandId')

aws ssm wait command-executed \
    --region "$REGION" \
    --command-id "$COMMAND_ID" \
    --instance-id "$INSTANCE_ID" \
    2>/dev/null || true

OUTPUT=$(aws ssm get-command-invocation \
    --region "$REGION" \
    --command-id "$COMMAND_ID" \
    --instance-id "$INSTANCE_ID" \
    --query 'StandardOutputContent' \
    --output text)

echo "$OUTPUT"

# =============================================================================
# Summary
# =============================================================================

log_step "Deployment Summary"

CURRENT_COMMIT=$(git rev-parse --short HEAD)
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

log_success "Deployment completed successfully!"
echo ""
echo "Details:"
echo "  Local commit:     $CURRENT_COMMIT ($CURRENT_BRANCH)"
echo "  Instance ID:      $INSTANCE_ID"
echo "  Region:           $REGION"
echo "  Health endpoint:  $HEALTH_ENDPOINT"
echo ""
log_info "Test the deployment:"
echo "  curl $HEALTH_ENDPOINT"
echo ""
log_info "View logs:"
echo "  ./scripts/utilities/logs.sh"
echo ""
log_info "Check status:"
echo "  ./scripts/utilities/status.sh"
echo ""
