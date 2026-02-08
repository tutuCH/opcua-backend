#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STATE_FILE="$SCRIPT_DIR/.deploy_state"
[[ -f "$STATE_FILE" ]] || { echo "State file not found: $STATE_FILE"; exit 1; }
source "$STATE_FILE"

if [[ -z "${PUBLIC_IP:-}" || "$PUBLIC_IP" == "None" ]]; then
  PUBLIC_IP=$(aws ec2 describe-instances --region "$REGION" --instance-ids "$INSTANCE_ID" --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)
fi

echo "Connecting to ec2-user@$PUBLIC_IP ..."
exec ssh -o StrictHostKeyChecking=no -i "${KEY_NAME}.pem" ec2-user@"$PUBLIC_IP"

