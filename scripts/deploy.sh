#!/usr/bin/env bash
set -euo pipefail

# One-step EC2 deployment using Docker Compose
# Runs scripts/setup.sh automatically when needed, then launches the instance.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STATE_FILE="$SCRIPT_DIR/.deploy_state"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ ! -f "$STATE_FILE" ]]; then
  echo "State file not found. Running scripts/setup.sh..."
  "$SCRIPT_DIR/setup.sh"
fi

source "$STATE_FILE"

REPO_URL=${REPO_URL:-https://github.com/tutuCH/opcua-backend}
REPO_SUBDIR=${REPO_SUBDIR:-}
COMPOSE_ENV_FILE=${COMPOSE_ENV_FILE:-$ROOT_DIR/.env.compose}

if [[ ! -f "$COMPOSE_ENV_FILE" ]]; then
  echo "Missing compose env file: $COMPOSE_ENV_FILE"
  echo "Create it: cp .env.compose.example .env.compose and edit secrets."
  exit 1
fi

ENV_B64=$(base64 < "$COMPOSE_ENV_FILE" | tr -d '\n')

USER_DATA="$SCRIPT_DIR/.user-data-compose.sh"
cat > "$USER_DATA" <<UDEOF
#!/bin/bash -xe
dnf update -y
dnf install -y docker git docker-compose-plugin
systemctl enable --now docker

mkdir -p /opt/app && cd /opt/app
git clone "$REPO_URL" src || (cd src && git pull)
cd src
if [ -n "$REPO_SUBDIR" ] && [ -d "$REPO_SUBDIR" ]; then cd "$REPO_SUBDIR"; fi

echo "$ENV_B64" | base64 -d > .env.compose

docker compose version || true
docker compose pull || true
docker compose build --no-cache backend
docker compose up -d
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

cat >> "$STATE_FILE" <<EOF
COMPOSE_INSTANCE_ID=$INSTANCE_ID
COMPOSE_PUBLIC_IP=$PUBLIC_IP
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
echo "ssh -i ${KEY_NAME}.pem ec2-user@$PUBLIC_IP 'docker compose ps && docker compose logs --tail 200 backend'"
exit 1

