#!/usr/bin/env bash
set -euo pipefail

# Pull latest code on instance, rebuild image, restart container

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STATE_FILE="$SCRIPT_DIR/.deploy_state"
[[ -f "$STATE_FILE" ]] || { echo "State file not found: $STATE_FILE"; exit 1; }
source "$STATE_FILE"

if [[ -z "${PUBLIC_IP:-}" ]]; then
  PUBLIC_IP=$(aws ec2 describe-instances --region "$REGION" --instance-ids "$INSTANCE_ID" --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)
fi

echo "Updating on $PUBLIC_IP ..."
ssh -o StrictHostKeyChecking=no -i "${KEY_NAME}.pem" ec2-user@"$PUBLIC_IP" bash -lc "'
set -euo pipefail
cd /opt/app/src
git pull
if [ -n "$REPO_SUBDIR" ] && [ -d "$REPO_SUBDIR" ]; then cd "$REPO_SUBDIR"; fi
docker build -t opcua-backend:latest .
docker rm -f opcua-backend || true
docker run -d --name opcua-backend --env-file .env -p 80:3000 --restart unless-stopped opcua-backend:latest
'"

echo "Update complete. Health: http://$PUBLIC_IP/health"

