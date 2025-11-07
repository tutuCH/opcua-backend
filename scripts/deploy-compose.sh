#!/usr/bin/env bash
set -euo pipefail

# Deploys all services (backend + Postgres + Redis + InfluxDB + Mosquitto) on a single EC2 using Docker Compose
# Requires scripts/setup.sh to have been run (reads scripts/.deploy_state)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STATE_FILE="$SCRIPT_DIR/.deploy_state"
[[ -f "$STATE_FILE" ]] || { echo "State file not found: $STATE_FILE. Run scripts/setup.sh first."; exit 1; }
source "$STATE_FILE"

# Repo info
REPO_URL=${REPO_URL:-https://github.com/tutuCH/opcua-backend}
REPO_SUBDIR=${REPO_SUBDIR:-}

# Env file for compose
COMPOSE_ENV_FILE=${COMPOSE_ENV_FILE:-$(cd "$SCRIPT_DIR/.." && pwd)/.env.compose}
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

echo "Launching instance with Docker Compose in $REGION ..."
INSTANCE_ID=$(aws ec2 run-instances \
  --region "$REGION" \
  --image-id "$AMI_ID" \
  --instance-type "$INSTANCE_TYPE" \
  --key-name "$KEY_NAME" \
  --security-group-ids "$SG_ID" \
  --subnet-id "$SUBNET_ID" \
  --user-data file://"$USER_DATA" \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=opcua-backend-compose}]' \
  --query 'Instances[0].InstanceId' --output text)

echo "Instance launched: $INSTANCE_ID"
aws ec2 wait instance-status-ok --region "$REGION" --instance-ids "$INSTANCE_ID"

PUBLIC_IP=$(aws ec2 describe-instances --region "$REGION" --instance-ids "$INSTANCE_ID" --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)
echo "Public IP: $PUBLIC_IP"

# Save into state
cat >> "$STATE_FILE" <<EOF
COMPOSE_INSTANCE_ID=$INSTANCE_ID
COMPOSE_PUBLIC_IP=$PUBLIC_IP
EOF

echo "Waiting for health endpoint ..."
for i in {1..30}; do
  if curl -fsS "http://$PUBLIC_IP/health" >/dev/null 2>&1; then
    echo "App is healthy at: http://$PUBLIC_IP"
    exit 0
  fi
  sleep 10
done

echo "Timed out waiting for health endpoint. Check logs:"
echo "ssh -i ${KEY_NAME}.pem ec2-user@$PUBLIC_IP 'docker compose ps && docker compose logs --tail 200 backend'"
exit 1

