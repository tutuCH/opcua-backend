#!/usr/bin/env bash
set -euo pipefail

# Terminates the EC2 instance and deletes SG + key pair

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STATE_FILE="$SCRIPT_DIR/.deploy_state"
[[ -f "$STATE_FILE" ]] || { echo "State file not found: $STATE_FILE"; exit 1; }
source "$STATE_FILE"

if [[ -n "${INSTANCE_ID:-}" && "$INSTANCE_ID" != "None" ]]; then
  echo "Terminating instance: $INSTANCE_ID"
  aws ec2 terminate-instances --region "$REGION" --instance-ids "$INSTANCE_ID" >/dev/null
  aws ec2 wait instance-terminated --region "$REGION" --instance-ids "$INSTANCE_ID"
  echo "Instance terminated."
fi

if [[ -n "${SG_ID:-}" && "$SG_ID" != "None" ]]; then
  echo "Deleting security group: $SG_ID"
  aws ec2 delete-security-group --region "$REGION" --group-id "$SG_ID" || true
fi

if [[ -n "${KEY_NAME:-}" ]]; then
  echo "Deleting key pair: $KEY_NAME"
  aws ec2 delete-key-pair --region "$REGION" --key-name "$KEY_NAME" || true
  rm -f "${KEY_NAME}.pem" || true
fi

rm -f "$STATE_FILE"
echo "Teardown complete."

