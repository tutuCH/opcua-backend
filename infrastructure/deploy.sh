#!/bin/bash
set -e

echo "🚀 Deploying OPCUA Backend to AWS..."
echo ""

# Check prerequisites
echo "Checking prerequisites..."
command -v aws >/dev/null 2>&1 || {
  echo "❌ AWS CLI not installed."
  echo "   Install: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
  exit 1
}

command -v cdk >/dev/null 2>&1 || {
  echo "❌ AWS CDK not installed."
  echo "   Install: npm install -g aws-cdk"
  exit 1
}

command -v jq >/dev/null 2>&1 || {
  echo "❌ jq not installed."
  echo "   macOS: brew install jq"
  echo "   Linux: sudo apt-get install jq"
  exit 1
}

# Check AWS credentials
if ! aws sts get-caller-identity &>/dev/null; then
  echo "❌ AWS credentials not configured."
  echo "   Run: aws configure"
  exit 1
fi

echo "✅ All prerequisites met"
echo ""

# Install dependencies
echo "📦 Installing CDK dependencies..."
npm install

# Bootstrap CDK (first time only)
if ! aws cloudformation describe-stacks --stack-name CDKToolkit &>/dev/null; then
  echo "🏗️  Bootstrapping CDK (first time setup)..."
  echo "   This creates necessary AWS resources for CDK deployments..."
  cdk bootstrap
  echo "✅ CDK bootstrap complete"
fi

# Synthesize CloudFormation template (validation)
echo "🔍 Validating CDK stack..."
cdk synth > /dev/null
echo "✅ Stack validation passed"

# Deploy infrastructure
echo ""
echo "🚀 Deploying infrastructure to AWS..."
echo "   This will create:"
echo "   - VPC with public subnet"
echo "   - EC2 t3.medium instance"
echo "   - Elastic IP (static IP)"
echo "   - Security Group"
echo "   - IAM role for EC2"
echo ""
cdk deploy --require-approval never --outputs-file outputs.json

# Extract outputs
if [ -f outputs.json ]; then
  ELASTIC_IP=$(cat outputs.json | jq -r '.OpcuaBackendStack.ElasticIP')
  INSTANCE_ID=$(cat outputs.json | jq -r '.OpcuaBackendStack.InstanceId')
  BACKEND_URL=$(cat outputs.json | jq -r '.OpcuaBackendStack.BackendURL')
  MQTT_BROKER=$(cat outputs.json | jq -r '.OpcuaBackendStack.MQTTBroker')
  WEBSOCKET_URL=$(cat outputs.json | jq -r '.OpcuaBackendStack.WebSocketURL')

  echo ""
  echo "✅ Deployment complete!"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📍 Elastic IP:      $ELASTIC_IP"
  echo "🖥️  Instance ID:     $INSTANCE_ID"
  echo "🌐 Backend URL:     $BACKEND_URL"
  echo "📡 MQTT Broker:     $MQTT_BROKER"
  echo "🔌 WebSocket URL:   $WEBSOCKET_URL"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""

  # Save to file
  cat > ../backend.env <<EOF
ELASTIC_IP=$ELASTIC_IP
INSTANCE_ID=$INSTANCE_ID
BACKEND_URL=$BACKEND_URL
MQTT_BROKER=$MQTT_BROKER
WEBSOCKET_URL=$WEBSOCKET_URL
EOF

  echo "📝 Connection details saved to backend.env"
  echo ""

  # Wait for EC2 user data to complete (Docker setup)
  echo "⏳ Waiting for EC2 instance to be ready..."
  echo "   EC2 is installing Docker, cloning repo, and starting containers..."
  echo "   This takes approximately 2-3 minutes..."
  echo ""

  # Check EC2 status
  echo "   Checking EC2 instance status..."
  aws ec2 wait instance-status-ok --instance-ids $INSTANCE_ID
  echo "   ✅ EC2 instance is running"

  # Wait additional time for Docker Compose
  echo "   ⏳ Waiting 90 seconds for Docker services to initialize..."
  sleep 90

  # Test health endpoint
  echo ""
  echo "🧪 Testing health endpoint..."
  for i in {1..12}; do
    if curl -f -s http://$ELASTIC_IP:3000/health > /dev/null 2>&1; then
      echo "✅ Backend is healthy and responding!"
      echo ""
      echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      echo "🎉 Deployment successful! Your backend is ready."
      echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      echo ""
      echo "Next steps:"
      echo ""
      echo "1. Test API:"
      echo "   curl http://$ELASTIC_IP:3000/health"
      echo ""
      echo "2. View Docker logs:"
      echo "   ssh ec2-user@$ELASTIC_IP"
      echo "   cd /opt/opcua-backend"
      echo "   docker-compose logs -f"
      echo ""
      echo "3. View user data log (setup log):"
      echo "   ssh ec2-user@$ELASTIC_IP 'sudo tail -100 /var/log/user-data.log'"
      echo ""
      echo "4. Test MQTT connection:"
      echo "   mosquitto_pub -h $ELASTIC_IP -t factory/test/machine/test-001/realtime -m '{\"test\": \"data\"}'"
      echo ""
      echo "5. Connect your frontend to:"
      echo "   Backend: $BACKEND_URL"
      echo "   WebSocket: $WEBSOCKET_URL"
      echo ""
      exit 0
    fi
    echo "   Attempt $i/12: Health check not ready, retrying in 10s..."
    sleep 10
  done

  echo ""
  echo "⚠️  Health check timed out after 2 minutes."
  echo ""
  echo "The backend may still be starting. Common reasons:"
  echo "1. Docker is still pulling images"
  echo "2. Services are initializing"
  echo "3. Repository clone failed (check the git clone URL)"
  echo ""
  echo "To debug:"
  echo "1. Check user data log:"
  echo "   ssh ec2-user@$ELASTIC_IP 'sudo tail -f /var/log/user-data.log'"
  echo ""
  echo "2. Check Docker status:"
  echo "   ssh ec2-user@$ELASTIC_IP 'cd /opt/opcua-backend && docker-compose ps'"
  echo ""
  echo "3. Check Docker logs:"
  echo "   ssh ec2-user@$ELASTIC_IP 'cd /opt/opcua-backend && docker-compose logs'"
  echo ""

else
  echo "❌ Deployment outputs not found"
  exit 1
fi
