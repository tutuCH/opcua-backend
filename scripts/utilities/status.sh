#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STATE_FILE="$SCRIPT_DIR/.deploy_state"
[[ -f "$STATE_FILE" ]] || { echo "State file not found: $STATE_FILE"; exit 1; }
source "$STATE_FILE"

echo "Region:      $REGION"
echo "Instance ID: ${INSTANCE_ID:-<none>}"
if [[ -n "${INSTANCE_ID:-}" ]]; then
  aws ec2 describe-instances --region "$REGION" --instance-ids "$INSTANCE_ID" \
    --query 'Reservations[0].Instances[0].{State:State.Name,PublicIp:PublicIpAddress,LaunchTime:LaunchTime,Type:InstanceType,AZ:Placement.AvailabilityZone,ImageId:ImageId}' \
    --output table
fi

