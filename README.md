# OPCUA IoT Backend

A NestJS-based backend for plastic injection molding machine monitoring and analytics with real-time data ingestion, WebSocket updates, and time-series storage.

## 🚀 Quick Start

### Local Development (Recommended)

```bash
# 1. Clone repository
git clone <your-repo-url>
cd opcua-backend

# 2. Copy environment template
cp .env.compose.template .env.compose

# 3. Generate secure secrets (see .env.compose.template for commands)
# Edit .env.compose and replace REPLACE_WITH_* placeholders

# 4. Start all services
docker-compose up -d

# 5. Verify deployment
curl http://localhost:3000/health
```

**Access**:
- Backend API: http://localhost:3000
- Health Check: http://localhost:3000/health
- InfluxDB UI: http://localhost:8086
- MQTT Broker: mqtt://localhost:1883

**Cost**: $0/month

---

## 📖 Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
  - [Local Development](#local-development)
  - [AWS Deployment](#aws-deployment)
- [Project Structure](#project-structure)
- [Development](#development)
- [Deployment Environments](#deployment-environments)
- [Documentation](#documentation)
- [Support](#support)

---

## ✨ Features

### Core Functionality
- ✅ **Real-time MQTT ingestion** from 50-100+ injection molding machines
- ✅ **WebSocket broadcasts** for live dashboard updates (<100ms latency)
- ✅ **Time-series storage** with InfluxDB (30-day retention)
- ✅ **Multi-tenant architecture** with user ownership guards
- ✅ **JWT authentication** with email/password
- ✅ **Stripe integration** for subscription billing
- ✅ **Historical data API** with pagination and aggregation
- ✅ **Mock data generation** for testing and demos

### Data Pipeline
```
MQTT Devices → Mosquitto Broker → NestJS Processor → Redis Queues →
InfluxDB + PostgreSQL → WebSocket Gateway → Frontend Clients
```

### Tech Stack
- **Backend**: NestJS (TypeScript)
- **Databases**: PostgreSQL (metadata), InfluxDB (time-series), Redis (cache/queues)
- **Message Broker**: Mosquitto MQTT
- **Real-time**: Socket.IO WebSocket
- **Deployment**: Docker Compose, AWS CDK
- **Cloud**: AWS EC2 (optional)

---

## 🏗️ Architecture

### Service Overview

| Service | Purpose | Port | Storage |
|---------|---------|------|---------|
| **Backend** | NestJS API server | 3000 | - |
| **PostgreSQL** | User, factory, machine metadata | 5432 | Persistent |
| **InfluxDB** | Time-series data (realtime, SPC) | 8086 | 30-day retention |
| **Redis** | MQTT queues, caching, pub/sub | 6379 | Persistent |
| **Mosquitto** | MQTT broker for device data | 1883, 9001 | - |

### Data Flow

1. **Ingestion**: Machines send MQTT messages every 10 seconds
2. **Queuing**: Redis stores messages by topic (realtime, SPC, tech)
3. **Processing**: NestJS validates timestamps and extracts data
4. **Storage**: InfluxDB stores time-series, PostgreSQL stores metadata
5. **Broadcasting**: Redis pub/sub triggers WebSocket updates
6. **Frontend**: Clients receive real-time updates via Socket.IO

---

## 🎯 Getting Started

### Prerequisites

- **Docker Desktop** (20.10+) with Docker Compose v2
- **Node.js** (18+) for development
- **Git** for version control

Optional for AWS deployment:
- AWS account with billing enabled
- AWS CLI configured
- AWS CDK installed (`npm install -g aws-cdk`)

### Local Development

Perfect for development, testing, and frontend integration.

#### 1. Clone and Setup

```bash
git clone <your-repo-url>
cd opcua-backend

# Copy environment templates
cp .env.compose.template .env.compose
cp .env.local.example .env.local
```

#### 2. Configure Environment

Edit `.env.compose` to set your preferences:

```bash
# Enable mock data for testing (simulates 10 machines)
ENABLE_MOCK_DATA=true

# Generate secure secrets
JWT_SECRET=$(openssl rand -base64 48)
POSTGRES_PASSWORD=$(openssl rand -base64 24)
REDIS_PASSWORD=$(openssl rand -base64 24)
INFLUXDB_TOKEN=$(openssl rand -base64 48)

# Update .env.compose with generated values
```

See [Environment Configuration](#environment-configuration) for all options.

#### 3. Start Services

```bash
# Start all services in background
docker-compose up -d

# View logs
docker-compose logs -f backend

# Check status
docker-compose ps
```

#### 4. Verify Deployment

```bash
# Health check
curl http://localhost:3000/health

# Expected: {"status":"ok","timestamp":"..."}

# Check mock data (if enabled)
curl http://localhost:3000/machines

# Test MQTT publishing
mosquitto_pub -h localhost -p 1883 \
  -t factory/test/machine/test-001/realtime \
  -m '{"timestamp": 1234567890, "oil_temp": 45.5}'
```

#### 5. Access Services

| Service | URL | Default Credentials |
|---------|-----|---------------------|
| Backend API | http://localhost:3000 | - |
| API Docs | http://localhost:3000/api | - |
| Health Check | http://localhost:3000/health | - |
| InfluxDB UI | http://localhost:8086 | See .env.compose |
| MQTT Broker | mqtt://localhost:1883 | Anonymous (dev only) |

#### 6. Development Mode

```bash
# Install dependencies
npm install

# Run in watch mode (auto-reload)
npm run start:dev

# Run tests
npm run test

# Lint and format
npm run lint
npm run format
```

### AWS Deployment

Deploy to AWS for production or testing with real machines.

#### Quick Deploy

```bash
# 1. Configure AWS
aws configure

# 2. Deploy with testing configuration (1-10 machines, $18/month)
cd infrastructure
DEPLOY_ENV=testing ./deploy.sh

# 3. Get your static IP
./scripts/manage-instance.sh ip
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for complete AWS deployment guide.

---

## 📁 Project Structure

```
opcua-backend/
├── src/
│   ├── auth/              # JWT authentication, Cognito integration
│   ├── factories/         # Factory management
│   ├── machines/          # Machine registration, status, history
│   ├── mqtt-processor/    # MQTT message processing pipeline
│   ├── influxdb/          # Time-series database service
│   ├── redis/             # Cache and message queue service
│   ├── subscription/      # Stripe billing integration
│   ├── websocket/         # Socket.IO WebSocket gateway
│   ├── mock-data/         # Mock data generation for testing
│   ├── user/              # User management
│   └── main.ts            # Application entry point
├── infrastructure/        # AWS CDK deployment
│   ├── bin/               # CDK app entry point
│   ├── lib/               # CDK stack definitions
│   ├── scripts/           # Instance management scripts
│   └── deploy.sh          # One-command deployment
├── demoMqttServer/        # Docker Compose for local services
├── docs/                  # Additional documentation
├── docker-compose.yml     # Local development services
├── .env.compose          # Docker Compose environment
├── DEPLOYMENT.md          # Full deployment guide
└── README.md              # This file
```

### Key Directories

- **`src/mqtt-processor/`**: Core data ingestion pipeline
  - MQTT client connection
  - Message validation and queueing
  - Timestamp age validation (prevents InfluxDB retention violations)

- **`src/websocket/`**: Real-time update broadcasting
  - Socket.IO gateway
  - Redis pub/sub integration
  - Room-based subscriptions

- **`src/machines/`**: Machine management and history
  - REST endpoints for historical data
  - Pagination and aggregation
  - User ownership validation

- **`infrastructure/`**: AWS deployment
  - CDK stacks for EC2, VPC, Security Groups
  - Phased deployment (planning/testing/production)
  - Instance management scripts

---

## 🛠️ Development

### Available Commands

```bash
# Development
npm run start:dev        # Watch mode with hot reload
npm run start:debug      # Debug mode with inspector

# Testing
npm run test             # Unit tests
npm run test:watch       # Watch mode
npm run test:e2e         # End-to-end tests
npm run test:cov         # Test coverage

# Code Quality
npm run lint             # ESLint check
npm run format           # Prettier format

# Database
npm run typeorm          # TypeORM CLI
npm run migration:run    # Run migrations

# Demo Environment
npm run demo:setup       # Copy demo .env
npm run demo:start       # Start all demo containers
npm run demo:stop        # Stop all containers
npm run demo:dev         # Setup + start + dev mode
```

### Environment Configuration

**📖 For detailed environment configuration guide, see [docs/ENVIRONMENT_CONFIGURATION.md](./docs/ENVIRONMENT_CONFIGURATION.md)**

Key environment variables in `.env.compose`:

```bash
# Backend
NODE_ENV=development|production
PORT=3000
FRONTEND_URL=http://localhost:3030

# Authentication
JWT_SECRET=<random-48-byte-base64>

# Mock Data
ENABLE_MOCK_DATA=true|false  # Simulate 10 machines

# PostgreSQL
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<random-password>
POSTGRES_DB=opcua_dashboard

# InfluxDB
INFLUXDB_URL=http://influxdb:8086
INFLUXDB_ORG=opcua-org
INFLUXDB_BUCKET=machine-data
INFLUXDB_TOKEN=<random-64-byte-base64>

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=<random-password>

# MQTT
MQTT_BROKER_URL=mqtt://mosquitto:1883

# Stripe (Optional)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Mock Data

Enable mock data for development and testing:

```bash
# In .env.compose
ENABLE_MOCK_DATA=true
```

This simulates:
- 10 injection molding machines across 2 factories
- Realtime data every 5 seconds (oil temp, barrel temps, status)
- SPC data every 30-60 seconds (cycle data, injection metrics)
- Tech data every 10-30 minutes (job changes, configurations)

MQTT topics:
- `factory/{factoryId}/machine/{deviceId}/realtime`
- `factory/{factoryId}/machine/{deviceId}/spc`
- `factory/{factoryId}/machine/{deviceId}/tech`

### Database Migrations

```bash
# Generate migration
npm run typeorm migration:generate -- -n MigrationName

# Run migrations
npm run typeorm migration:run

# Revert migration
npm run typeorm migration:revert
```

---

## 🌍 Deployment Environments

### Environment Comparison

| Environment | Cost/Month | Use Case | Machines | Instance |
|------------|------------|----------|----------|----------|
| **Local** | **$0** | Development, testing | 0 (mock) | Docker on laptop |
| **Planning** | **$5** | Staging (few hrs/week) | 0 | t3.small (on-demand) |
| **Testing** | **$18** | Testing with real machines | 1-10 | t3.small (always-on) |
| **Production** | **$35** | Full deployment | 50-100 | t3.medium (always-on) |

### Deployment Commands

```bash
# Local (default)
docker-compose up -d

# AWS Planning Phase (on-demand staging)
cd infrastructure
DEPLOY_ENV=planning ./deploy.sh
./scripts/manage-instance.sh start   # When needed
./scripts/manage-instance.sh stop    # Save money

# AWS Testing Phase (1-10 machines)
DEPLOY_ENV=testing ./deploy.sh

# AWS Production Phase (50-100 machines)
DEPLOY_ENV=production ./deploy.sh
```

### Instance Management

```bash
cd infrastructure/scripts

# Start instance
./manage-instance.sh start

# Stop instance (save money)
./manage-instance.sh stop

# Check status
./manage-instance.sh status

# Get IP address
./manage-instance.sh ip

# View logs
./manage-instance.sh logs

# SSH into instance
./manage-instance.sh ssh
```

### Cost Optimization

**6-Month Projection**:
- Month 1-2 (Planning): $5/month × 2 = $10
- Month 3-5 (Testing): $18/month × 3 = $54
- Month 6 (Production): $35/month × 1 = $35
- **Total**: $99 (vs $210 if using production from day 1)
- **Savings**: 53%

---

## 📚 Documentation

### Complete Guides

- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Complete deployment guide for all environments
  - Local development setup
  - AWS prerequisites and configuration
  - Phased deployment (planning → testing → production)
  - Instance management
  - Data backup and migration
  - Troubleshooting

- **[docs/ENVIRONMENT_CONFIGURATION.md](./docs/ENVIRONMENT_CONFIGURATION.md)** - Environment configuration reference
  - Local vs Docker Compose vs AWS configuration
  - Environment file guide (.env.local, .env.compose)
  - Security best practices for secrets
  - Troubleshooting environment issues

- **[infrastructure/PHASED_DEPLOYMENT.md](./infrastructure/PHASED_DEPLOYMENT.md)** - Quick reference for phased deployment
  - Cost summary by phase
  - Quick commands
  - Migration checklists

- **[infrastructure/README.md](./infrastructure/README.md)** - AWS CDK infrastructure guide
  - Stack architecture
  - CDK configuration
  - Cost breakdown

- **[docs/AWS_CDK_DEPLOYMENT.md](./docs/AWS_CDK_DEPLOYMENT.md)** - Detailed AWS deployment
  - Step-by-step CDK setup
  - User data scripts
  - Security configuration

- **[CLAUDE.md](./CLAUDE.md)** - Developer reference
  - Architecture overview
  - Data processing pipeline
  - Module descriptions
  - Common operations

### Architecture Documentation

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for detailed system architecture.

### API Documentation

When running locally:
- Swagger docs: http://localhost:3000/api
- Health check: http://localhost:3000/health

---

## 🧪 Testing

### Unit Tests

```bash
# Run all tests
npm run test

# Watch mode
npm run test:watch

# Coverage report
npm run test:cov
```

### End-to-End Tests

```bash
# Run E2E tests
npm run test:e2e

# Against specific host
npm run test:e2e -- --host=http://your-server:3000
```

### Manual Testing

```bash
# Health check
curl http://localhost:3000/health

# Get machines (requires auth)
curl http://localhost:3000/machines \
  -H "Authorization: Bearer <your-jwt-token>"

# Test MQTT
mosquitto_pub -h localhost -t factory/test/machine/test-001/realtime \
  -m '{"timestamp": 1234567890, "oil_temp": 45.5, "status": 1}'

# Subscribe to all MQTT topics
mosquitto_sub -h localhost -t '#' -v
```

---

## 🔒 Security

### Best Practices

1. **Change default credentials** in `.env.compose`
2. **Use strong JWT secrets** (48+ bytes)
3. **Restrict SSH access** to your IP only (in CDK stack)
4. **Enable MFA** on AWS account
5. **Rotate secrets** quarterly
6. **Use HTTPS** in production (configure Nginx reverse proxy)
7. **Limit MQTT access** to machine IPs only

### Generate Secure Secrets

```bash
# JWT Secret (48 bytes)
openssl rand -base64 48

# Database passwords (24 bytes)
openssl rand -base64 24

# InfluxDB token (64 bytes)
openssl rand -base64 64
```

---

## 🐛 Troubleshooting

### Common Issues

#### Services Won't Start

```bash
# Check Docker status
docker-compose ps

# View logs
docker-compose logs backend
docker-compose logs influxdb

# Restart services
docker-compose restart
```

#### Health Check Fails

```bash
# Wait for services to initialize
sleep 30

# Check if backend is running
docker logs opcua-backend

# Verify port is accessible
curl http://localhost:3000/health
```

#### MQTT Connection Failed

```bash
# Check Mosquitto is running
docker logs opcua-mosquitto

# Test connection
mosquitto_pub -h localhost -t test -m "hello"

# Check firewall (AWS)
# Port 1883 must be open in Security Group
```

#### Out of Disk Space

```bash
# Clean up Docker
docker system prune -a

# Check disk usage
df -h
docker system df
```

See [DEPLOYMENT.md#troubleshooting](./DEPLOYMENT.md#troubleshooting) for more solutions.

---

## 📊 Monitoring

### Local Monitoring

```bash
# View Docker stats
docker stats

# View logs
docker-compose logs -f backend
docker-compose logs -f influxdb

# Check database size
docker exec opcua-postgres psql -U postgres -c '\l+'
docker exec opcua-influxdb du -sh /var/lib/influxdb2
```

### AWS Monitoring

```bash
# Instance status
./infrastructure/scripts/manage-instance.sh status

# View application logs
./infrastructure/scripts/manage-instance.sh logs

# SSH and check resources
./infrastructure/scripts/manage-instance.sh ssh
docker stats
```

---

## 🤝 Contributing

This is a private project. For questions or issues, contact the development team.

---

## 📄 License

Copyright © 2024. All rights reserved.

---

## 🆘 Support

### Documentation
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Complete deployment guide
- [CLAUDE.md](./CLAUDE.md) - Developer reference
- [infrastructure/README.md](./infrastructure/README.md) - AWS infrastructure

### Quick Help

**Local development not working?**
```bash
# Reset everything
docker-compose down -v
docker-compose up -d
```

**AWS deployment failed?**
```bash
# Check AWS credentials
aws sts get-caller-identity

# View deployment logs
cat infrastructure/outputs.json
```

**Need to stop AWS instance?**
```bash
cd infrastructure/scripts
./manage-instance.sh stop
```

---

## 📈 Roadmap

- [x] Local Docker Compose development
- [x] AWS CDK deployment with phased approach
- [x] Real-time MQTT ingestion and WebSocket broadcasting
- [x] Multi-tenant architecture with user ownership
- [x] Stripe billing integration
- [x] Instance management scripts
- [x] Automated backup and restore
- [ ] CloudWatch alarms and monitoring
- [ ] Automated scaling based on metrics
- [ ] Multi-region deployment
- [ ] Advanced analytics and machine learning

---

**Start developing locally**: `docker-compose up -d`

**Deploy to AWS for testing**: `cd infrastructure && DEPLOY_ENV=testing ./deploy.sh`

**Read full guide**: [DEPLOYMENT.md](./DEPLOYMENT.md)
