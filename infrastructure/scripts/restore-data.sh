#!/bin/bash

# OPCUA Backend Data Restore Script
# Restores PostgreSQL and InfluxDB from backup

set -e

BACKUP_DIR="$1"

if [ -z "$BACKUP_DIR" ]; then
  echo "Usage: $0 <backup-directory>"
  echo ""
  echo "Example:"
  echo "  $0 backups/20240115_143022"
  echo ""
  echo "Available backups:"
  ls -1 backups/ 2>/dev/null || echo "  (no backups found)"
  exit 1
fi

if [ ! -d "$BACKUP_DIR" ]; then
  echo "❌ Backup directory not found: $BACKUP_DIR"
  exit 1
fi

# Load instance IP
if [ ! -f ../backend.env ]; then
  echo "❌ backend.env not found"
  echo "   Deploy the instance first: ./deploy.sh"
  exit 1
fi

INSTANCE_ID=$(grep INSTANCE_ID ../backend.env | cut -d= -f2)
IP=$(aws ec2 describe-instances --instance-ids $INSTANCE_ID \
  --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)

if [ "$IP" = "None" ] || [ -z "$IP" ]; then
  echo "❌ Instance is not running"
  echo "   Start it first: ./scripts/manage-instance.sh start"
  exit 1
fi

echo "📦 Restoring OPCUA Backend data..."
echo "   Backup: $BACKUP_DIR"
echo "   Instance IP: $IP"
echo ""

# Confirmation
read -p "⚠️  This will OVERWRITE existing data. Continue? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
  echo "Cancelled"
  exit 0
fi

echo ""

# Upload backup files to instance
echo "1️⃣  Uploading backup files to instance..."
scp "$BACKUP_DIR/postgres-backup.sql" ec2-user@$IP:/tmp/
scp -r "$BACKUP_DIR/influx-backup" ec2-user@$IP:/tmp/
echo "✅ Backup files uploaded"
echo ""

# Restore PostgreSQL
echo "2️⃣  Restoring PostgreSQL..."
ssh ec2-user@$IP << 'EOF'
cd /opt/opcua-backend

# Stop backend to prevent connections
docker-compose stop backend

# Drop and recreate database
docker exec opcua-postgres psql -U postgres -c "DROP DATABASE IF EXISTS opcua_dashboard;"
docker exec opcua-postgres psql -U postgres -c "CREATE DATABASE opcua_dashboard;"

# Restore from backup
docker exec -i opcua-postgres psql -U postgres opcua_dashboard < /tmp/postgres-backup.sql

echo "PostgreSQL restore complete"
EOF
echo "✅ PostgreSQL restored"
echo ""

# Restore InfluxDB
echo "3️⃣  Restoring InfluxDB..."
ssh ec2-user@$IP << 'EOF'
cd /opt/opcua-backend

# Stop InfluxDB
docker-compose stop influxdb

# Restore from backup
docker-compose start influxdb
sleep 10  # Wait for InfluxDB to start

docker exec opcua-influxdb influx restore --full /tmp/influx-backup

echo "InfluxDB restore complete"
EOF
echo "✅ InfluxDB restored"
echo ""

# Restart all services
echo "4️⃣  Restarting all services..."
ssh ec2-user@$IP << 'EOF'
cd /opt/opcua-backend
docker-compose restart
docker-compose ps
EOF
echo "✅ Services restarted"
echo ""

# Cleanup temp files
echo "5️⃣  Cleaning up..."
ssh ec2-user@$IP << 'EOF'
rm -f /tmp/postgres-backup.sql
rm -rf /tmp/influx-backup
EOF
echo "✅ Cleanup complete"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Restore complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Backend URL: http://$IP:3000"
echo "Health check: curl http://$IP:3000/health"
echo ""
echo "Wait ~30 seconds for services to fully initialize"
