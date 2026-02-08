# EC2 SIT Deployment Guide

Complete guide for deploying the OPC UA backend to EC2 SIT environment using AWS Systems Manager (SSM).

## Table of Contents
- [Environment Information](#environment-information)
- [Prerequisites](#prerequisites)
  - [First-Time Environment Setup](#first-time-environment-setup-one-time-only)
- [Deployment Process](#deployment-process)
- [Verification](#verification)
- [Safety Checks](#safety-checks)
- [Troubleshooting](#troubleshooting)
- [Rollback](#rollback)

## Environment Information

### EC2 Instance Details
- **Instance ID**: `i-031be0ff1e8e4195b`
- **Public IP**: `44.221.91.204`
- **Region**: `us-east-1`
- **Instance Type**: `t3.medium`
- **AMI**: Amazon Linux 2023
- **Public Endpoint**: https://api-dashboard.harrytu.cv

### Application Paths
- **Application Directory**: `/opt/opcua-backend`
- **Environment File**: `/opt/opcua-backend/.env.compose`
- **Docker Compose File**: `/opt/opcua-backend/docker-compose.yml`
- **Dockerfile**: `/opt/opcua-backend/Dockerfile`
- **.dockerignore**: `/opt/opcua-backend/.dockerignore`

### Running Services
- **Backend Container**: `opcua-backend` (port 3000)
- **PostgreSQL**: `opcua-postgres` (port 5432, internal)
- **InfluxDB**: `opcua-influxdb` (port 8086, internal)
- **Redis**: `opcua-redis` (port 6379, internal)
- **Mosquitto MQTT**: `opcua-mosquitto` (port 1883)

## Prerequisites

### Required Tools
1. **AWS CLI** configured with appropriate credentials
   ```bash
   aws --version
   ```

2. **jq** for JSON parsing
   ```bash
   jq --version
   ```

3. **Access to AWS SSM Session Manager**
   - Instance must have SSM agent installed (already configured)
   - IAM permissions for SSM SendCommand

### Repository Access
- Git repository: `https://github.com/tutuCH/opcua-backend`
- Branch: `master`
- Latest commit should include build fixes

### First-Time Environment Setup (One-Time Only)

⚠️ **CRITICAL**: Before your first deployment, you must set up the persistent environment configuration on the EC2 instance.

**Important Security Note**: The `.env.compose` file contains secrets and is:
- ✅ **Stored ONLY on EC2** - never committed to Git
- ✅ **Persistent across deployments** - git pull will never overwrite it
- ✅ **Manually managed** - secrets are set once and reused

#### Option 1: Copy from Existing Configuration (Recommended if .env.compose exists)

If you already have a working `.env.compose` file, verify it exists:

```bash
aws ssm send-command \
  --region us-east-1 \
  --instance-ids i-031be0ff1e8e4195b \
  --document-name "AWS-RunShellScript" \
  --parameters '{"commands":["cd /opt/opcua-backend","echo === Checking .env.compose ===","if [ -f .env.compose ]; then echo EXISTS; grep -E \"^(NODE_ENV|POSTGRES_PASSWORD|STRIPE_SECRET_KEY|GOOGLE_CLIENT_ID)\" .env.compose | sed \"s/=.*/=***REDACTED***/\"; else echo MISSING - NEEDS SETUP; fi"]}' \
  --output json | jq -r '.Command.CommandId' > /tmp/deploy_cmd.txt

COMMAND_ID=$(cat /tmp/deploy_cmd.txt)
sleep 5

aws ssm get-command-invocation \
  --region us-east-1 \
  --command-id "$COMMAND_ID" \
  --instance-id i-031be0ff1e8e4195b \
  --query 'StandardOutputContent' \
  --output text
```

If it shows "EXISTS" and has the required variables, **skip to Deployment Process**.

#### Option 2: Create New Environment Configuration

If `.env.compose` doesn't exist or is incomplete, create it with all required secrets:

```bash
# IMPORTANT: Replace <YOUR_*_HERE> placeholders with real values before running
aws ssm send-command \
  --region us-east-1 \
  --instance-ids i-031be0ff1e8e4195b \
  --document-name "AWS-RunShellScript" \
  --parameters '{"commands":[
    "cd /opt/opcua-backend",
    "# Backup existing .env.compose if it exists",
    "[ -f .env.compose ] && cp .env.compose .env.compose.backup.$(date +%Y%m%d-%H%M%S) || true",
    "",
    "# Create .env.compose with secrets",
    "cat > .env.compose << \"EOF\"",
    "# Backend runtime",
    "NODE_ENV=development",
    "PORT=3000",
    "FRONTEND_URL=https://dashboard.harrytu.cv",
    "JWT_SECRET=<YOUR_JWT_SECRET_HERE>",
    "ENABLE_MOCK_DATA=true",
    "",
    "# PostgreSQL",
    "POSTGRES_HOST=postgres",
    "POSTGRES_PORT=5432",
    "POSTGRES_USER=postgres",
    "POSTGRES_PASSWORD=<YOUR_POSTGRES_PASSWORD_HERE>",
    "POSTGRES_DB=opcua_dashboard",
    "POSTGRES_SYNCHRONIZE=true",
    "",
    "# Redis",
    "REDIS_HOST=redis",
    "REDIS_PORT=6379",
    "REDIS_PASSWORD=<YOUR_REDIS_PASSWORD_HERE>",
    "",
    "# InfluxDB",
    "INFLUXDB_URL=http://influxdb:8086",
    "INFLUXDB_ORG=opcua-org",
    "INFLUXDB_BUCKET=machine-data",
    "INFLUXDB_USERNAME=admin",
    "INFLUXDB_PASSWORD=<YOUR_INFLUXDB_PASSWORD_HERE>",
    "INFLUXDB_TOKEN=<YOUR_INFLUXDB_TOKEN_HERE>",
    "",
    "# MQTT broker",
    "MQTT_BROKER_URL=mqtt://mosquitto:1883",
    "",
    "# Stripe (use real test keys from Stripe dashboard)",
    "STRIPE_SECRET_KEY=<YOUR_STRIPE_SECRET_KEY_HERE>",
    "STRIPE_WEBHOOK_SECRET=<YOUR_STRIPE_WEBHOOK_SECRET_HERE>",
    "",
    "# Google OAuth (required - get from Google Cloud Console)",
    "GOOGLE_CLIENT_ID=<YOUR_GOOGLE_CLIENT_ID_HERE>",
    "GOOGLE_CLIENT_SECRET=<YOUR_GOOGLE_CLIENT_SECRET_HERE>",
    "EOF",
    "",
    "chmod 600 .env.compose",
    "echo === Setup complete ===",
    "echo Verify configuration:",
    "grep -E \"^(NODE_ENV|POSTGRES_HOST|STRIPE_SECRET_KEY|GOOGLE_CLIENT_ID)\" .env.compose | sed \"s/=.*/=***REDACTED***/\""
  ]}' \
  --output json | jq -r '.Command.CommandId' > /tmp/deploy_cmd.txt

COMMAND_ID=$(cat /tmp/deploy_cmd.txt)
sleep 5

aws ssm get-command-invocation \
  --region us-east-1 \
  --command-id "$COMMAND_ID" \
  --instance-id i-031be0ff1e8e4195b \
  --query 'StandardOutputContent' \
  --output text
```

**Required Secrets**:
- `JWT_SECRET`: Generate with `openssl rand -base64 48`
- `POSTGRES_PASSWORD`: From your PostgreSQL setup
- `REDIS_PASSWORD`: From your Redis setup
- `INFLUXDB_PASSWORD` & `INFLUXDB_TOKEN`: From your InfluxDB setup
- `STRIPE_SECRET_KEY`: Test key from https://dashboard.stripe.com/test/apikeys (starts with `sk_test_`)
- `STRIPE_WEBHOOK_SECRET`: From Stripe webhook configuration (starts with `whsec_`)
- `GOOGLE_CLIENT_ID` & `GOOGLE_CLIENT_SECRET`: From Google Cloud Console OAuth credentials

#### Future Enhancement: AWS Parameter Store

For better security and secret rotation, consider migrating to AWS Systems Manager Parameter Store:

```bash
# Example: Store secrets in Parameter Store (future enhancement)
aws ssm put-parameter \
  --region us-east-1 \
  --name "/opcua/sit/stripe-secret-key" \
  --value "sk_test_..." \
  --type "SecureString"

# Deployment script would then retrieve secrets automatically
STRIPE_KEY=$(aws ssm get-parameter --region us-east-1 --name /opcua/sit/stripe-secret-key --with-decryption --query 'Parameter.Value' --output text)
```

Benefits:
- ✅ Encrypted at rest
- ✅ Audit trail via CloudTrail
- ✅ Easy secret rotation
- ✅ IAM-based access control

For now, the file-based approach is simpler and sufficient for SIT environment.

## Deployment Process

### Step 1: Pull Latest Code (Preserving Secrets)

⚠️ **IMPORTANT**: This step pulls code only. The `.env.compose` file is NOT tracked in Git and will NOT be overwritten.

Use SSM to pull the latest code from the repository:

```bash
# Send pull command via SSM
aws ssm send-command \
  --region us-east-1 \
  --instance-ids i-031be0ff1e8e4195b \
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
    "if [ -f .env.compose ]; then echo .env.compose preserved; else echo ERROR: .env.compose was deleted!; exit 1; fi",
    "",
    "echo === Current commit ===",
    "git log -1 --oneline"
  ]}' \
  --output json | jq -r '.Command.CommandId' > /tmp/deploy_cmd.txt

COMMAND_ID=$(cat /tmp/deploy_cmd.txt)
echo "Command ID: $COMMAND_ID"

# Wait for command completion
sleep 10

# Check result
aws ssm get-command-invocation \
  --region us-east-1 \
  --command-id "$COMMAND_ID" \
  --instance-id i-031be0ff1e8e4195b \
  --query 'StandardOutputContent' \
  --output text
```

**Expected output**:
```
=== Verifying .env.compose exists before pull ===
.env.compose found
=== Pulling latest code ===
HEAD is now at c715906 fix: move cleanup logic to onModuleDestroy method
=== Verifying .env.compose preserved after pull ===
.env.compose preserved
=== Current commit ===
c715906 fix: move cleanup logic to onModuleDestroy method
```

If `.env.compose` is missing, you must run the [First-Time Environment Setup](#first-time-environment-setup-one-time-only) before proceeding.

### Step 2: Verify .dockerignore Configuration

The `.dockerignore` file must exclude the `infrastructure` directory to prevent TypeScript compilation errors:

```bash
# Check current .dockerignore
aws ssm send-command \
  --region us-east-1 \
  --instance-ids i-031be0ff1e8e4195b \
  --document-name "AWS-RunShellScript" \
  --parameters '{"commands":["cat /opt/opcua-backend/.dockerignore"]}' \
  --output json | jq -r '.Command.CommandId' > /tmp/deploy_cmd.txt

COMMAND_ID=$(cat /tmp/deploy_cmd.txt)
sleep 5

aws ssm get-command-invocation \
  --region us-east-1 \
  --command-id "$COMMAND_ID" \
  --instance-id i-031be0ff1e8e4195b \
  --query 'StandardOutputContent' \
  --output text
```

**Required .dockerignore contents:**
```
# dependencies
node_modules
npm-debug.log
yarn.lock

# build output
dist
coverage

# vcs / editor / os
.git
.gitignore
.vscode
.DS_Store

# demo and local helpers not needed in image
demoMqttServer
demo_frontend
docs
test
websocket-test.html
websocket-test.js
test-websocket-direct.js
CLAUDE.md
.claude
AGENTS.md

# infrastructure and deployment
infrastructure
scripts
.env.*
```

If the file is missing entries, update it:

```bash
aws ssm send-command \
  --region us-east-1 \
  --instance-ids i-031be0ff1e8e4195b \
  --document-name "AWS-RunShellScript" \
  --parameters '{"commands":["cd /opt/opcua-backend","cat > .dockerignore << '\''EOF'\''","# dependencies","node_modules","npm-debug.log","yarn.lock","","# build output","dist","coverage","","# vcs / editor / os",".git",".gitignore",".vscode",".DS_Store","","# demo and local helpers not needed in image","demoMqttServer","demo_frontend","docs","test","websocket-test.html","websocket-test.js","test-websocket-direct.js","CLAUDE.md",".claude","AGENTS.md","","# infrastructure and deployment","infrastructure","scripts",".env.*","EOF"]}' \
  --output json | jq -r '.Command.CommandId'
```

### Step 3: Build Docker Image

Build the Docker image with the latest code:

```bash
# Start build
aws ssm send-command \
  --region us-east-1 \
  --instance-ids i-031be0ff1e8e4195b \
  --document-name "AWS-RunShellScript" \
  --parameters '{"commands":["cd /opt/opcua-backend","echo === Building Docker image ===","docker build -t opcua-backend-backend:latest . 2>&1 | tail -50"]}' \
  --timeout-seconds 600 \
  --output json | jq -r '.Command.CommandId' > /tmp/deploy_cmd.txt

COMMAND_ID=$(cat /tmp/deploy_cmd.txt)
echo "Build started: $COMMAND_ID"
echo "Waiting for build to complete (~2 minutes)..."

# Wait for build to complete
for i in {1..60}; do
  STATUS=$(aws ssm get-command-invocation \
    --region us-east-1 \
    --command-id "$COMMAND_ID" \
    --instance-id i-031be0ff1e8e4195b \
    --query 'Status' \
    --output text 2>/dev/null || echo "Pending")

  if [[ "$STATUS" == "Success" || "$STATUS" == "Failed" ]]; then
    break
  fi

  if [[ $((i % 3)) == 0 ]]; then
    echo "  Status: $STATUS (${i}0s elapsed)"
  fi

  sleep 10
done

# Check build result
echo ""
echo "=== Build Result: $STATUS ==="
aws ssm get-command-invocation \
  --region us-east-1 \
  --command-id "$COMMAND_ID" \
  --instance-id i-031be0ff1e8e4195b \
  --query 'StandardOutputContent' \
  --output text | tail -50
```

**Expected output** (success):
```
#19 exporting to image
#19 exporting layers 31.7s done
#19 writing image sha256:... done
#19 naming to docker.io/library/opcua-backend-backend:latest done
#19 DONE 31.7s
```

### Step 4: Stop and Remove Old Container

```bash
aws ssm send-command \
  --region us-east-1 \
  --instance-ids i-031be0ff1e8e4195b \
  --document-name "AWS-RunShellScript" \
  --parameters '{"commands":["echo === Stopping old container ===","docker stop opcua-backend || true","docker rm opcua-backend || true","echo Done"]}' \
  --output json | jq -r '.Command.CommandId' > /tmp/deploy_cmd.txt

COMMAND_ID=$(cat /tmp/deploy_cmd.txt)
sleep 5

aws ssm get-command-invocation \
  --region us-east-1 \
  --command-id "$COMMAND_ID" \
  --instance-id i-031be0ff1e8e4195b \
  --query 'StandardOutputContent' \
  --output text
```

### Step 5: Start New Container

```bash
aws ssm send-command \
  --region us-east-1 \
  --instance-ids i-031be0ff1e8e4195b \
  --document-name "AWS-RunShellScript" \
  --parameters '{"commands":["cd /opt/opcua-backend","echo === Starting new backend container ===","docker run -d --name opcua-backend --network opcua-backend_default --env-file .env.compose -p 3000:3000 --restart unless-stopped opcua-backend-backend:latest","echo","echo === Container ID ===","docker ps -q --filter name=opcua-backend"]}' \
  --output json | jq -r '.Command.CommandId' > /tmp/deploy_cmd.txt

COMMAND_ID=$(cat /tmp/deploy_cmd.txt)
sleep 10

aws ssm get-command-invocation \
  --region us-east-1 \
  --command-id "$COMMAND_ID" \
  --instance-id i-031be0ff1e8e4195b \
  --query 'StandardOutputContent' \
  --output text
```

### Step 6: Wait for Application Startup

The application takes approximately 20-30 seconds to start all services:

```bash
echo "Waiting for application startup (30 seconds)..."
sleep 30
```

## Verification

### Check Container Status

```bash
aws ssm send-command \
  --region us-east-1 \
  --instance-ids i-031be0ff1e8e4195b \
  --document-name "AWS-RunShellScript" \
  --parameters '{"commands":["echo === Container status ===","docker ps | grep opcua-backend","echo","echo === Container logs (last 20 lines) ===","docker logs opcua-backend --tail 20"]}' \
  --output json | jq -r '.Command.CommandId' > /tmp/deploy_cmd.txt

COMMAND_ID=$(cat /tmp/deploy_cmd.txt)
sleep 8

aws ssm get-command-invocation \
  --region us-east-1 \
  --command-id "$COMMAND_ID" \
  --instance-id i-031be0ff1e8e4195b \
  --query 'StandardOutputContent' \
  --output text
```

**Expected output**:
- Container status shows "Up" (not "Restarting")
- No ERROR messages in logs

### Test Health Endpoint (Internal)

```bash
aws ssm send-command \
  --region us-east-1 \
  --instance-ids i-031be0ff1e8e4195b \
  --document-name "AWS-RunShellScript" \
  --parameters '{"commands":["curl -f http://localhost:3000/health 2>&1"]}' \
  --output json | jq -r '.Command.CommandId' > /tmp/deploy_cmd.txt

COMMAND_ID=$(cat /tmp/deploy_cmd.txt)
sleep 5

aws ssm get-command-invocation \
  --region us-east-1 \
  --command-id "$COMMAND_ID" \
  --instance-id i-031be0ff1e8e4195b \
  --query 'StandardOutputContent' \
  --output text
```

**Expected response**:
```json
{
  "status": "healthy",
  "timestamp": "2026-01-29T07:10:09.516Z",
  "services": {
    "database": {"status": "ok"},
    "influxdb": {"status": "ok"},
    "redis": {"status": "ok"},
    "mqtt": {"status": "ok"},
    "websocket": {"status": "ok"},
    "mockData": {"status": "ok"}
  }
}
```

### Test Public HTTPS Endpoint

From your local machine:

```bash
curl -f https://api-dashboard.harrytu.cv/health | jq
```

**Expected response**: Same as internal health check above.

### Verify All Services

```bash
aws ssm send-command \
  --region us-east-1 \
  --instance-ids i-031be0ff1e8e4195b \
  --document-name "AWS-RunShellScript" \
  --parameters '{"commands":["docker ps | grep opcua"]}' \
  --output json | jq -r '.Command.CommandId' > /tmp/deploy_cmd.txt

COMMAND_ID=$(cat /tmp/deploy_cmd.txt)
sleep 5

aws ssm get-command-invocation \
  --region us-east-1 \
  --command-id "$COMMAND_ID" \
  --instance-id i-031be0ff1e8e4195b \
  --query 'StandardOutputContent' \
  --output text
```

**Expected output**: All 5 containers should be "Up" and "(healthy)":
- opcua-backend
- opcua-influxdb
- opcua-postgres
- opcua-redis
- opcua-mosquitto

## Safety Checks

### Verify .env.compose is Not Tracked by Git

This check confirms that secrets are properly isolated from version control:

```bash
aws ssm send-command \
  --region us-east-1 \
  --instance-ids i-031be0ff1e8e4195b \
  --document-name "AWS-RunShellScript" \
  --parameters '{"commands":["cd /opt/opcua-backend","echo === Checking if .env.compose is tracked by Git ===","git ls-files .env.compose 2>&1 || echo Not tracked by Git - GOOD"]}' \
  --output json | jq -r '.Command.CommandId' > /tmp/deploy_cmd.txt

COMMAND_ID=$(cat /tmp/deploy_cmd.txt)
sleep 5

aws ssm get-command-invocation \
  --region us-east-1 \
  --command-id "$COMMAND_ID" \
  --instance-id i-031be0ff1e8e4195b \
  --query 'StandardOutputContent' \
  --output text
```

**Expected output**:
```
=== Checking if .env.compose is tracked by Git ===
Not tracked by Git - GOOD
```

**If `.env.compose` is tracked**: This is a security risk! The file should be in `.gitignore`. Run:

```bash
aws ssm send-command \
  --region us-east-1 \
  --instance-ids i-031be0ff1e8e4195b \
  --document-name "AWS-RunShellScript" \
  --parameters '{"commands":["cd /opt/opcua-backend","git rm --cached .env.compose","echo .env.compose >> .gitignore","git status"]}' \
  --output json | jq -r '.Command.CommandId'
```

### Verify .env.compose Has Required Secrets

Check that all critical environment variables are present and not using placeholder values:

```bash
aws ssm send-command \
  --region us-east-1 \
  --instance-ids i-031be0ff1e8e4195b \
  --document-name "AWS-RunShellScript" \
  --parameters '{"commands":[
    "cd /opt/opcua-backend",
    "echo === Checking required environment variables ===",
    "echo",
    "echo NODE_ENV:",
    "grep \"^NODE_ENV=\" .env.compose || echo MISSING",
    "echo",
    "echo POSTGRES_PASSWORD:",
    "grep \"^POSTGRES_PASSWORD=\" .env.compose | sed \"s/=.*/=***REDACTED***/\" || echo MISSING",
    "echo",
    "echo STRIPE_SECRET_KEY:",
    "grep \"^STRIPE_SECRET_KEY=\" .env.compose | sed \"s/=.*/=***REDACTED***/\" || echo MISSING",
    "echo",
    "echo GOOGLE_CLIENT_ID:",
    "grep \"^GOOGLE_CLIENT_ID=\" .env.compose | sed \"s/=.*/=***REDACTED***/\" || echo MISSING"
  ]}' \
  --output json | jq -r '.Command.CommandId' > /tmp/deploy_cmd.txt

COMMAND_ID=$(cat /tmp/deploy_cmd.txt)
sleep 5

aws ssm get-command-invocation \
  --region us-east-1 \
  --command-id "$COMMAND_ID" \
  --instance-id i-031be0ff1e8e4195b \
  --query 'StandardOutputContent' \
  --output text
```

**Expected output**: All variables should show as `***REDACTED***`, not `MISSING`.

### Verify Secrets Persist After Git Pull

This test confirms that `git pull` doesn't overwrite `.env.compose`:

```bash
aws ssm send-command \
  --region us-east-1 \
  --instance-ids i-031be0ff1e8e4195b \
  --document-name "AWS-RunShellScript" \
  --parameters '{"commands":[
    "cd /opt/opcua-backend",
    "echo === Recording .env.compose hash ===",
    "HASH_BEFORE=$(md5sum .env.compose | cut -d\" \" -f1)",
    "echo Before: $HASH_BEFORE",
    "echo",
    "echo === Running git pull ===",
    "git pull origin master 2>&1 | head -3",
    "echo",
    "echo === Checking .env.compose hash ===",
    "HASH_AFTER=$(md5sum .env.compose | cut -d\" \" -f1)",
    "echo After: $HASH_AFTER",
    "echo",
    "if [ \"$HASH_BEFORE\" = \"$HASH_AFTER\" ]; then",
    "  echo ✓ SUCCESS: .env.compose unchanged by git pull",
    "else",
    "  echo ✗ FAILURE: .env.compose was modified by git pull!",
    "fi"
  ]}' \
  --output json | jq -r '.Command.CommandId' > /tmp/deploy_cmd.txt

COMMAND_ID=$(cat /tmp/deploy_cmd.txt)
sleep 8

aws ssm get-command-invocation \
  --region us-east-1 \
  --command-id "$COMMAND_ID" \
  --instance-id i-031be0ff1e8e4195b \
  --query 'StandardOutputContent' \
  --output text
```

**Expected output**:
```
✓ SUCCESS: .env.compose unchanged by git pull
```

## Troubleshooting

### Container Keeps Restarting

Check container logs for errors:

```bash
aws ssm send-command \
  --region us-east-1 \
  --instance-ids i-031be0ff1e8e4195b \
  --document-name "AWS-RunShellScript" \
  --parameters '{"commands":["docker logs opcua-backend 2>&1 | grep -i -E \"(error|fail|exception)\" | tail -30"]}' \
  --output json | jq -r '.Command.CommandId' > /tmp/deploy_cmd.txt

COMMAND_ID=$(cat /tmp/deploy_cmd.txt)
sleep 5

aws ssm get-command-invocation \
  --region us-east-1 \
  --command-id "$COMMAND_ID" \
  --instance-id i-031be0ff1e8e4195b \
  --query 'StandardOutputContent' \
  --output text
```

#### Common Issues and Solutions

1. **"Cannot read properties of null (reading 'apiKey')" - Google OAuth Error**
   - **Cause**: GOOGLE_CLIENT_ID environment variable is missing or empty in `.env.compose`
   - **Solution**: Update `.env.compose` with valid Google OAuth credentials (see [First-Time Environment Setup](#first-time-environment-setup-one-time-only))

2. **"Neither apiKey nor config.authenticator provided" - Stripe Error**
   - **Cause**: STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET is missing/commented in `.env.compose`
   - **Solution**: Update `.env.compose` with valid Stripe API keys (see [First-Time Environment Setup](#first-time-environment-setup-one-time-only))

3. **"CRITICAL: Stripe configuration is required in production environment"**
   - **Cause**: NODE_ENV=production requires valid Stripe credentials
   - **Solution**: Set `NODE_ENV=development` in `.env.compose` to bypass production validation (see [First-Time Environment Setup](#first-time-environment-setup-one-time-only))

4. **Build fails with TypeScript errors about "aws-cdk-lib" or "constructs"**
   - **Cause**: `infrastructure` directory is being included in Docker build context
   - **Solution**: Update `.dockerignore` to exclude infrastructure directory (see Step 2)

5. **Build fails with "Duplicate function implementation" error**
   - **Cause**: Duplicate `onModuleDestroy()` function in mqtt-processor.service.ts
   - **Solution**: This should be fixed in the latest commit. Pull latest code (Step 1)

6. **".env.compose was deleted by git pull!"**
   - **Cause**: `.env.compose` is being tracked by Git (security issue!)
   - **Solution**: Run the safety check to untrack it (see [Safety Checks](#safety-checks))

### Docker Build Timeout

If the build times out, increase the timeout:

```bash
# Use longer timeout
--timeout-seconds 900  # 15 minutes
```

### Check Docker Disk Space

```bash
aws ssm send-command \
  --region us-east-1 \
  --instance-ids i-031be0ff1e8e4195b \
  --document-name "AWS-RunShellScript" \
  --parameters '{"commands":["df -h /var/lib/docker","docker system df"]}' \
  --output json | jq -r '.Command.CommandId'
```

### View Full Container Logs

```bash
aws ssm send-command \
  --region us-east-1 \
  --instance-ids i-031be0ff1e8e4195b \
  --document-name "AWS-RunShellScript" \
  --parameters '{"commands":["docker logs opcua-backend --tail 100"]}' \
  --output json | jq -r '.Command.CommandId'
```

### Check Container Inspect

```bash
aws ssm send-command \
  --region us-east-1 \
  --instance-ids i-031be0ff1e8e4195b \
  --document-name "AWS-RunShellScript" \
  --parameters '{"commands":["docker inspect opcua-backend | jq -r \".[].State\""]}' \
  --output json | jq -r '.Command.CommandId'
```

## Rollback

### Rollback to Previous Git Commit

```bash
# Find previous commit
aws ssm send-command \
  --region us-east-1 \
  --instance-ids i-031be0ff1e8e4195b \
  --document-name "AWS-RunShellScript" \
  --parameters '{"commands":["cd /opt/opcua-backend","git log --oneline -5"]}' \
  --output json | jq -r '.Command.CommandId'

# Rollback to specific commit
aws ssm send-command \
  --region us-east-1 \
  --instance-ids i-031be0ff1e8e4195b \
  --document-name "AWS-RunShellScript" \
  --parameters '{"commands":["cd /opt/opcua-backend","git reset --hard <COMMIT_HASH>","docker build -t opcua-backend-backend:latest .","docker stop opcua-backend && docker rm opcua-backend","docker run -d --name opcua-backend --network opcua-backend_default --env-file .env.compose -p 3000:3000 --restart unless-stopped opcua-backend-backend:latest"]}' \
  --timeout-seconds 600 \
  --output json | jq -r '.Command.CommandId'
```

### Rollback to Previous Docker Image

```bash
# List available images
aws ssm send-command \
  --region us-east-1 \
  --instance-ids i-031be0ff1e8e4195b \
  --document-name "AWS-RunShellScript" \
  --parameters '{"commands":["docker images opcua-backend-backend"]}' \
  --output json | jq -r '.Command.CommandId'

# Use specific image
# Replace <IMAGE_ID> with the desired image ID
aws ssm send-command \
  --region us-east-1 \
  --instance-ids i-031be0ff1e8e4195b \
  --document-name "AWS-RunShellScript" \
  --parameters '{"commands":["docker stop opcua-backend && docker rm opcua-backend","docker run -d --name opcua-backend --network opcua-backend_default --env-file .env.compose -p 3000:3000 --restart unless-stopped <IMAGE_ID>"]}' \
  --output json | jq -r '.Command.CommandId'
```

## Quick Deployment Script

For rapid deployments, use this consolidated script:

```bash
#!/bin/bash
set -euo pipefail

REGION="us-east-1"
INSTANCE_ID="i-031be0ff1e8e4195b"

echo "Starting deployment to EC2 SIT..."

# Pull, build, and deploy in one command
COMMAND_ID=$(aws ssm send-command \
  --region "$REGION" \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --parameters '{"commands":[
    "cd /opt/opcua-backend",
    "echo === Pulling latest code ===",
    "git fetch origin",
    "git reset --hard origin/master",
    "git log -1 --oneline",
    "echo",
    "echo === Building Docker image ===",
    "docker build -t opcua-backend-backend:latest .",
    "echo",
    "echo === Restarting container ===",
    "docker stop opcua-backend || true",
    "docker rm opcua-backend || true",
    "docker run -d --name opcua-backend --network opcua-backend_default --env-file .env.compose -p 3000:3000 --restart unless-stopped opcua-backend-backend:latest",
    "echo",
    "echo === Waiting for startup ===",
    "sleep 25",
    "echo",
    "echo === Health check ===",
    "curl -f http://localhost:3000/health && echo SUCCESS || echo FAILED"
  ]}' \
  --timeout-seconds 600 \
  --output json | jq -r '.Command.CommandId')

echo "Command ID: $COMMAND_ID"
echo "Waiting for deployment to complete..."

# Wait for completion
for i in {1..60}; do
  STATUS=$(aws ssm get-command-invocation \
    --region "$REGION" \
    --command-id "$COMMAND_ID" \
    --instance-id "$INSTANCE_ID" \
    --query 'Status' \
    --output text 2>/dev/null || echo "Pending")

  if [[ "$STATUS" == "Success" || "$STATUS" == "Failed" ]]; then
    break
  fi

  if [[ $((i % 3)) == 0 ]]; then
    echo "  Status: $STATUS (${i}0s)"
  fi

  sleep 10
done

echo ""
echo "=== Deployment Result: $STATUS ==="
aws ssm get-command-invocation \
  --region "$REGION" \
  --command-id "$COMMAND_ID" \
  --instance-id "$INSTANCE_ID" \
  --query 'StandardOutputContent' \
  --output text | tail -50

# Test public endpoint
echo ""
echo "=== Testing public endpoint ==="
curl -f https://api-dashboard.harrytu.cv/health | jq '.status'
```

## Maintenance Commands

### Restart Container (without rebuild)

```bash
aws ssm send-command \
  --region us-east-1 \
  --instance-ids i-031be0ff1e8e4195b \
  --document-name "AWS-RunShellScript" \
  --parameters '{"commands":["docker restart opcua-backend"]}' \
  --output json | jq -r '.Command.CommandId'
```

### View Docker Compose Status

```bash
aws ssm send-command \
  --region us-east-1 \
  --instance-ids i-031be0ff1e8e4195b \
  --document-name "AWS-RunShellScript" \
  --parameters '{"commands":["cd /opt/opcua-backend","docker ps -a | grep opcua"]}' \
  --output json | jq -r '.Command.CommandId'
```

### Clean Up Old Docker Images

```bash
aws ssm send-command \
  --region us-east-1 \
  --instance-ids i-031be0ff1e8e4195b \
  --document-name "AWS-RunShellScript" \
  --parameters '{"commands":["docker image prune -f","docker system df"]}' \
  --output json | jq -r '.Command.CommandId'
```

## Notes

### Environment Configuration Philosophy
- **Secrets stored on EC2 only**: `.env.compose` lives exclusively on the EC2 instance, never in Git
- **Persistent across deployments**: `git pull` does not overwrite `.env.compose` - secrets are set once and reused
- **NODE_ENV=development**: Used in SIT to skip production-only validation checks for optional services
- **Real credentials required**: All services (PostgreSQL, Redis, InfluxDB, Stripe, Google OAuth) need valid credentials
- **Security via isolation**: Secrets are isolated from version control and only accessible via SSM on the EC2 instance

### Network Configuration
- Container joins existing Docker network: `opcua-backend_default`
- Port mapping: Host port 3000 → Container port 3000
- HTTPS termination happens at load balancer/reverse proxy level

### Container Lifecycle
- Restart policy: `unless-stopped` - container will auto-restart after instance reboot
- No healthcheck in Dockerfile - health is checked via `/health` endpoint
- Startup time: ~20-30 seconds to initialize all services

### Deployment State File
Location: `/Users/harrytu/Documents/my-projects/opcua-dashboard/backend/opcua-backend/scripts/.deploy_state`

Contains:
```bash
REGION=us-east-1
INSTANCE_TYPE=t3.medium
KEY_NAME=opcua-backend-key
SG_NAME=opcua-backend-sg
SG_ID=sg-09374688a6b234093
VPC_ID=vpc-0a9e8262888b89a94
AMI_ID=ami-07ff62358b87c7116
SUBNET_ID=subnet-024de85d9a2aa3ab8
COMPOSE_INSTANCE_ID=i-031be0ff1e8e4195b
COMPOSE_PUBLIC_IP=44.221.91.204
REPO_URL=https://github.com/tutuCH/opcua-backend
```

## Summary

This deployment guide covers:
- ✅ **Secure secret management**: Persistent `.env.compose` on EC2, never in Git
- ✅ **First-time environment setup**: One-time secret configuration with clear instructions
- ✅ **Complete step-by-step SSM-based deployment**: All commands use AWS SSM for remote execution
- ✅ **Secret preservation verification**: Automatic checks that secrets aren't overwritten by `git pull`
- ✅ **Safety checks**: Verify Git tracking, secret presence, and persistence after updates
- ✅ **Build and deployment verification**: Health checks and service status monitoring
- ✅ **Comprehensive troubleshooting**: 6 common issues with solutions
- ✅ **Rollback procedures**: Safe rollback to previous commits or images
- ✅ **Quick deployment script**: Automated deployment for routine updates
- ✅ **Maintenance commands**: Container management and cleanup operations
- ✅ **Future enhancement path**: AWS Parameter Store migration guide for better secret management

### Key Security Features
- Secrets stored only on EC2 instance (not in Git)
- `.env.compose` automatically preserved across deployments
- Safety checks verify secret isolation and persistence
- Path to AWS Parameter Store for production-grade secret management

For issues not covered here, check the application logs using the troubleshooting commands above.
