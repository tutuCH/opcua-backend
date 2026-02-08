#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# OPC UA Backend - One-Script AWS EC2 Demo Deployment
# =============================================================================
# Deploys all services (PostgreSQL, InfluxDB, Redis, MQTT, NestJS) to a single
# EC2 instance with auto-generated secure credentials.
#
# Usage: ./scripts/deploy-demo.sh [region] [instance-type]
# Example: ./scripts/deploy-demo.sh us-east-1 t3.medium
#
# Requirements:
# - AWS CLI installed and configured
# - jq, base64 utilities available
# =============================================================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REGION=${1:-us-east-1}
INSTANCE_TYPE=${2:-t3.small}
KEY_NAME="opcua-demo-key"
SG_NAME="opcua-demo-sg"
INSTANCE_NAME="opcua-demo-backend"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEPLOY_STATE="$PROJECT_DIR/.deploy-demo.json"
ENV_TEMPLATE="$PROJECT_DIR/.env.compose.template"
ENV_FILE="$PROJECT_DIR/.env.compose"
CREDENTIALS_FILE="$PROJECT_DIR/deployment-info.txt"
KEY_FILE="$PROJECT_DIR/${KEY_NAME}.pem"

# Repository configuration
REPO_URL=${REPO_URL:-https://github.com/tutuCH/opcua-backend.git}

# =============================================================================
# Helper Functions
# =============================================================================

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

# Generate cryptographically secure random string
generate_secret() {
    local length=$1
    # Use openssl for better compatibility across platforms
    openssl rand -base64 "$((length * 2))" | tr -dc 'A-Za-z0-9' | head -c "$length"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# =============================================================================
# Validation
# =============================================================================

log_info "Validating prerequisites..."

# Check AWS CLI
if ! command_exists aws; then
    log_error "AWS CLI not found. Please install and run 'aws configure'."
    exit 1
fi

# Check jq
if ! command_exists jq; then
    log_error "jq not found. Please install jq (https://stedolan.github.io/jq/)."
    exit 1
fi

# Check AWS credentials
if ! aws sts get-caller-identity >/dev/null 2>&1; then
    log_error "AWS credentials not configured. Run 'aws configure'."
    exit 1
fi

# Check for conflicting deployments
if [[ -f "$DEPLOY_STATE" ]]; then
    log_warning "Found existing deployment state file: $DEPLOY_STATE"
    log_warning "A deployment may already exist. Run './scripts/teardown-demo.sh' first."
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Deployment cancelled."
        exit 0
    fi
fi

log_success "Prerequisites validated"

# =============================================================================
# Generate Secrets
# =============================================================================

log_info "Generating secure credentials..."

POSTGRES_PASSWORD=$(generate_secret 32)
REDIS_PASSWORD=$(generate_secret 32)
INFLUXDB_PASSWORD=$(generate_secret 32)
INFLUXDB_TOKEN=$(generate_secret 64)
JWT_SECRET=$(generate_secret 64)

log_success "Credentials generated"

# =============================================================================
# Create Environment File
# =============================================================================

log_info "Creating environment configuration..."

if [[ ! -f "$ENV_TEMPLATE" ]]; then
    log_error "Template file not found: $ENV_TEMPLATE"
    exit 1
fi

# Read template and replace placeholders
sed -e "s|{{AUTO_GENERATED_JWT_SECRET}}|$JWT_SECRET|g" \
    -e "s|{{AUTO_GENERATED_POSTGRES_PASSWORD}}|$POSTGRES_PASSWORD|g" \
    -e "s|{{AUTO_GENERATED_REDIS_PASSWORD}}|$REDIS_PASSWORD|g" \
    -e "s|{{AUTO_GENERATED_INFLUXDB_PASSWORD}}|$INFLUXDB_PASSWORD|g" \
    -e "s|{{AUTO_GENERATED_INFLUXDB_TOKEN}}|$INFLUXDB_TOKEN|g" \
    "$ENV_TEMPLATE" > "$ENV_FILE"

log_success "Environment file created: $ENV_FILE"

# =============================================================================
# AWS Infrastructure Setup
# =============================================================================

log_info "Setting up AWS infrastructure in $REGION..."

# Get default VPC
VPC_ID=$(aws ec2 describe-vpcs \
    --region "$REGION" \
    --filters Name=isDefault,Values=true \
    --query 'Vpcs[0].VpcId' \
    --output text)

if [[ -z "$VPC_ID" || "$VPC_ID" == "None" ]]; then
    log_error "Could not find default VPC in $REGION"
    exit 1
fi

log_success "Using default VPC: $VPC_ID"

# Create or reuse security group
SG_ID=$(aws ec2 describe-security-groups \
    --region "$REGION" \
    --filters Name=group-name,Values="$SG_NAME" Name=vpc-id,Values="$VPC_ID" \
    --query 'SecurityGroups[0].GroupId' \
    --output text 2>/dev/null || echo "")

if [[ -z "$SG_ID" || "$SG_ID" == "None" ]]; then
    SG_ID=$(aws ec2 create-security-group \
        --region "$REGION" \
        --group-name "$SG_NAME" \
        --description "OPC UA Demo Backend Security Group" \
        --vpc-id "$VPC_ID" \
        --query 'GroupId' \
        --output text)
    log_success "Created security group: $SG_ID"
else
    log_success "Using existing security group: $SG_ID"
fi

# Add ingress rules (idempotent - errors are expected if rules exist)
set +e
aws ec2 authorize-security-group-ingress \
    --region "$REGION" \
    --group-id "$SG_ID" \
    --protocol tcp \
    --port 22 \
    --cidr 0.0.0.0/0 \
    >/dev/null 2>&1

aws ec2 authorize-security-group-ingress \
    --region "$REGION" \
    --group-id "$SG_ID" \
    --protocol tcp \
    --port 80 \
    --cidr 0.0.0.0/0 \
    >/dev/null 2>&1

aws ec2 authorize-security-group-ingress \
    --region "$REGION" \
    --group-id "$SG_ID" \
    --protocol tcp \
    --port 3000 \
    --cidr 0.0.0.0/0 \
    >/dev/null 2>&1

aws ec2 authorize-security-group-ingress \
    --region "$REGION" \
    --group-id "$SG_ID" \
    --protocol tcp \
    --port 1883 \
    --cidr 0.0.0.0/0 \
    >/dev/null 2>&1

aws ec2 authorize-security-group-ingress \
    --region "$REGION" \
    --group-id "$SG_ID" \
    --protocol tcp \
    --port 9001 \
    --cidr 0.0.0.0/0 \
    >/dev/null 2>&1
set -e

log_success "Security group rules configured (SSH:22, HTTP:80, API:3000, MQTT:1883/9001)"

# Create or reuse key pair
if aws ec2 describe-key-pairs --region "$REGION" --key-names "$KEY_NAME" >/dev/null 2>&1; then
    if [[ ! -f "$KEY_FILE" ]]; then
        log_error "Key pair '$KEY_NAME' exists in AWS but $KEY_FILE not found locally."
        log_error "Please delete the AWS key pair or provide the local .pem file."
        exit 1
    fi
    log_success "Using existing key pair: $KEY_NAME"
else
    log_info "Creating new key pair: $KEY_NAME"
    aws ec2 create-key-pair \
        --region "$REGION" \
        --key-name "$KEY_NAME" \
        --query 'KeyMaterial' \
        --output text > "$KEY_FILE"
    chmod 400 "$KEY_FILE"
    log_success "Saved private key to: $KEY_FILE"
fi

# Resolve AMI and Subnet
AMI_ID=$(aws ssm get-parameters \
    --region "$REGION" \
    --names /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-6.1-x86_64 \
    --query 'Parameters[0].Value' \
    --output text)

SUBNET_ID=$(aws ec2 describe-subnets \
    --region "$REGION" \
    --filters Name=vpc-id,Values="$VPC_ID" \
    --query 'Subnets[0].SubnetId' \
    --output text)

log_success "Using AMI: $AMI_ID"
log_success "Using Subnet: $SUBNET_ID"

# =============================================================================
# Generate User Data Script
# =============================================================================

log_info "Generating EC2 user data script..."

ENV_B64=$(base64 < "$ENV_FILE" | tr -d '\n')

USER_DATA=$(cat <<UDEOF
#!/bin/bash -xe
exec > >(tee /var/log/user-data.log|logger -t user-data -s 2>/dev/console) 2>&1

echo "Starting OPC UA Backend deployment..."

# Update system and install Docker
dnf update -y
dnf install -y docker git

# Start Docker
systemctl enable docker
systemctl start docker

# Install Docker Compose v2
DOCKER_CONFIG=\${DOCKER_CONFIG:-/usr/local/lib/docker}
mkdir -p \$DOCKER_CONFIG/cli-plugins
curl -SL https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-linux-x86_64 -o \$DOCKER_CONFIG/cli-plugins/docker-compose
chmod +x \$DOCKER_CONFIG/cli-plugins/docker-compose
ln -sf \$DOCKER_CONFIG/cli-plugins/docker-compose /usr/local/bin/docker-compose

# Clone repository
mkdir -p /opt/app
cd /opt/app
if [ -d "src" ]; then
    cd src && git pull
else
    git clone "$REPO_URL" src
    cd src
fi

# Create environment file
echo "$ENV_B64" | base64 -d > .env.compose

# Update docker-compose.yml to use .env.compose
ln -sf .env.compose .env 2>/dev/null || true

# Build and start services
echo "Building Docker images..."
docker compose version
docker compose pull || true
docker compose build --no-cache backend

echo "Starting services..."
docker compose up -d

echo "Deployment complete. Waiting for services to be healthy..."
sleep 30

# Show status
docker compose ps
echo "User data script completed successfully"
UDEOF
)

log_success "User data script generated"

# =============================================================================
# Launch EC2 Instance
# =============================================================================

log_info "Launching EC2 instance ($INSTANCE_TYPE in $REGION)..."

INSTANCE_ID=$(aws ec2 run-instances \
    --region "$REGION" \
    --image-id "$AMI_ID" \
    --instance-type "$INSTANCE_TYPE" \
    --key-name "$KEY_NAME" \
    --security-group-ids "$SG_ID" \
    --subnet-id "$SUBNET_ID" \
    --user-data "$USER_DATA" \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$INSTANCE_NAME}]" \
    --query 'Instances[0].InstanceId' \
    --output text)

log_success "Instance launched: $INSTANCE_ID"

log_info "Waiting for instance to be running..."
aws ec2 wait instance-running --region "$REGION" --instance-ids "$INSTANCE_ID"

PUBLIC_IP=$(aws ec2 describe-instances \
    --region "$REGION" \
    --instance-ids "$INSTANCE_ID" \
    --query 'Reservations[0].Instances[0].PublicIpAddress' \
    --output text)

log_success "Instance running with public IP: $PUBLIC_IP"

# =============================================================================
# Wait for Services
# =============================================================================

log_info "Waiting for services to start (this may take 3-5 minutes)..."
echo -n "   "

HEALTH_URL="http://$PUBLIC_IP/health"
MAX_ATTEMPTS=40
ATTEMPT=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    ATTEMPT=$((ATTEMPT + 1))

    if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
        echo ""
        log_success "Services are healthy!"
        break
    fi

    echo -n "."
    sleep 10

    if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
        echo ""
        log_error "Timed out waiting for health endpoint after $((MAX_ATTEMPTS * 10)) seconds"
        log_warning "The services may still be starting. Check logs:"
        log_warning "  ssh -i $KEY_FILE ec2-user@$PUBLIC_IP"
        log_warning "  cd /opt/app/src && sudo docker compose logs --tail 200"
        exit 1
    fi
done

# =============================================================================
# Save Deployment State
# =============================================================================

log_info "Saving deployment state..."

cat > "$DEPLOY_STATE" <<EOF
{
  "region": "$REGION",
  "instanceType": "$INSTANCE_TYPE",
  "instanceId": "$INSTANCE_ID",
  "publicIp": "$PUBLIC_IP",
  "securityGroupId": "$SG_ID",
  "securityGroupName": "$SG_NAME",
  "keyName": "$KEY_NAME",
  "keyFile": "$KEY_FILE",
  "vpcId": "$VPC_ID",
  "subnetId": "$SUBNET_ID",
  "amiId": "$AMI_ID",
  "deployedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

log_success "Deployment state saved to: $DEPLOY_STATE"

# =============================================================================
# Save Credentials
# =============================================================================

cat > "$CREDENTIALS_FILE" <<EOF
================================================================================
OPC UA Backend Demo - Deployment Credentials
================================================================================
Generated: $(date)

DEPLOYMENT INFO:
  Region:           $REGION
  Instance ID:      $INSTANCE_ID
  Instance Type:    $INSTANCE_TYPE
  Public IP:        $PUBLIC_IP

ACCESS URLS:
  API Endpoint:     http://$PUBLIC_IP/
  Health Check:     http://$PUBLIC_IP/health
  WebSocket:        ws://$PUBLIC_IP/socket.io/

SSH ACCESS:
  Command:          ssh -i $KEY_FILE ec2-user@$PUBLIC_IP
  Key File:         $KEY_FILE

GENERATED CREDENTIALS (KEEP SECURE):
  PostgreSQL:
    Host:           postgres (internal)
    Port:           5432
    User:           postgres
    Password:       $POSTGRES_PASSWORD
    Database:       opcua_dashboard

  Redis:
    Host:           redis (internal)
    Port:           6379
    Password:       $REDIS_PASSWORD

  InfluxDB:
    URL:            http://influxdb:8086
    Organization:   opcua-org
    Bucket:         machine-data
    Username:       admin
    Password:       $INFLUXDB_PASSWORD
    Token:          $INFLUXDB_TOKEN

  JWT Secret:       $JWT_SECRET

DOCKER MANAGEMENT:
  SSH to instance:  ssh -i $KEY_FILE ec2-user@$PUBLIC_IP
  View services:    cd /opt/app/src && sudo docker compose ps
  View logs:        cd /opt/app/src && sudo docker compose logs -f
  Restart:          cd /opt/app/src && sudo docker compose restart
  Stop:             cd /opt/app/src && sudo docker compose down

CLEANUP:
  Run:              ./scripts/teardown-demo.sh

================================================================================
⚠️  IMPORTANT: Keep this file secure - it contains sensitive credentials!
================================================================================
EOF

log_success "Credentials saved to: $CREDENTIALS_FILE"

# =============================================================================
# Output Summary
# =============================================================================

echo ""
echo "================================================================================"
echo -e "${GREEN}✓ Deployment Successful!${NC}"
echo "================================================================================"
echo ""
echo -e "${BLUE}🌐 API Endpoint:${NC}     http://$PUBLIC_IP/"
echo -e "${BLUE}🏥 Health Check:${NC}     http://$PUBLIC_IP/health"
echo -e "${BLUE}🔌 WebSocket:${NC}        ws://$PUBLIC_IP/socket.io/"
echo ""
echo -e "${BLUE}🔑 SSH Access:${NC}"
echo "   ssh -i $KEY_FILE ec2-user@$PUBLIC_IP"
echo ""
echo -e "${YELLOW}📝 Credentials saved to:${NC} $CREDENTIALS_FILE"
echo -e "${YELLOW}⚠️  Keep this file secure - it contains passwords!${NC}"
echo ""
echo "================================================================================"
echo ""

log_info "Testing health endpoint..."
HEALTH_RESPONSE=$(curl -s "$HEALTH_URL")
echo "$HEALTH_RESPONSE" | jq . 2>/dev/null || echo "$HEALTH_RESPONSE"
echo ""

log_success "Deployment complete! Your OPC UA backend is ready."
echo ""
