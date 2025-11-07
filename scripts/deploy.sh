#!/usr/bin/env bash
set -euo pipefail

# Launches the EC2 instance and deploys the app container using user-data
# Requires scripts/setup.sh to have been run (reads scripts/.deploy_state)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STATE_FILE="$SCRIPT_DIR/.deploy_state"

[[ -f "$STATE_FILE" ]] || { echo "State file not found: $STATE_FILE. Run scripts/setup.sh first."; exit 1; }
source "$STATE_FILE"

# Repo info (override via env):
# Default to provided backend repo at root
REPO_URL=${REPO_URL:-https://github.com/tutuCH/opcua-backend}
REPO_SUBDIR=${REPO_SUBDIR:-}

# App env to embed in instance via user-data. Read from .env.ec2 in project root by default.
ENV_FILE=${ENV_FILE:-$(cd "$SCRIPT_DIR/.." && pwd)/.env.ec2}

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE"
  echo "Create it from .env.ec2.example and fill real values."
  exit 1
fi

ENV_B64=$(base64 < "$ENV_FILE" | tr -d '\n')

USER_DATA="$SCRIPT_DIR/.user-data.sh"
cat > "$USER_DATA" <<UDEOF
#!/bin/bash -xe
dnf update -y
dnf install -y docker git
systemctl enable --now docker

mkdir -p /opt/app && cd /opt/app
git clone "$REPO_URL" src || (cd src && git pull)
cd src
if [ -n "$REPO_SUBDIR" ] && [ -d "$REPO_SUBDIR" ]; then cd "$REPO_SUBDIR"; fi

echo "$ENV_B64" | base64 -d > .env

docker build -t opcua-backend:latest .
docker rm -f opcua-backend || true
docker run -d --name opcua-backend --env-file .env -p 80:3000 --restart unless-stopped opcua-backend:latest
UDEOF

echo "Launching instance in $REGION ..."
INSTANCE_ID=$(aws ec2 run-instances \
  --region "$REGION" \
  --image-id "$AMI_ID" \
  --instance-type "$INSTANCE_TYPE" \
  --key-name "$KEY_NAME" \
  --security-group-ids "$SG_ID" \
  --subnet-id "$SUBNET_ID" \
  --user-data file://"$USER_DATA" \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=opcua-backend}]' \
  --query 'Instances[0].InstanceId' --output text)

echo "Instance launched: $INSTANCE_ID"
aws ec2 wait instance-status-ok --region "$REGION" --instance-ids "$INSTANCE_ID"

PUBLIC_IP=$(aws ec2 describe-instances --region "$REGION" --instance-ids "$INSTANCE_ID" --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)
echo "Public IP: $PUBLIC_IP"

# Save into state
cat >> "$STATE_FILE" <<EOF
INSTANCE_ID=$INSTANCE_ID
PUBLIC_IP=$PUBLIC_IP
REPO_URL=$REPO_URL
REPO_SUBDIR=$REPO_SUBDIR
EOF

echo "Waiting for health endpoint ..."
for i in {1..30}; do
  if curl -fsS "http://$PUBLIC_IP/health" >/dev/null 2>&1; then
    echo "App is healthy at: http://$PUBLIC_IP"
    exit 0
  fi
  sleep 10
done

echo "Timed out waiting for health endpoint. You can check logs with:"
echo "ssh -i ${KEY_NAME}.pem ec2-user@$PUBLIC_IP 'docker logs --tail 200 opcua-backend'"
exit 1
