# Scripts Directory

This directory contains organized deployment, utility, and testing scripts for the OPC UA Backend.

## Directory Structure

```
scripts/
├── sit/                    # SIT Environment Scripts
│   └── deploy.sh          # One-command SIT deployment (SSM-based)
│
├── utilities/             # Utility Scripts
│   ├── logs.sh           # View application logs via SSM
│   ├── status.sh         # Check EC2 instance status
│   └── teardown.sh       # Terminate instance and cleanup
│
├── testing/               # Testing Scripts
│   ├── test-spc-api.sh           # SPC API endpoint tests
│   └── sse-connection-burst.ts   # SSE connection load tests
│
└── archive/               # Deprecated/Unused Scripts
    ├── deploy.sh                 # Old: Creates new instances
    ├── update.sh                 # Old: SSH-based updates
    ├── deploy-ec2.sh             # Old: Redirect script
    ├── deploy-compose.sh         # Old: Redirect script
    ├── setup.sh                  # Old: Initial AWS setup
    ├── ssh.sh                    # Old: SSH access
    ├── deploy-demo.sh            # Old: Demo deployment
    └── teardown-demo.sh          # Old: Demo cleanup
```

## SIT Environment Scripts

### `sit/deploy.sh` - One-Command Deployment

**Purpose**: Deploys the latest code from master to the existing SIT EC2 instance.

**What it does**:
1. Pre-flight checks (AWS CLI, credentials, instance status, SSM connectivity)
2. Pulls latest code from Git (with .env.compose preservation verification)
3. Rebuilds and restarts Docker Compose services
4. Verifies health endpoint
5. Shows recent application logs

**Usage**:
```bash
# Interactive mode (with confirmation prompt)
./scripts/sit/deploy.sh

# Non-interactive mode (skip confirmation)
./scripts/sit/deploy.sh --skip-confirmation
```

**Prerequisites**:
- AWS CLI configured with us-east-1 credentials
- .env.compose file exists on EC2 at /opt/opcua-backend/
- EC2 instance i-031be0ff1e8e4195b is running
- SSM agent is active on instance

**Output**:
- Real-time deployment progress
- Health check results
- Recent application logs
- Deployment summary with endpoints

**Time**: Typically 2-3 minutes

## Utility Scripts

### `utilities/logs.sh` - View Application Logs

**Purpose**: Fetches and displays application logs from SIT via SSM.

**Usage**:
```bash
# Last 50 lines of app service (default)
./scripts/utilities/logs.sh

# Last 100 lines of app service
./scripts/utilities/logs.sh 100

# Last 200 lines of postgres service
./scripts/utilities/logs.sh 200 postgres

# Available services: app, postgres, influxdb, redis, mqtt
```

### `utilities/status.sh` - Check Instance Status

**Purpose**: Shows EC2 instance status, public IP, and basic info.

**Usage**:
```bash
./scripts/utilities/status.sh
```

**Output**:
- Instance ID and state
- Public IP address
- Instance type
- Launch time
- Key pair (if any)

### `utilities/teardown.sh` - Terminate Instance

**Purpose**: Terminates the EC2 instance and cleans up associated resources.

**Usage**:
```bash
./scripts/utilities/teardown.sh
```

**Warning**: This will permanently destroy the instance. Use with caution.

## Testing Scripts

### `testing/test-spc-api.sh` - SPC API Tests

**Purpose**: Tests all SPC API v2.0 endpoints.

**Usage**:
```bash
# Get access token first
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"tuchenhsien@gmail.com","password":"abc123"}' \
  | jq -r '.access_token')

# Run tests
./scripts/testing/test-spc-api.sh $TOKEN
```

**Tests**:
1. SPC Limits endpoint
2. SPC Latest endpoint
3. SPC History Optimized endpoint
4. SPC Metadata endpoint
5. Field validation (should return 400)
6. Multiple fields in one request

### `testing/sse-connection-burst.ts` - SSE Load Tests

**Purpose**: Tests SSE connection handling under load.

**Usage**:
```bash
# Run with TypeScript runtime (bun/tsx/ts-node)
bun scripts/testing/sse-connection-burst.ts \
  --baseUrl http://localhost:3000 \
  --deviceId C02 \
  --count 3 \
  --durationMs 10000 \
  --email tuchenhsien@gmail.com \
  --password abc123
```

**Options**:
- `--baseUrl`: API base URL (default: http://localhost:3000)
- `--deviceId`: Device ID to subscribe to (default: C02)
- `--count`: Number of concurrent connections (default: 3)
- `--durationMs`: Test duration in milliseconds (default: 10000)
- `--email`: Login email
- `--password`: Login password
- `--token`: Pre-existing access token (skip login)

## Archive (Deprecated Scripts)

The `archive/` directory contains old scripts that are no longer used in the SIT workflow:

- **deploy.sh**: Creates NEW EC2 instances (not for updating SIT)
- **update.sh**: SSH-based updates (doesn't work, instance has no key pair)
- **deploy-ec2.sh / deploy-compose.sh**: Deprecated redirects
- **setup.sh**: One-time AWS infrastructure setup (already completed)
- **ssh.sh**: SSH access (not useful without key pair)
- **deploy-demo.sh / teardown-demo.sh**: Demo environment scripts

These are kept for reference but should not be used for SIT deployments.

## Quick Reference

### Deploy to SIT
```bash
./scripts/sit/deploy.sh
```

### Check if deployment worked
```bash
curl https://api-dashboard.harrytu.cv/health | jq '.'
```

### View logs after deployment
```bash
./scripts/utilities/logs.sh
```

### Check instance status
```bash
./scripts/utilities/status.sh
```

## Environment Details

**SIT Environment**:
- **Region**: us-east-1
- **Instance ID**: i-031be0ff1e8e4195b
- **Instance Type**: t3.medium
- **Public Endpoint**: https://api-dashboard.harrytu.cv
- **App Directory**: /opt/opcua-backend
- **Environment File**: .env.compose (persistent, never in Git)

**Docker Services**:
- **app**: NestJS backend application
- **postgres**: PostgreSQL database
- **influxdb**: Time-series database
- **redis**: Cache and message queue
- **mqtt**: Mosquitto MQTT broker

## Troubleshooting

### Deployment fails at git pull
- **Cause**: .env.compose file missing or Git conflicts
- **Solution**: Check safety verification output, ensure .env.compose exists

### Deployment fails at docker compose build
- **Cause**: TypeScript compilation errors or missing dependencies
- **Solution**: Check local build first with `npm run build`

### Health check fails after deployment
- **Cause**: Application startup errors or missing environment variables
- **Solution**: Check logs with `./scripts/utilities/logs.sh`

### SSM commands timeout
- **Cause**: Instance SSM agent not responding
- **Solution**: Check instance status, restart instance if needed

## Migration from Old Scripts

If you have existing workflows using old scripts:

| Old Script | New Equivalent | Notes |
|------------|----------------|-------|
| `./scripts/deploy.sh` | `./scripts/sit/deploy.sh` | Now SSM-based, no SSH needed |
| `./scripts/update.sh` | `./scripts/sit/deploy.sh` | Same functionality, SSM instead of SSH |
| `ssh -i key.pem ec2-user@IP` | `./scripts/utilities/logs.sh` | View logs via SSM |
| Manual status checks | `./scripts/utilities/status.sh` | Automated status check |

## Best Practices

1. **Always use sit/deploy.sh for SIT deployments**
   - Don't use archived scripts
   - Don't manually SSH into the instance

2. **Test locally first**
   - Run `npm run build` locally before deploying
   - Ensure TypeScript compiles without errors

3. **Check logs after deployment**
   - Always verify the application started correctly
   - Use `./scripts/utilities/logs.sh` to check for startup errors

4. **Monitor health endpoint**
   - Test with: `curl https://api-dashboard.harrytu.cv/health`
   - Ensure all services report "healthy"

5. **Keep .env.compose on EC2**
   - Never commit secrets to Git
   - The deployment script verifies .env.compose preservation

## See Also

- [EC2 SIT Deployment Guide](../docs/EC2_SIT_DEPLOYMENT_GUIDE.md) - Detailed deployment documentation
- [CLAUDE.md](../CLAUDE.md) - Architecture and development commands
