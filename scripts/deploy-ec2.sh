#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# OPC UA Backend - EC2 Instance Deployment Script
# =============================================================================
# Run this script directly on your EC2 instance to deploy everything.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/tutuCH/opcua-backend/master/scripts/deploy-ec2.sh | bash
#
# Or manually:
#   wget https://raw.githubusercontent.com/tutuCH/opcua-backend/master/scripts/deploy-ec2.sh
#   chmod +x deploy-ec2.sh
#   ./deploy-ec2.sh
# =============================================================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REPO_URL=${REPO_URL:-https://github.com/tutuCH/opcua-backend.git}
INSTALL_DIR="/opt/app"
APP_DIR="$INSTALL_DIR/src"

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
    openssl rand -base64 "$((length * 2))" | tr -dc 'A-Za-z0-9' | head -c "$length"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# =============================================================================
# Main Deployment
# =============================================================================

echo ""
echo "================================================================================"
echo -e "${GREEN}OPC UA Backend - EC2 Deployment${NC}"
echo "================================================================================"
echo ""

# Get public IP
log_info "Detecting EC2 public IP..."
PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "localhost")
log_success "Public IP: $PUBLIC_IP"

# Step 1: Install Docker
log_info "Installing Docker and dependencies..."

if ! command_exists docker; then
    sudo apt-get update
    sudo apt-get install -y docker.io docker-compose-v2 git curl openssl
    sudo systemctl enable docker
    sudo systemctl start docker
    log_success "Docker installed successfully"
else
    log_success "Docker already installed"
fi

# Verify Docker is running
if ! sudo docker info >/dev/null 2>&1; then
    log_error "Docker is not running. Please start Docker and try again."
    exit 1
fi

# Step 2: Clone Repository
log_info "Setting up application directory..."

if [ -d "$APP_DIR" ]; then
    log_warning "Directory $APP_DIR already exists. Backing up..."
    sudo mv "$APP_DIR" "${APP_DIR}.backup.$(date +%Y%m%d_%H%M%S)"
fi

sudo mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

log_info "Cloning repository from $REPO_URL..."
sudo git clone "$REPO_URL" src
cd "$APP_DIR"
log_success "Repository cloned successfully"

# Step 3: Generate Secrets
log_info "Generating secure credentials..."

POSTGRES_PW=$(generate_secret 32)
REDIS_PW=$(generate_secret 32)
INFLUX_PW=$(generate_secret 32)
INFLUX_TOKEN=$(generate_secret 64)
JWT_SECRET=$(generate_secret 64)

log_success "Credentials generated"

# Step 4: Create Environment File
log_info "Creating environment configuration..."

cat > /tmp/.env.compose <<EOF
# Node Environment
NODE_ENV=production

# Frontend Configuration
FRONTEND_URL=http://$PUBLIC_IP

# Database Configuration (PostgreSQL)
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=$POSTGRES_PW
POSTGRES_DB=opcua_dashboard

# Redis Configuration
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=$REDIS_PW

# InfluxDB Configuration
INFLUXDB_URL=http://influxdb:8086
INFLUXDB_TOKEN=$INFLUX_TOKEN
INFLUXDB_ORG=opcua-org
INFLUXDB_BUCKET=machine-data
INFLUXDB_ADMIN_USER=admin
INFLUXDB_ADMIN_PASSWORD=$INFLUX_PW
INFLUXDB_RETENTION=1h

# JWT Configuration
JWT_SECRET=$JWT_SECRET
JWT_EXPIRATION=7d

# MQTT Configuration
MQTT_BROKER_URL=mqtt://mosquitto:1883
MQTT_USERNAME=
MQTT_PASSWORD=

# Mock Data (DISABLED for production machines)
ENABLE_MOCK_DATA=false

# AWS Configuration (Optional - leave empty for demo)
AWS_REGION=
AWS_COGNITO_USER_POOL_ID=
AWS_COGNITO_CLIENT_ID=
AWS_IOT_ENDPOINT=
TIMESTREAM_DATABASE_NAME=
TIMESTREAM_TABLE_NAME=

# Stripe Configuration (Optional)
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
EOF

sudo mv /tmp/.env.compose "$APP_DIR/.env.compose"
log_success "Environment file created"

# Step 5: Create Fixed docker-compose.yml
log_info "Creating docker-compose.yml..."

sudo tee "$APP_DIR/docker-compose.yml" > /dev/null <<'EOF'
version: '3.9'

services:
  backend:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: opcua-backend
    env_file:
      - .env.compose
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      influxdb:
        condition: service_healthy
      mosquitto:
        condition: service_healthy
    ports:
      - "80:3000"
      - "3000:3000"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s

  postgres:
    image: postgres:14-alpine
    container_name: opcua-postgres
    env_file:
      - .env.compose
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: opcua-redis
    env_file:
      - .env.compose
    command: sh -c "redis-server --requirepass $$REDIS_PASSWORD --appendonly yes"
    volumes:
      - redis_data:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

  influxdb:
    image: influxdb:2.7
    container_name: opcua-influxdb
    env_file:
      - .env.compose
    environment:
      DOCKER_INFLUXDB_INIT_MODE: setup
      DOCKER_INFLUXDB_INIT_USERNAME: ${INFLUXDB_ADMIN_USER}
      DOCKER_INFLUXDB_INIT_PASSWORD: ${INFLUXDB_ADMIN_PASSWORD}
      DOCKER_INFLUXDB_INIT_ORG: ${INFLUXDB_ORG}
      DOCKER_INFLUXDB_INIT_BUCKET: ${INFLUXDB_BUCKET}
      DOCKER_INFLUXDB_INIT_ADMIN_TOKEN: ${INFLUXDB_TOKEN}
      DOCKER_INFLUXDB_INIT_RETENTION: 1h
    volumes:
      - influxdb_data:/var/lib/influxdb2
      - influxdb_config:/etc/influxdb2
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8086/ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  mosquitto:
    image: eclipse-mosquitto:2
    container_name: opcua-mosquitto
    ports:
      - "1883:1883"
      - "9001:9001"
    volumes:
      - mosquitto_data:/mosquitto/data
      - mosquitto_log:/mosquitto/log
      - ./demoMqttServer/mosquitto/config:/mosquitto/config
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "mosquitto_pub -h localhost -t test -m 'health check' || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
  redis_data:
  influxdb_data:
  influxdb_config:
  mosquitto_data:
  mosquitto_log:
EOF

log_success "docker-compose.yml created"

# Step 6: Save Credentials
log_info "Saving deployment credentials..."

sudo tee "$INSTALL_DIR/deployment-credentials.txt" > /dev/null <<EOF
=================================================================
OPC UA Backend Deployment Credentials
=================================================================
Generated: $(date)

PostgreSQL:
  Host: postgres (internal)
  Port: 5432
  User: postgres
  Password: $POSTGRES_PW
  Database: opcua_dashboard

Redis:
  Host: redis (internal)
  Port: 6379
  Password: $REDIS_PW

InfluxDB:
  URL: http://influxdb:8086
  Organization: opcua-org
  Bucket: machine-data
  Username: admin
  Password: $INFLUX_PW
  Token: $INFLUX_TOKEN

JWT:
  Secret: $JWT_SECRET
  Expiration: 7d

Access URLs:
  Public IP: $PUBLIC_IP
  API Endpoint: http://$PUBLIC_IP:3000
  Health Check: http://$PUBLIC_IP:3000/health
  WebSocket: ws://$PUBLIC_IP:3000/socket.io/

ELINK Gateway Configuration:
  MQTT Server: $PUBLIC_IP
  Port: 1883
  Protocol: MQTT (unencrypted)
  Authentication: None (anonymous)

Management Commands:
  View logs: cd $APP_DIR && sudo docker compose logs -f
  Restart: cd $APP_DIR && sudo docker compose restart
  Stop: cd $APP_DIR && sudo docker compose down
  Start: cd $APP_DIR && sudo docker compose up -d

=================================================================
⚠️  IMPORTANT: Keep this file secure!
=================================================================
EOF

log_success "Credentials saved to: $INSTALL_DIR/deployment-credentials.txt"

# Step 7: Build and Deploy
log_info "Building Docker images (this may take 3-5 minutes)..."
cd "$APP_DIR"
sudo docker compose build backend

log_info "Starting all services..."
sudo docker compose up -d

# Step 8: Wait for Services
log_info "Waiting for services to start (30 seconds)..."
sleep 30

# Step 9: Verify Deployment
log_info "Verifying deployment..."
sudo docker compose ps

echo ""
log_info "Testing health endpoint..."
if curl -f -s http://localhost:3000/health > /dev/null 2>&1; then
    HEALTH_RESPONSE=$(curl -s http://localhost:3000/health)
    echo "$HEALTH_RESPONSE" | jq . 2>/dev/null || echo "$HEALTH_RESPONSE"
    log_success "Backend is healthy!"
else
    log_warning "Health check failed. Services may still be starting..."
    log_warning "Check logs with: cd $APP_DIR && sudo docker compose logs backend"
fi

# Step 10: Output Summary
echo ""
echo "================================================================================"
echo -e "${GREEN}✓ Deployment Complete!${NC}"
echo "================================================================================"
echo ""
echo -e "${BLUE}🌐 API Endpoint:${NC}     http://$PUBLIC_IP:3000"
echo -e "${BLUE}🏥 Health Check:${NC}     http://$PUBLIC_IP:3000/health"
echo -e "${BLUE}🔌 MQTT Broker:${NC}      $PUBLIC_IP:1883"
echo ""
echo -e "${BLUE}📝 Credentials:${NC}      $INSTALL_DIR/deployment-credentials.txt"
echo -e "${BLUE}📂 App Directory:${NC}    $APP_DIR"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "  1. View credentials: cat $INSTALL_DIR/deployment-credentials.txt"
echo "  2. Configure ELINK gateway to connect to: $PUBLIC_IP:1883"
echo "  3. Monitor logs: cd $APP_DIR && sudo docker compose logs -f"
echo ""
echo "================================================================================"
echo ""
