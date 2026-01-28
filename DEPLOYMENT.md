# OPCUA Backend Deployment Guide

Complete deployment guide for all environments: Local, Planning, Testing, and Production.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Environment Overview](#environment-overview)
3. [Local Development](#local-development)
4. [AWS Deployment](#aws-deployment)
   - [Prerequisites](#prerequisites)
   - [Quick EC2 Deploy](#quick-ec2-deploy)
   - [Planning Phase](#planning-phase-on-demand-staging)
   - [Testing Phase](#testing-phase-1-10-machines)
   - [Production Phase](#production-phase-50-100-machines)
5. [Instance Management](#instance-management)
6. [Data Migration](#data-migration)
7. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Local Development (Most Common)

```bash
# 1. Copy environment template
cp .env.compose.template .env.compose

# 2. Start all services
docker-compose up -d

# 3. Check health
curl http://localhost:3000/health

# 4. View logs
docker-compose logs -f backend
```

**Cost**: $0/month

### AWS Deployment (Quick EC2)

```bash
# 1. Configure AWS credentials
aws configure

# 2. Create env file (fill secrets)
cp .env.compose.example .env.compose

# 3. Deploy to AWS
./deploy.sh
```

**Notes**:

- Uses `scripts/deploy.sh` to launch a single EC2 with Docker Compose.
- State file is stored at `scripts/.deploy_state`.
- To tear down: `./scripts/teardown.sh`.

**Cost**: $15–$35/month depending on instance size.

---

## Environment Overview

| Environment    | Use Case                   | Machines      | Cost/Month | Instance Type          | Storage | Elastic IP   |
| -------------- | -------------------------- | ------------- | ---------- | ---------------------- | ------- | ------------ |
| **Local**      | Development                | 0 (mock data) | **$0**     | N/A (Docker on laptop) | N/A     | N/A          |
| **Planning**   | Occasional staging         | 0             | **$5**     | t3.small               | 30 GB   | No (dynamic) |
| **Testing**    | Testing with real machines | 1-10          | **$18**    | t3.small               | 30 GB   | Yes (static) |
| **Production** | Full deployment            | 50-100        | **$35**    | t3.medium              | 50 GB   | Yes (static) |

**6-Month Cost Projection**: $99 (vs $210 if using production from day 1) = **53% savings**

---

## Local Development

Perfect for development, testing features, and frontend integration.

### Prerequisites

- Docker Desktop installed
- Docker Compose v2+
- Node.js 18+ (for NestJS development)
- Git

### Step 1: Clone and Setup

```bash
# Clone repository
git clone <your-repo-url>
cd opcua-backend

# Copy environment files
cp .env.compose.template .env.compose
cp .env.local.example .env.local
```

### Step 2: Configure Environment

Edit `.env.compose`:

```bash
# Backend runtime
NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:3030
JWT_SECRET=your-random-secret-here  # Generate: openssl rand -base64 48

# Enable mock data for testing
ENABLE_MOCK_DATA=true  # Simulates 10 machines sending data

# Database credentials (local Docker)
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your-password-here
POSTGRES_DB=opcua_dashboard

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password

# InfluxDB
INFLUXDB_URL=http://influxdb:8086
INFLUXDB_ORG=opcua-org
INFLUXDB_BUCKET=machine-data
INFLUXDB_TOKEN=your-influxdb-token-here

# MQTT
MQTT_BROKER_URL=mqtt://mosquitto:1883
```

### Step 3: Start Services

```bash
# Start all services in background
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f backend
docker-compose logs -f influxdb
docker-compose logs -f mosquitto
```

### Step 4: Verify Deployment

```bash
# Health check
curl http://localhost:3000/health

# Expected response:
# {"status":"ok","timestamp":"2024-01-15T10:30:00.000Z"}

# Check mock data (if enabled)
curl http://localhost:3000/machines

# Test MQTT
mosquitto_pub -h localhost -t factory/test/machine/test-001/realtime -m '{"timestamp": 1234567890, "oil_temp": 45.5}'
```

### Step 5: Access Services

| Service      | URL                          | Credentials            |
| ------------ | ---------------------------- | ---------------------- |
| Backend API  | http://localhost:3000        | N/A                    |
| Health Check | http://localhost:3000/health | N/A                    |
| InfluxDB UI  | http://localhost:8086        | See .env.compose       |
| MQTT Broker  | mqtt://localhost:1883        | Anonymous (local only) |
| PostgreSQL   | localhost:5432               | See .env.compose       |
| Redis        | localhost:6379               | See .env.compose       |

### Development Workflow

```bash
# Watch mode (auto-reload on code changes)
npm run start:dev

# Run tests
npm run test

# Lint and format
npm run lint
npm run format

# Stop services
docker-compose down

# Stop and remove volumes (fresh start)
docker-compose down -v
```

### Mock Data

With `ENABLE_MOCK_DATA=true`, the system simulates:

- 10 injection molding machines
- Realtime data every 5 seconds per machine
- SPC data every 30-60 seconds per machine
- Random temperature variations and alerts

**Topics**:

- `factory/factory-{id}/machine/machine-{id}/realtime`
- `factory/factory-{id}/machine/machine-{id}/spc`
- `factory/factory-{id}/machine/machine-{id}/tech`

---

## AWS Deployment

### Prerequisites

#### 1. AWS Account Setup

- AWS account with billing enabled
- IAM user with administrator access
- Access key ID and secret access key

#### 2. Install Required Tools

**AWS CLI**:

```bash
# macOS
brew install awscli

# Linux
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Verify
aws --version
```

**AWS CDK**:

```bash
npm install -g aws-cdk

# Verify
cdk --version
```

**jq** (JSON processor):

```bash
# macOS
brew install jq

# Linux
sudo apt-get install jq
```

#### 3. Configure AWS Credentials

```bash
aws configure

# Enter:
# AWS Access Key ID: AKIA...
# AWS Secret Access Key: wJalrXUtn...
# Default region name: us-east-1
# Default output format: json

# Verify
aws sts get-caller-identity
```

#### 4. Update Repository URL

**IMPORTANT**: Before deploying, update the repository URL in the CDK stack.

Edit `infrastructure/lib/opcua-backend-stack.ts` (around line 107):

```typescript
'git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git opcua-backend || {';
```

Replace with your actual GitHub repository URL.

---

### Quick EC2 Deploy

Use this for a single-instance deployment managed from this repo.

```bash
cp .env.compose.example .env.compose
./deploy.sh
```

- Default region: `us-east-1` (override with `REGION=...`).
- Default instance: `t3.small` (override with `INSTANCE_TYPE=...`).
- SSH key: `opcua-backend-key.pem` (generated if missing).
- State file: `scripts/.deploy_state`.

To tear down:

```bash
./scripts/teardown.sh
```

---

## Planning Phase (On-Demand Staging)

**When to use**: Development phase, need staging online occasionally (few hours/week)
**Cost**: $5/month (4 hours/week usage) or $2.40/month (stopped)
**Instance**: t3.small (1 vCPU, 2 GB RAM)
**Elastic IP**: No (uses dynamic IP)

### Deploy

```bash
cd infrastructure

# 1. Install CDK dependencies
npm install

# 2. Deploy with planning configuration
DEPLOY_ENV=planning ./deploy.sh

# Expected output:
# 🚀 Deploying OPCUA Backend to AWS...
# ✅ Deployment complete!
# 📍 Public IP: 52.12.34.56
# 🖥️ Instance ID: i-0123456789abcdef0
```

### Start/Stop for Cost Savings

```bash
# Start instance when you need it
./scripts/manage-instance.sh start
# Output:
# ✅ Instance started!
# 📍 Public IP: 52.12.34.56
# 🌐 Backend URL: http://52.12.34.56:3000

# Stop instance when done
./scripts/manage-instance.sh stop
# Output:
# ✅ Instance stopped!
# 💰 You're now saving money!
```

### Cost Breakdown

| State                | Compute         | Storage         | Elastic IP | Total           |
| -------------------- | --------------- | --------------- | ---------- | --------------- |
| Running (per hour)   | $0.0208         | -               | -          | $0.0208/hr      |
| Running (per day)    | $0.50           | -               | -          | $0.50/day       |
| **Stopped**          | **$0**          | **$2.40/month** | **$0**     | **$2.40/month** |
| **4 hrs/week usage** | **$0.33/month** | **$2.40/month** | **$0**     | **~$3/month**   |

### Use Cases

✅ Show staging to stakeholders
✅ Test deployments before production
✅ Frontend integration testing
✅ Demo environment for clients

❌ Not suitable for continuous machine data (use Testing phase)

---

## Testing Phase (1-10 Machines)

**When to use**: Testing with real machines, 1-10 units
**Cost**: $18/month (always-on)
**Instance**: t3.small (1 vCPU, 2 GB RAM)
**Elastic IP**: Yes (static IP for machines)

### Deploy

```bash
cd infrastructure

# Deploy with testing configuration
DEPLOY_ENV=testing ./deploy.sh

# Expected output:
# Deploying with environment: testing
# Instance type: t3.small
# Storage size: 30 GB
# Elastic IP: enabled
#
# ✅ Deployment complete!
# 📍 Elastic IP: 52.12.34.56 (static - won't change)
# 🖥️ Instance ID: i-0123456789abcdef0
# 🌐 Backend URL: http://52.12.34.56:3000
# 📡 MQTT Broker: mqtt://52.12.34.56:1883
```

### Configure Machines

Point your injection molding machines to the backend:

```
MQTT Broker: mqtt://52.12.34.56:1883
Port: 1883
Protocol: MQTT v3.1.1

Topics:
  Realtime: factory/{factoryId}/machine/{deviceId}/realtime
  SPC:      factory/{factoryId}/machine/{deviceId}/spc
  Tech:     factory/{factoryId}/machine/{deviceId}/tech

Message Format: JSON
Example: {"timestamp": 1234567890, "oil_temp": 45.5, "status": 1, ...}
```

### Monitor Resources

```bash
# Check instance status
./scripts/manage-instance.sh status

# SSH and check Docker stats
./scripts/manage-instance.sh ssh
docker stats

# Expected resource usage (10 machines):
# NAME                CPU %    MEM USAGE / LIMIT     MEM %
# opcua-backend       15%      400 MB / 2 GB         20%
# opcua-postgres      5%       200 MB / 2 GB         10%
# opcua-influxdb      20%      800 MB / 2 GB         40%
# opcua-redis         5%       300 MB / 2 GB         15%
# opcua-mosquitto     3%       200 MB / 2 GB         10%
```

### When to Upgrade to Production

Upgrade when you see:

- ✅ More than 15 machines connected
- ✅ CPU usage consistently > 80%
- ✅ Memory usage consistently > 90%
- ✅ Ready for production deployment

---

## Production Phase (50-100 Machines)

**When to use**: Full production deployment
**Cost**: $35/month (always-on)
**Instance**: t3.medium (2 vCPU, 4 GB RAM)
**Elastic IP**: Yes (same IP from testing)

### Pre-Deployment

#### 1. Backup Existing Data

```bash
cd infrastructure

# Backup PostgreSQL + InfluxDB
./scripts/backup-data.sh

# Output:
# 🗄️ Backing up OPCUA Backend data...
# 1️⃣ Backing up PostgreSQL...
# ✅ PostgreSQL backup downloaded
# 2️⃣ Backing up InfluxDB...
# ✅ InfluxDB backup downloaded
#
# ✅ Backup complete!
# Backup location: backups/20240115_143022
```

#### 2. Verify Backup

```bash
ls -lh backups/20240115_143022/

# Expected:
# postgres-backup.sql
# influx-backup/
# .env.compose
# .env.local
# manifest.txt
```

### Deploy Production

```bash
cd infrastructure

# Deploy with production configuration
DEPLOY_ENV=production cdk deploy

# You'll see:
# Deploying with environment: production
# Instance type: t3.medium
# Storage size: 50 GB
# Elastic IP: enabled
#
# This deployment uses the following resources:
# - EC2 t3.medium: $30.37/month
# - EBS 50 GB: $4.00/month
# Total: $34.37/month
#
# Do you wish to deploy these changes (y/n)? y
```

**Important**: CDK will create a new instance but **keep the same Elastic IP**, so your machines don't need reconfiguration!

### Post-Deployment

#### 1. Wait for Instance Setup

```bash
# The instance takes ~3 minutes to:
# - Install Docker
# - Clone repository
# - Start services

# Check status
./scripts/manage-instance.sh status
```

#### 2. Restore Data

```bash
# Restore from backup
./scripts/restore-data.sh backups/20240115_143022

# You'll be asked to confirm:
# ⚠️ This will OVERWRITE existing data. Continue? (yes/no): yes
#
# 1️⃣ Uploading backup files...
# 2️⃣ Restoring PostgreSQL...
# 3️⃣ Restoring InfluxDB...
# 4️⃣ Restarting services...
#
# ✅ Restore complete!
```

#### 3. Verify Deployment

```bash
# Get Elastic IP
IP=$(./scripts/manage-instance.sh ip)

# Test health
curl http://$IP:3000/health

# Check if machines are connected
curl http://$IP:3000/machines
```

#### 4. No Machine Reconfiguration Needed!

✅ **Same Elastic IP** = Machines automatically reconnect
✅ **Same MQTT topics** = No configuration changes
✅ **Zero downtime** for machine data flow

### Monitor Production

```bash
# View real-time logs
./scripts/manage-instance.sh logs

# SSH and check resources
./scripts/manage-instance.sh ssh
docker stats

# Expected resource usage (50-100 machines):
# NAME                CPU %    MEM USAGE / LIMIT     MEM %
# opcua-backend       25%      600 MB / 4 GB         15%
# opcua-postgres      10%      400 MB / 4 GB         10%
# opcua-influxdb      35%      2.0 GB / 4 GB         50%
# opcua-redis         8%       600 MB / 4 GB         15%
# opcua-mosquitto     5%       400 MB / 4 GB         10%
```

---

## Instance Management

### Common Commands

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

# Restart instance
./manage-instance.sh restart

# View logs
./manage-instance.sh logs

# SSH into instance
./manage-instance.sh ssh
```

### Automated Scheduling (Optional)

For planning phase, you can auto-start/stop on schedule:

```bash
# Start at 9 AM, stop at 6 PM weekdays
./scripts/schedule-instance.sh

# This creates EventBridge rules for:
# - Start: Mon-Fri 9:00 AM
# - Stop: Mon-Fri 6:00 PM

# Cost: ~$6/month (45 hours/week)
```

### Manual Operations

```bash
# Start instance
aws ec2 start-instances --instance-ids <instance-id>
aws ec2 wait instance-running --instance-ids <instance-id>

# Stop instance
aws ec2 stop-instances --instance-ids <instance-id>
aws ec2 wait instance-stopped --instance-ids <instance-id>

# Get public IP
aws ec2 describe-instances --instance-ids <instance-id> \
  --query 'Reservations[0].Instances[0].PublicIpAddress' --output text
```

---

## Data Migration

### Backup Data

```bash
cd infrastructure

# Backup current deployment
./scripts/backup-data.sh

# With S3 upload (optional)
export S3_BACKUP_BUCKET=your-bucket-name
./scripts/backup-data.sh

# Backups are stored in:
# infrastructure/backups/YYYYMMDD_HHMMSS/
```

### Restore Data

```bash
cd infrastructure

# List available backups
ls -lh backups/

# Restore from specific backup
./scripts/restore-data.sh backups/20240115_143022

# What gets restored:
# - PostgreSQL database (users, factories, machines)
# - InfluxDB time-series data (realtime, SPC)
# - Environment variables
```

### Migration Scenarios

#### Local → AWS Testing

```bash
# 1. Export from local
docker exec opcua-postgres pg_dump -U postgres opcua_dashboard > local-backup.sql

# 2. Deploy AWS testing
cd infrastructure
DEPLOY_ENV=testing ./deploy.sh

# 3. Import to AWS
IP=$(./scripts/manage-instance.sh ip)
scp local-backup.sql ec2-user@$IP:/tmp/
ssh ec2-user@$IP
docker exec -i opcua-postgres psql -U postgres opcua_dashboard < /tmp/local-backup.sql
```

#### Testing → Production

```bash
# 1. Backup testing data
./scripts/backup-data.sh

# 2. Deploy production
DEPLOY_ENV=production cdk deploy

# 3. Restore data
./scripts/restore-data.sh backups/<timestamp>

# ✅ Same Elastic IP = No machine reconfiguration
```

---

## Troubleshooting

### Deployment Issues

#### CDK Bootstrap Failed

```bash
# Error: Unable to resolve AWS account

# Solution: Verify AWS credentials
aws sts get-caller-identity

# If invalid, reconfigure
aws configure
```

#### Repository Clone Failed

```bash
# Error in logs: Failed to clone repository

# Solution: Update repository URL
# Edit infrastructure/lib/opcua-backend-stack.ts:107
'git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git opcua-backend

# Redeploy
cdk deploy
```

### Health Check Issues

#### Health Endpoint Returns 404

```bash
# Wait 2-3 minutes for services to start
sleep 120

# Check Docker status
./scripts/manage-instance.sh ssh
docker-compose ps

# If not running:
cd /opt/opcua-backend
docker-compose up -d
```

#### Services Not Starting

```bash
# View user data log
./scripts/manage-instance.sh ssh
sudo tail -100 /var/log/user-data.log

# Check Docker logs
cd /opt/opcua-backend
docker-compose logs backend
docker-compose logs influxdb
```

### MQTT Connection Issues

#### Machines Can't Connect

```bash
# 1. Verify security group allows port 1883
aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=*OpcuaSG*" \
  --query 'SecurityGroups[0].IpPermissions'

# 2. Test MQTT locally
mosquitto_pub -h <elastic-ip> -t test -m "hello"

# 3. Check Mosquitto logs
./scripts/manage-instance.sh ssh
docker logs opcua-mosquitto
```

### Performance Issues

#### High CPU Usage

```bash
# Check Docker stats
./scripts/manage-instance.sh ssh
docker stats

# If backend CPU > 80%:
# - Upgrade to larger instance (testing → production)
# - Optimize queries
# - Check for infinite loops in code
```

#### Out of Memory

```bash
# Check memory usage
docker stats

# If InfluxDB > 90%:
# 1. Reduce retention period
# 2. Upgrade instance size
# 3. Enable compression

# If PostgreSQL > 90%:
# 1. Optimize queries
# 2. Add indexes
# 3. Clean up old data
```

#### Disk Full

```bash
# Check disk usage
df -h

# Clean up Docker
docker system prune -a

# Clean up old logs
sudo truncate -s 0 /var/log/user-data.log
```

### Cost Issues

#### Unexpected Charges

```bash
# Check running instances
aws ec2 describe-instances \
  --filters "Name=instance-state-name,Values=running" \
  --query 'Reservations[*].Instances[*].[InstanceId,InstanceType,State.Name]'

# Check unattached Elastic IPs ($3.60/month each)
aws ec2 describe-addresses \
  --query 'Addresses[?AssociationId==null]'

# Check EBS volumes
aws ec2 describe-volumes \
  --filters "Name=status,Values=available" \
  --query 'Volumes[*].[VolumeId,Size,State]'
```

### Data Loss Prevention

#### Setup Automated Backups

```bash
# Create backup script
cat > ~/backup-cron.sh <<'EOF'
#!/bin/bash
cd /path/to/infrastructure
./scripts/backup-data.sh
export S3_BACKUP_BUCKET=your-bucket
aws s3 sync backups/ s3://$S3_BACKUP_BUCKET/opcua-backups/
EOF

# Add to crontab (daily at 2 AM)
chmod +x ~/backup-cron.sh
crontab -e
# Add: 0 2 * * * ~/backup-cron.sh
```

---

## Security Best Practices

### 1. Restrict SSH Access

Edit `infrastructure/lib/opcua-backend-stack.ts`:

```typescript
// Change from:
securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'Allow SSH');

// To:
securityGroup.addIngressRule(
  ec2.Peer.ipv4('YOUR_IP_ADDRESS/32'), // e.g., 123.45.67.89/32
  ec2.Port.tcp(22),
  'Allow SSH from my IP',
);
```

Then redeploy:

```bash
cd infrastructure
cdk deploy
```

### 2. Use AWS Systems Manager Session Manager

No SSH keys needed:

```bash
# Install Session Manager plugin
# https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html

# Connect without SSH
aws ssm start-session --target <instance-id>
```

### 3. Rotate Secrets

```bash
# Generate new secrets
JWT_SECRET=$(openssl rand -base64 48)
POSTGRES_PASSWORD=$(openssl rand -base64 24)
REDIS_PASSWORD=$(openssl rand -base64 24)
INFLUXDB_TOKEN=$(openssl rand -base64 48)

# SSH and update .env.compose
./scripts/manage-instance.sh ssh
cd /opt/opcua-backend
nano .env.compose

# Restart services
docker-compose restart
```

### 4. Enable CloudWatch Alarms

```bash
# CPU > 80%
aws cloudwatch put-metric-alarm \
  --alarm-name opcua-high-cpu \
  --alarm-description "Alert when CPU exceeds 80%" \
  --metric-name CPUUtilization \
  --namespace AWS/EC2 \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=InstanceId,Value=<instance-id> \
  --evaluation-periods 2

# Disk > 80%
# (requires CloudWatch agent on instance)
```

---

## Cost Optimization Checklist

### Planning Phase

- [ ] Use local Docker Compose for most development
- [ ] Deploy to AWS only when needed for staging
- [ ] Stop instance when not in use (`./scripts/manage-instance.sh stop`)
- [ ] Consider auto-schedule (9 AM - 6 PM weekdays) for $6/month

### Testing Phase

- [ ] Monitor CPU/memory usage weekly
- [ ] Upgrade to production when >15 machines or CPU >80%
- [ ] Set up CloudWatch alarms for resource usage

### Production Phase

- [ ] Enable automated backups to S3
- [ ] Consider reserved instances for 30% savings (1-year commitment)
- [ ] Monitor and optimize database queries
- [ ] Clean up old data periodically

---

## Support and Resources

- **Quick Reference**: `infrastructure/PHASED_DEPLOYMENT.md`
- **Infrastructure Guide**: `infrastructure/README.md`
- **Detailed Plan**: `.claude/plans/gentle-swinging-twilight.md`
- **Full Documentation**: `docs/AWS_CDK_DEPLOYMENT.md`

---

## Summary

| Phase          | Deploy Command                      | Monthly Cost | Use Case           |
| -------------- | ----------------------------------- | ------------ | ------------------ |
| **Local**      | `docker-compose up -d`              | **$0**       | Development        |
| **Planning**   | `DEPLOY_ENV=planning ./deploy.sh`   | **$5**       | Occasional staging |
| **Testing**    | `DEPLOY_ENV=testing ./deploy.sh`    | **$18**      | 1-10 machines      |
| **Production** | `DEPLOY_ENV=production ./deploy.sh` | **$35**      | 50-100 machines    |

**Your Path**:

1. Start with **Local** ($0/month) ← You are here
2. Move to **Testing** when you have 1-10 machines ($18/month)
3. Upgrade to **Production** when scaling to 50-100 machines ($35/month)

**Total 6-Month Cost**: ~$99 (vs $210 with production from day 1) = **53% savings**
