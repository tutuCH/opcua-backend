#!/usr/bin/env bash
set -euo pipefail

# Minimal AWS setup for single-EC2 Docker deployment
# - Creates/reuses SG and key pair
# - Resolves latest Amazon Linux 2023 AMI and a default subnet
# - Saves values to scripts/.deploy_state for later scripts to use

# Config (override via env):
REGION=${REGION:-us-east-1}
INSTANCE_TYPE=${INSTANCE_TYPE:-t3.small}
KEY_NAME=${KEY_NAME:-opcua-backend-key}
SG_NAME=${SG_NAME:-opcua-backend-sg}

STATE_FILE="$(cd "$(dirname "$0")" && pwd)/.deploy_state"

echo "Region:            $REGION"
echo "Instance type:     $INSTANCE_TYPE"
echo "Security group:    $SG_NAME"
echo "Key pair:          $KEY_NAME"

command -v aws >/dev/null 2>&1 || { echo "AWS CLI not found. Install and run 'aws configure'."; exit 1; }

VPC_ID=$(aws ec2 describe-vpcs --region "$REGION" --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)
if [[ -z "$VPC_ID" || "$VPC_ID" == "None" ]]; then
  echo "Could not find default VPC in $REGION"; exit 1
fi
echo "Using default VPC: $VPC_ID"

# Create or reuse security group
SG_ID=$(aws ec2 describe-security-groups \
  --region "$REGION" \
  --filters Name=group-name,Values="$SG_NAME" Name=vpc-id,Values="$VPC_ID" \
  --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null || true)

if [[ -z "$SG_ID" || "$SG_ID" == "None" ]]; then
  SG_ID=$(aws ec2 create-security-group --region "$REGION" --group-name "$SG_NAME" --description "OPCUA backend SG" --vpc-id "$VPC_ID" --query 'GroupId' --output text)
  echo "Created SG: $SG_ID"
else
  echo "Reusing SG: $SG_ID"
fi

# Add ingress rules (idempotent)
set +e
aws ec2 authorize-security-group-ingress --region "$REGION" --group-id "$SG_ID" --protocol tcp --port 22 --cidr 0.0.0.0/0 >/dev/null 2>&1
aws ec2 authorize-security-group-ingress --region "$REGION" --group-id "$SG_ID" --protocol tcp --port 80 --cidr 0.0.0.0/0 >/dev/null 2>&1
set -e

# Key pair create or reuse
if aws ec2 describe-key-pairs --region "$REGION" --key-names "$KEY_NAME" >/dev/null 2>&1; then
  echo "Reusing key pair: $KEY_NAME (skipping creation)"
else
  echo "Creating key pair: $KEY_NAME"
  aws ec2 create-key-pair --region "$REGION" --key-name "$KEY_NAME" --query 'KeyMaterial' --output text > "${KEY_NAME}.pem"
  chmod 400 "${KEY_NAME}.pem"
  echo "Saved private key to ${KEY_NAME}.pem"
fi

# AMI and Subnet
AMI_ID=$(aws ssm get-parameters --region "$REGION" --names /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-6.1-x86_64 --query 'Parameters[0].Value' --output text)
SUBNET_ID=$(aws ec2 describe-subnets --region "$REGION" --filters Name=vpc-id,Values="$VPC_ID" --query 'Subnets[0].SubnetId' --output text)

echo "Using AMI: $AMI_ID"
echo "Using Subnet: $SUBNET_ID"

cat > "$STATE_FILE" <<EOF
REGION=$REGION
INSTANCE_TYPE=$INSTANCE_TYPE
KEY_NAME=$KEY_NAME
SG_NAME=$SG_NAME
SG_ID=$SG_ID
VPC_ID=$VPC_ID
AMI_ID=$AMI_ID
SUBNET_ID=$SUBNET_ID
STATE_FILE=$STATE_FILE
EOF

echo "Saved deployment state to $STATE_FILE"

