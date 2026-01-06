# Phased Deployment Guide

Cost-optimized deployment strategy that grows with your needs.

## 📊 Cost Summary

| Phase | Machines | Monthly Cost | Usage |
|-------|----------|--------------|-------|
| **Planning** | 0 | **$0-5** | Local dev + occasional staging (few hrs/week) |
| **Testing** | 1-10 | **$18** | Always-on, continuous data |
| **Production** | 50-100 | **$35** | Always-on, full scale |

**6-Month Total**: ~$99 (vs $210 if you used production from day 1)
**Savings**: 53%

---

## Phase 1: Planning (Current)

**Cost**: $0/month (local) or $5/month (occasional staging)

### Local Development (Recommended)

```bash
# Run everything locally
docker-compose up -d

# Access:
#  - Backend: http://localhost:3000
#  - MQTT: mqtt://localhost:1883
#  - WebSocket: ws://localhost:3000/socket.io/
```

### Optional: On-Demand Staging

```bash
# 1. Deploy to AWS with planning configuration
DEPLOY_ENV=planning ./deploy.sh

# 2. Start when you need it
./scripts/manage-instance.sh start

# 3. Get IP address
./scripts/manage-instance.sh ip

# 4. Stop to save money
./scripts/manage-instance.sh stop
```

**Cost**: ~$0.50/day when running, $2.40/month when stopped

---

## Phase 2: Testing (1-10 Machines)

**Cost**: $18/month
**When**: You have 1-10 test machines ready

### Deploy

```bash
# Deploy with testing configuration
DEPLOY_ENV=testing ./deploy.sh

# This creates:
#  - t3.small instance (1 vCPU, 2 GB RAM)
#  - 30 GB storage
#  - Elastic IP (static IP for machines)
```

### Configure Machines

```bash
# Get your static IP
./scripts/manage-instance.sh ip

# Configure machines to send data to:
#  MQTT: mqtt://<your-ip>:1883
#  Topics: factory/{factoryId}/machine/{deviceId}/{dataType}
```

### Monitor Usage

```bash
# Check instance status
./scripts/manage-instance.sh status

# View Docker stats
./scripts/manage-instance.sh ssh
docker stats

# View logs
./scripts/manage-instance.sh logs
```

**Upgrade Trigger**: When you have >15 machines or CPU >80%

---

## Phase 3: Production (50-100 Machines)

**Cost**: $35/month
**When**: Scaling to 50-100 machines

### Before Upgrading

```bash
# 1. Backup your data
./scripts/backup-data.sh

# This backs up:
#  - PostgreSQL database
#  - InfluxDB time-series data
#  - Environment variables
```

### Upgrade

```bash
# 2. Deploy production configuration
DEPLOY_ENV=production cdk deploy

# This creates:
#  - t3.medium instance (2 vCPU, 4 GB RAM)
#  - 50 GB storage
#  - Same Elastic IP (no machine reconfiguration!)
```

### After Upgrading

```bash
# 3. Restore your data
./scripts/restore-data.sh backups/<backup-directory>

# 4. Verify services
curl http://<elastic-ip>:3000/health

# 5. Check Docker stats
./scripts/manage-instance.sh ssh
docker stats
```

**Your machines don't need reconfiguration** - same Elastic IP!

---

## Helpful Commands

### Instance Management

```bash
./scripts/manage-instance.sh start    # Start instance
./scripts/manage-instance.sh stop     # Stop instance
./scripts/manage-instance.sh status   # Check status
./scripts/manage-instance.sh ip       # Get IP address
./scripts/manage-instance.sh restart  # Restart instance
./scripts/manage-instance.sh logs     # View logs
./scripts/manage-instance.sh ssh      # Connect via SSH
```

### Data Management

```bash
# Backup
./scripts/backup-data.sh

# Restore
./scripts/restore-data.sh backups/<backup-directory>

# List backups
ls -lh backups/
```

### Deployment

```bash
# Deploy with specific environment
DEPLOY_ENV=planning ./deploy.sh     # Planning phase
DEPLOY_ENV=testing ./deploy.sh      # Testing phase
DEPLOY_ENV=production ./deploy.sh   # Production phase

# Default (if DEPLOY_ENV not set)
./deploy.sh  # Defaults to production
```

### Testing

```bash
# Run automated tests
npm run test

# Manual health check
curl http://<ip>:3000/health

# Test MQTT
mosquitto_pub -h <ip> -t factory/test/machine/test-001/realtime -m '{"test": "data"}'
```

---

## Environment Variables

Set `DEPLOY_ENV` before deployment:

```bash
# Planning phase (t3.small, no Elastic IP)
export DEPLOY_ENV=planning

# Testing phase (t3.small, with Elastic IP)
export DEPLOY_ENV=testing

# Production phase (t3.medium, with Elastic IP)
export DEPLOY_ENV=production
```

Or set inline:
```bash
DEPLOY_ENV=testing ./deploy.sh
```

---

## Cost Optimization Tips

### Planning Phase
1. Use local Docker Compose most of the time ($0)
2. Deploy to AWS only when you need staging
3. Stop instance when not in use (`./scripts/manage-instance.sh stop`)
4. Consider removing Elastic IP to save $3.60/month

### Testing Phase
1. Keep instance running 24/7 (starting/stopping interrupts data)
2. Monitor CPU/memory usage with `docker stats`
3. Upgrade to production when CPU >80% or >15 machines

### Production Phase
1. Set up automated backups to S3
2. Enable CloudWatch alarms for CPU/disk usage
3. Consider reserved instances for 1-year commitment (30% savings)

---

## Troubleshooting

### Health Check Fails

```bash
# Check if instance is running
./scripts/manage-instance.sh status

# View logs
./scripts/manage-instance.sh logs

# Check user data execution log
./scripts/manage-instance.sh ssh
sudo tail -100 /var/log/user-data.log
```

### Services Not Starting

```bash
# SSH into instance
./scripts/manage-instance.sh ssh

# Check Docker
docker-compose ps
docker-compose logs

# Restart services
cd /opt/opcua-backend
docker-compose restart
```

### Out of Disk Space

```bash
# SSH into instance
./scripts/manage-instance.sh ssh

# Check disk usage
df -h
docker system df

# Clean up Docker
docker system prune -a
```

### High Costs

```bash
# Check if instance is stopped when not needed
./scripts/manage-instance.sh status

# Verify you're using the right size
#  - Planning/Testing: t3.small ($15/month)
#  - Production: t3.medium ($30/month)

# Check for unused Elastic IPs
aws ec2 describe-addresses --query 'Addresses[?AssociationId==null]'
```

---

## Migration Checklist

### Planning → Testing

- [ ] Deploy with `DEPLOY_ENV=testing`
- [ ] Get Elastic IP address
- [ ] Configure machines with static IP
- [ ] Keep instance running 24/7
- [ ] Monitor CPU/memory usage

### Testing → Production

- [ ] Backup data with `./scripts/backup-data.sh`
- [ ] Deploy with `DEPLOY_ENV=production`
- [ ] Wait for deployment to complete
- [ ] Restore data with `./scripts/restore-data.sh`
- [ ] Verify health check
- [ ] Machines automatically reconnect (same Elastic IP)

---

## Quick Reference

**Current Phase**: Check `DEPLOY_ENV` in your shell or look at instance tags

**Monthly Costs**:
- Planning (local): $0
- Planning (staging few hrs/week): $5
- Testing (always-on): $18
- Production (always-on): $35

**Instance Sizes**:
- Planning: t3.small (1 vCPU, 2 GB)
- Testing: t3.small (1 vCPU, 2 GB)
- Production: t3.medium (2 vCPU, 4 GB)

**Storage**:
- Planning/Testing: 30 GB
- Production: 50 GB

**Elastic IP**:
- Planning: No (dynamic IP)
- Testing: Yes (static IP)
- Production: Yes (static IP)

---

## Support

- Full guide: `docs/AWS_CDK_DEPLOYMENT.md`
- Detailed plan: `.claude/plans/gentle-swinging-twilight.md`
- Infrastructure README: `infrastructure/README.md`
