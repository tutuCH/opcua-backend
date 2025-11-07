# OPC UA Backend - AWS EC2 Deployment Guide

This guide covers deploying the OPC UA backend demo to AWS EC2 with a single command.

## Quick Start

Deploy all services (PostgreSQL, InfluxDB, Redis, MQTT, NestJS) to AWS EC2 in one command:

```bash
./scripts/deploy-demo.sh
```

That's it! The script will:
- ✓ Generate secure credentials automatically
- ✓ Create AWS infrastructure (security group, key pair)
- ✓ Launch EC2 instance with all services
- ✓ Wait for health checks
- ✓ Output access URLs and credentials

## Prerequisites

### 1. AWS CLI
```bash
# Install AWS CLI
# macOS
brew install awscli

# Linux
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Configure with your credentials
aws configure
```

### 2. jq (JSON processor)
```bash
# macOS
brew install jq

# Linux
sudo apt-get install jq  # Debian/Ubuntu
sudo yum install jq      # RHEL/Amazon Linux
```

### 3. AWS Permissions

Your AWS user/role needs these permissions:
- EC2: `run-instances`, `describe-instances`, `terminate-instances`
- EC2: `create-security-group`, `authorize-security-group-ingress`, `delete-security-group`
- EC2: `create-key-pair`, `describe-key-pairs`, `delete-key-pair`
- EC2: `describe-vpcs`, `describe-subnets`
- SSM: `get-parameters` (for AMI resolution)

## Deployment Options

### Basic Deployment (Default Region & Instance Type)
```bash
./scripts/deploy-demo.sh
```
- Region: `us-east-1`
- Instance: `t3.small` (2 vCPU, 2 GB RAM)
- Cost: ~$0.02/hour (~$15/month if left running)

### Custom Region
```bash
./scripts/deploy-demo.sh us-west-2
```

### Custom Instance Type
```bash
./scripts/deploy-demo.sh us-east-1 t3.medium
```

**Recommended instance types:**
- `t3.small` - Minimal demo (2 vCPU, 2 GB)
- `t3.medium` - Moderate load (2 vCPU, 4 GB) ⭐ **Recommended**
- `t3.large` - Production testing (2 vCPU, 8 GB)

## What Gets Deployed

### Services
1. **PostgreSQL** (port 5432) - User data, factories, machines
2. **InfluxDB** (port 8086) - Time-series machine metrics
3. **Redis** (port 6379) - Message queue and caching
4. **Mosquitto MQTT** (port 1883, 9001) - IoT device communication
5. **NestJS Backend** (port 80, 3000) - REST API and WebSocket

### AWS Resources
- EC2 Instance (Amazon Linux 2023)
- Security Group (`opcua-demo-sg`)
  - Port 22: SSH (0.0.0.0/0)
  - Port 80: HTTP (0.0.0.0/0)
  - Port 3000: Backend API (0.0.0.0/0)
  - Port 1883: MQTT (0.0.0.0/0)
  - Port 9001: MQTT WebSocket (0.0.0.0/0)
- SSH Key Pair (`opcua-demo-key`)

### Generated Files
```
.deploy-demo.json          # Deployment state (instance ID, IP, etc.)
.env.compose              # Environment with auto-generated secrets
deployment-info.txt       # Credentials and access information
opcua-demo-key.pem        # SSH private key (chmod 400)
```

⚠️ **Keep these files secure! They contain passwords and SSH keys.**

## After Deployment

### Access Your Backend

The deployment outputs:
```
================================================================================
✓ Deployment Successful!
================================================================================

🌐 API Endpoint:     http://54.123.45.67/
🏥 Health Check:     http://54.123.45.67/health
🔌 WebSocket:        ws://54.123.45.67/socket.io/

🔑 SSH Access:
   ssh -i opcua-demo-key.pem ec2-user@54.123.45.67

📝 Credentials saved to: deployment-info.txt
⚠️  Keep this file secure - it contains passwords!
================================================================================
```

### Test the Deployment

```bash
# Check health endpoint
curl http://<PUBLIC_IP>/health

# Should return:
# {"status":"ok","timestamp":"2024-...","uptime":...}
```

### SSH Into Instance

```bash
ssh -i opcua-demo-key.pem ec2-user@<PUBLIC_IP>

# Once connected, view services:
cd /opt/app/src
sudo docker compose ps

# View logs:
sudo docker compose logs -f backend
sudo docker compose logs -f postgres
sudo docker compose logs -f influxdb
sudo docker compose logs -f redis
sudo docker compose logs -f mosquitto
```

### Connect Production Injection Machines

Your injection machines should connect to the MQTT broker:

**MQTT Broker:**
- Host: `<PUBLIC_IP>`
- Port: `1883` (TCP) or `9001` (WebSocket)
- Authentication: Anonymous (demo mode)

**Topic Pattern:**
```
factory/{factoryId}/machine/{deviceId}/realtime
factory/{factoryId}/machine/{deviceId}/spc
factory/{factoryId}/machine/{deviceId}/tech
```

**Example (using mosquitto_pub):**
```bash
mosquitto_pub -h <PUBLIC_IP> -p 1883 \
  -t "factory/1/machine/device-001/realtime" \
  -m '{"devId":"device-001","timestamp":1234567890,"Data":{"OT":75.5,"STS":1,...}}'
```

## Managing the Deployment

### View Service Status
```bash
ssh -i opcua-demo-key.pem ec2-user@<PUBLIC_IP>
cd /opt/app/src
sudo docker compose ps
```

### Restart Services
```bash
# Restart all services
sudo docker compose restart

# Restart specific service
sudo docker compose restart backend
sudo docker compose restart postgres
```

### View Logs
```bash
# All services
sudo docker compose logs -f

# Specific service
sudo docker compose logs -f backend

# Last 100 lines
sudo docker compose logs --tail 100 backend
```

### Update Backend Code
```bash
ssh -i opcua-demo-key.pem ec2-user@<PUBLIC_IP>
cd /opt/app/src

# Pull latest code
git pull

# Rebuild and restart
sudo docker compose build backend
sudo docker compose up -d backend
```

## Cleanup

Remove all AWS resources:

```bash
./scripts/teardown-demo.sh
```

This will:
- Terminate the EC2 instance
- Delete the security group
- Delete the SSH key pair
- Remove local deployment files

⚠️ **Warning:** This action cannot be undone. All data will be lost.

## Troubleshooting

### Deployment Hangs on "Waiting for services"

**Symptoms:** Script times out after 5 minutes

**Solutions:**
1. SSH into instance and check logs:
   ```bash
   ssh -i opcua-demo-key.pem ec2-user@<PUBLIC_IP>
   sudo tail -f /var/log/user-data.log
   cd /opt/app/src && sudo docker compose logs
   ```

2. Check Docker status:
   ```bash
   sudo systemctl status docker
   sudo docker ps -a
   ```

3. Manually verify health:
   ```bash
   curl http://localhost:3000/health
   ```

### Services Won't Start

**Check Docker Compose logs:**
```bash
ssh -i opcua-demo-key.pem ec2-user@<PUBLIC_IP>
cd /opt/app/src
sudo docker compose logs backend
```

**Common issues:**
- Database connection failed → Check PostgreSQL logs: `sudo docker compose logs postgres`
- Redis connection failed → Check Redis logs: `sudo docker compose logs redis`
- InfluxDB not ready → Check InfluxDB logs: `sudo docker compose logs influxdb`

### Can't SSH to Instance

**Verify security group allows SSH:**
```bash
aws ec2 describe-security-groups \
  --group-names opcua-demo-sg \
  --query 'SecurityGroups[0].IpPermissions'
```

**Check key permissions:**
```bash
chmod 400 opcua-demo-key.pem
```

### Port 1883 (MQTT) Not Accessible

**Verify security group rules:**
```bash
# Add MQTT port manually if needed
aws ec2 authorize-security-group-ingress \
  --group-name opcua-demo-sg \
  --protocol tcp \
  --port 1883 \
  --cidr 0.0.0.0/0
```

### Out of Disk Space

**Check disk usage:**
```bash
ssh -i opcua-demo-key.pem ec2-user@<PUBLIC_IP>
df -h
```

**Clean Docker resources:**
```bash
sudo docker system prune -a
```

### Deployment State File Conflicts

If you see "A deployment may already exist":

```bash
# Option 1: Teardown existing deployment
./scripts/teardown-demo.sh

# Option 2: Force new deployment (risky)
rm -f .deploy-demo.json
./scripts/deploy-demo.sh
```

## Security Considerations

### ⚠️ Demo Mode Warnings

This deployment is optimized for **demo/testing purposes only**. Security considerations:

1. **Default Passwords** - Auto-generated but stored in plaintext
2. **Open MQTT** - Anonymous access enabled
3. **HTTP Only** - No SSL/TLS encryption
4. **Wide Security Group** - Ports open to 0.0.0.0/0

### Production Hardening (Future)

For production use, consider:
- [ ] Use AWS Secrets Manager for credentials
- [ ] Add SSL/TLS certificates (Let's Encrypt)
- [ ] Restrict security group to specific IPs
- [ ] Enable MQTT authentication
- [ ] Use managed services (RDS, ElastiCache, etc.)
- [ ] Add CloudWatch logging and monitoring
- [ ] Implement backup strategy for data
- [ ] Use IAM roles instead of access keys

## Cost Estimation

**EC2 Instance (t3.small, us-east-1):**
- Hourly: $0.0208
- Daily: ~$0.50
- Monthly: ~$15.00

**Data Transfer:**
- First 100 GB/month: Free
- Additional: $0.09/GB

**Storage (EBS gp3):**
- Included in instance (20 GB root volume)

**Total estimated cost:** ~$15-20/month for continuous operation

💡 **Tip:** Stop the instance when not in use to save costs. Storage costs continue even when stopped.

## Advanced Configuration

### Custom Environment Variables

Edit `.env.compose.template` before deploying to customize:
- `FRONTEND_URL` - Your frontend application URL
- `ENABLE_MOCK_DATA` - Enable/disable mock data generation
- AWS integration settings (Cognito, Timestream, etc.)

Then re-run:
```bash
./scripts/deploy-demo.sh
```

### Attach Custom Domain

After deployment, you can:
1. Create Route53 hosted zone
2. Add A record pointing to EC2 public IP
3. Use Certbot for SSL:
   ```bash
   ssh -i opcua-demo-key.pem ec2-user@<PUBLIC_IP>
   sudo dnf install certbot
   sudo certbot certonly --standalone -d your-domain.com
   ```

## Support

For issues or questions:
1. Check logs: `sudo docker compose logs`
2. Review this guide's troubleshooting section
3. Check main README.md for architecture details
4. Open an issue in the repository

## Additional Resources

- [Main README](./README.md) - Project overview
- [CLAUDE.md](./CLAUDE.md) - Architecture and development guide
- [Docker Compose Reference](https://docs.docker.com/compose/)
- [AWS EC2 Documentation](https://docs.aws.amazon.com/ec2/)
