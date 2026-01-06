#!/bin/bash

# OPCUA Backend Data Backup Script
# Backs up PostgreSQL and InfluxDB to local machine and optionally to S3

set -e

# Load instance IP
if [ ! -f ../backend.env ]; then
  echo "❌ backend.env not found"
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

# Create backup directory
BACKUP_DIR="backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo "🗄️  Backing up OPCUA Backend data..."
echo "   Instance IP: $IP"
echo "   Backup location: $BACKUP_DIR"
echo ""

# Backup PostgreSQL
echo "1️⃣  Backing up PostgreSQL..."
ssh ec2-user@$IP << 'EOF'
cd /opt/opcua-backend
docker exec opcua-postgres pg_dump -U postgres opcua_dashboard > /tmp/postgres-backup.sql
echo "PostgreSQL backup created: /tmp/postgres-backup.sql"
du -h /tmp/postgres-backup.sql
EOF

scp ec2-user@$IP:/tmp/postgres-backup.sql "$BACKUP_DIR/"
echo "✅ PostgreSQL backup downloaded"
echo ""

# Backup InfluxDB
echo "2️⃣  Backing up InfluxDB..."
ssh ec2-user@$IP << 'EOF'
cd /opt/opcua-backend
docker exec opcua-influxdb influx backup /tmp/influx-backup
echo "InfluxDB backup created: /tmp/influx-backup"
du -sh /tmp/influx-backup
EOF

scp -r ec2-user@$IP:/tmp/influx-backup "$BACKUP_DIR/"
echo "✅ InfluxDB backup downloaded"
echo ""

# Backup .env files
echo "3️⃣  Backing up environment files..."
scp ec2-user@$IP:/opt/opcua-backend/.env.compose "$BACKUP_DIR/" 2>/dev/null || echo "   (no .env.compose found)"
scp ec2-user@$IP:/opt/opcua-backend/.env.local "$BACKUP_DIR/" 2>/dev/null || echo "   (no .env.local found)"
echo "✅ Environment files backed up"
echo ""

# Create manifest
cat > "$BACKUP_DIR/manifest.txt" << EOF
OPCUA Backend Backup
Date: $(date)
Instance ID: $INSTANCE_ID
Instance IP: $IP

Files:
- postgres-backup.sql (PostgreSQL dump)
- influx-backup/ (InfluxDB backup)
- .env.compose (Environment variables)
- .env.local (Local environment)

To restore:
  ./scripts/restore-data.sh $BACKUP_DIR
EOF

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Backup complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Backup location: $BACKUP_DIR"
du -sh "$BACKUP_DIR"
echo ""

# Optional: Upload to S3
if [ -n "$S3_BACKUP_BUCKET" ]; then
  echo "4️⃣  Uploading to S3..."
  aws s3 sync "$BACKUP_DIR" "s3://$S3_BACKUP_BUCKET/opcua-backups/$(basename $BACKUP_DIR)/"
  echo "✅ Uploaded to S3: s3://$S3_BACKUP_BUCKET/opcua-backups/$(basename $BACKUP_DIR)/"
else
  echo "💡 Tip: Set S3_BACKUP_BUCKET to automatically upload to S3"
  echo "   export S3_BACKUP_BUCKET=your-bucket-name"
fi

echo ""
echo "To restore this backup:"
echo "  ./scripts/restore-data.sh $BACKUP_DIR"
