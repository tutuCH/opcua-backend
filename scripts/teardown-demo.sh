#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# OPC UA Backend - Demo Deployment Cleanup Script
# =============================================================================
# Terminates EC2 instance, deletes security group, and removes key pair.
#
# Usage: ./scripts/teardown-demo.sh
# =============================================================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEPLOY_STATE="$PROJECT_DIR/.deploy-demo.json"
ENV_FILE="$PROJECT_DIR/.env.compose"
CREDENTIALS_FILE="$PROJECT_DIR/deployment-info.txt"

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

# =============================================================================
# Validation
# =============================================================================

if [[ ! -f "$DEPLOY_STATE" ]]; then
    log_error "Deployment state file not found: $DEPLOY_STATE"
    log_info "No demo deployment found. Nothing to teardown."
    exit 0
fi

# Parse deployment state
REGION=$(jq -r '.region' "$DEPLOY_STATE")
INSTANCE_ID=$(jq -r '.instanceId' "$DEPLOY_STATE")
SG_ID=$(jq -r '.securityGroupId' "$DEPLOY_STATE")
SG_NAME=$(jq -r '.securityGroupName' "$DEPLOY_STATE")
KEY_NAME=$(jq -r '.keyName' "$DEPLOY_STATE")
KEY_FILE=$(jq -r '.keyFile' "$DEPLOY_STATE")
PUBLIC_IP=$(jq -r '.publicIp' "$DEPLOY_STATE")

# =============================================================================
# Confirmation
# =============================================================================

echo "================================================================================"
echo -e "${RED}Demo Deployment Teardown${NC}"
echo "================================================================================"
echo ""
echo "This will destroy the following resources:"
echo "  Region:           $REGION"
echo "  Instance ID:      $INSTANCE_ID"
echo "  Public IP:        $PUBLIC_IP"
echo "  Security Group:   $SG_NAME ($SG_ID)"
echo "  Key Pair:         $KEY_NAME"
echo ""
echo -e "${YELLOW}⚠️  This action cannot be undone!${NC}"
echo ""
read -p "Are you sure you want to continue? (yes/NO): " -r
echo ""

if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    log_info "Teardown cancelled."
    exit 0
fi

# =============================================================================
# Terminate EC2 Instance
# =============================================================================

if [[ -n "$INSTANCE_ID" && "$INSTANCE_ID" != "null" ]]; then
    log_info "Terminating EC2 instance: $INSTANCE_ID"

    # Check if instance exists
    if aws ec2 describe-instances \
        --region "$REGION" \
        --instance-ids "$INSTANCE_ID" \
        --query 'Reservations[0].Instances[0].State.Name' \
        --output text 2>/dev/null | grep -qv "terminated"; then

        aws ec2 terminate-instances \
            --region "$REGION" \
            --instance-ids "$INSTANCE_ID" \
            >/dev/null 2>&1

        log_info "Waiting for instance to terminate..."
        aws ec2 wait instance-terminated \
            --region "$REGION" \
            --instance-ids "$INSTANCE_ID" \
            2>/dev/null || true

        log_success "Instance terminated"
    else
        log_warning "Instance already terminated or doesn't exist"
    fi
else
    log_warning "No instance ID found in state"
fi

# =============================================================================
# Delete Security Group
# =============================================================================

if [[ -n "$SG_ID" && "$SG_ID" != "null" ]]; then
    log_info "Deleting security group: $SG_ID"

    # Wait a bit for network interfaces to detach
    sleep 5

    if aws ec2 delete-security-group \
        --region "$REGION" \
        --group-id "$SG_ID" \
        >/dev/null 2>&1; then
        log_success "Security group deleted"
    else
        log_warning "Failed to delete security group (may have dependent resources)"
        log_info "You can manually delete it later from the AWS console"
    fi
else
    log_warning "No security group ID found in state"
fi

# =============================================================================
# Delete Key Pair
# =============================================================================

if [[ -n "$KEY_NAME" && "$KEY_NAME" != "null" ]]; then
    log_info "Deleting key pair: $KEY_NAME"

    if aws ec2 delete-key-pair \
        --region "$REGION" \
        --key-name "$KEY_NAME" \
        >/dev/null 2>&1; then
        log_success "Key pair deleted from AWS"
    else
        log_warning "Failed to delete key pair from AWS (may not exist)"
    fi

    # Remove local key file
    if [[ -f "$KEY_FILE" ]]; then
        rm -f "$KEY_FILE"
        log_success "Local key file removed: $KEY_FILE"
    fi
else
    log_warning "No key pair name found in state"
fi

# =============================================================================
# Clean Up Local Files
# =============================================================================

log_info "Cleaning up local files..."

# Remove deployment state
if [[ -f "$DEPLOY_STATE" ]]; then
    rm -f "$DEPLOY_STATE"
    log_success "Removed deployment state: $DEPLOY_STATE"
fi

# Remove environment file
if [[ -f "$ENV_FILE" ]]; then
    rm -f "$ENV_FILE"
    log_success "Removed environment file: $ENV_FILE"
fi

# Remove credentials file
if [[ -f "$CREDENTIALS_FILE" ]]; then
    rm -f "$CREDENTIALS_FILE"
    log_success "Removed credentials file: $CREDENTIALS_FILE"
fi

# =============================================================================
# Summary
# =============================================================================

echo ""
echo "================================================================================"
echo -e "${GREEN}✓ Teardown Complete!${NC}"
echo "================================================================================"
echo ""
log_success "All demo deployment resources have been removed."
echo ""
log_info "You can deploy again by running:"
echo "  ./scripts/deploy-demo.sh"
echo ""
