# OPCUA Backend - AWS CDK Infrastructure

One-command deployment of the OPCUA IoT backend to AWS with static IP (Elastic IP).

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure AWS credentials
aws configure

# 3. Deploy to AWS
./deploy.sh
```

That's it! The script will deploy everything and give you the static IP address.

## What Gets Deployed

- **VPC** with public subnet
- **EC2 t3.medium** instance (2 vCPU, 4 GB RAM, 50 GB storage)
- **Elastic IP** (static IP address)
- **Security Group** (ports 22, 80, 443, 3000, 1883)
- **Docker Compose** with all services:
  - NestJS Backend
  - PostgreSQL
  - InfluxDB (30-day retention)
  - Redis
  - Mosquitto MQTT

## Cost

**$35-45/month** for 50-100 machines

| Component | Monthly Cost |
|-----------|-------------|
| EC2 t3.medium | $30.37 |
| EBS 50 GB | $4.00 |
| Elastic IP | $0.00 (free when attached) |
| **Total** | **~$35/month** |

## Prerequisites

### 1. Install AWS CLI

**macOS:**
```bash
brew install awscli
```

**Linux:**
```bash
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
```

**Windows:**
Download from: https://aws.amazon.com/cli/

### 2. Install AWS CDK

```bash
npm install -g aws-cdk
```

### 3. Install jq

**macOS:**
```bash
brew install jq
```

**Linux:**
```bash
sudo apt-get install jq
```

### 4. Configure AWS Credentials

```bash
aws configure
```

Enter your:
- AWS Access Key ID
- AWS Secret Access Key
- Default region (e.g., `us-east-1`)
- Default output format: `json`

Get credentials from: https://console.aws.amazon.com/iam/home#/security_credentials

## Deployment

### First Deployment

```bash
cd infrastructure
./deploy.sh
```

The script will:
1. ✅ Check prerequisites
2. 📦 Install CDK dependencies
3. 🏗️  Bootstrap CDK (first time only)
4. 🔍 Validate stack
5. 🚀 Deploy to AWS
6. ⏳ Wait for services to start
7. 🧪 Run health checks
8. 📝 Save connection details

### Output

```
✅ Deployment complete!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 Elastic IP:      52.12.34.56
🖥️  Instance ID:     i-0123456789abcdef0
🌐 Backend URL:     http://52.12.34.56:3000
📡 MQTT Broker:     mqtt://52.12.34.56:1883
🔌 WebSocket URL:   ws://52.12.34.56:3000/socket.io/
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 Connection details saved to backend.env
```

## Testing

### Automated Tests

```bash
cd infrastructure
npm run test
```

### Manual Tests

```bash
# Health check
curl http://<elastic-ip>:3000/health

# MQTT test
mosquitto_pub -h <elastic-ip> -t factory/test/machine/test-001/realtime -m '{"test": "data"}'

# WebSocket test
wscat -c ws://<elastic-ip>:3000/socket.io/
```

## Management

### View Deployment Status

```bash
cdk diff        # Show differences
cdk synth       # Generate CloudFormation template
```

### SSH into Instance

```bash
ssh ec2-user@<elastic-ip>
```

### View Logs

```bash
# User data log (setup script)
ssh ec2-user@<elastic-ip> 'sudo tail -100 /var/log/user-data.log'

# Docker Compose logs
ssh ec2-user@<elastic-ip> 'cd /opt/opcua-backend && docker-compose logs -f'

# Specific service logs
ssh ec2-user@<elastic-ip> 'cd /opt/opcua-backend && docker-compose logs -f backend'
```

### Restart Services

```bash
ssh ec2-user@<elastic-ip> 'cd /opt/opcua-backend && docker-compose restart'
```

### Update Application Code

```bash
# SSH into instance
ssh ec2-user@<elastic-ip>

# Pull latest code
cd /opt/opcua-backend
git pull

# Rebuild and restart
docker-compose down
docker-compose up -d --build
```

## Destroy Stack

**Warning:** This will delete all resources including data!

```bash
cd infrastructure
cdk destroy
```

## Configuration

### Update Repository URL

Before deploying, update the repository URL in:

**File:** `lib/opcua-backend-stack.ts`

Find and replace:
```typescript
'git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git opcua-backend || {'
```

### Restrict SSH Access

For security, restrict SSH to your IP address only:

**File:** `lib/opcua-backend-stack.ts`

Find and replace:
```typescript
securityGroup.addIngressRule(
  ec2.Peer.anyIpv4(),  // Change this
  ec2.Port.tcp(22),
  'Allow SSH - UPDATE TO YOUR IP!'
);
```

To:
```typescript
securityGroup.addIngressRule(
  ec2.Peer.ipv4('YOUR_IP_ADDRESS/32'),  // e.g., 123.45.67.89/32
  ec2.Port.tcp(22),
  'Allow SSH from my IP'
);
```

Then redeploy:
```bash
cdk deploy
```

## Stack Outputs

The deployment exports these values:

- **ElasticIP**: Static IP address
- **InstanceId**: EC2 instance ID
- **BackendURL**: `http://<ip>:3000`
- **HealthCheckURL**: `http://<ip>:3000/health`
- **MQTTBroker**: `mqtt://<ip>:1883`
- **WebSocketURL**: `ws://<ip>:3000/socket.io/`
- **SSHCommand**: `ssh ec2-user@<ip>`

Access outputs:
```bash
cat outputs.json | jq
```

## Monitoring

### CloudWatch Logs

The EC2 instance has CloudWatch Logs agent installed. View logs in:
https://console.aws.amazon.com/cloudwatch/home#logsV2:log-groups

### EC2 Metrics

View instance metrics:
```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/EC2 \
  --metric-name CPUUtilization \
  --dimensions Name=InstanceId,Value=<instance-id> \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-01T23:59:59Z \
  --period 3600 \
  --statistics Average
```

## Troubleshooting

### Health Check Fails

```bash
# Check if EC2 is running
aws ec2 describe-instance-status --instance-ids <instance-id>

# SSH and check Docker
ssh ec2-user@<elastic-ip>
docker-compose ps
docker-compose logs

# Check user data execution
sudo cat /var/log/user-data.log
```

### Docker Services Not Starting

```bash
ssh ec2-user@<elastic-ip>
cd /opt/opcua-backend

# Check status
docker-compose ps

# View logs
docker-compose logs

# Restart
docker-compose down
docker-compose up -d
```

### Repository Clone Failed

If you see "Failed to clone repository" error:

1. Update the repository URL in `lib/opcua-backend-stack.ts`
2. Redeploy: `cdk deploy`

Or manually clone on the instance:
```bash
ssh ec2-user@<elastic-ip>
cd /opt
sudo rm -rf opcua-backend
git clone <your-repo-url> opcua-backend
cd opcua-backend
docker-compose up -d
```

## Architecture

```
┌─────────────────────────────────────────┐
│  VPC (10.0.0.0/16)                     │
│  ┌──────────────────────────────────┐  │
│  │  Public Subnet                   │  │
│  │                                  │  │
│  │  ┌────────────────────────────┐ │  │
│  │  │ EC2 t3.medium             │ │  │
│  │  │ - Elastic IP (Static)     │ │  │
│  │  │ - Docker Compose:         │ │  │
│  │  │   • NestJS                │ │  │
│  │  │   • PostgreSQL            │ │  │
│  │  │   • InfluxDB              │ │  │
│  │  │   • Redis                 │ │  │
│  │  │   • Mosquitto             │ │  │
│  │  └────────────────────────────┘ │  │
│  └──────────────────────────────────┘  │
│                                         │
│  Security Group:                        │
│  - Port 22 (SSH)                        │
│  - Port 80 (HTTP)                       │
│  - Port 443 (HTTPS)                     │
│  - Port 3000 (Backend API)              │
│  - Port 1883 (MQTT)                     │
└─────────────────────────────────────────┘
```

## Additional Resources

- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [EC2 User Guide](https://docs.aws.amazon.com/ec2/)
- [Full Deployment Guide](../docs/AWS_CDK_DEPLOYMENT.md)
