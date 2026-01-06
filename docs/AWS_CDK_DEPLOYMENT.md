# AWS CDK Deployment - Next Steps

## Quick Start

Deploy your IoT backend to AWS with one command:

```bash
./infrastructure/deploy.sh
```

This will:
- ✅ Create VPC, Security Group, EC2 instance
- ✅ Allocate and attach Elastic IP (static IP)
- ✅ Install Docker and start all services
- ✅ Run health checks
- ✅ Output your static IP address

**Total Time**: ~10 minutes
**Monthly Cost**: $35-45 (50-100 machines)

---

## Prerequisites

### 1. Install AWS CLI

```bash
# macOS
brew install awscli

# Linux
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Verify
aws --version
```

### 2. Configure AWS Credentials

```bash
aws configure

# Enter:
# AWS Access Key ID: [your-key]
# AWS Secret Access Key: [your-secret]
# Default region name: us-east-1
# Default output format: json
```

Get credentials from: https://console.aws.amazon.com/iam/home#/security_credentials

### 3. Install AWS CDK

```bash
npm install -g aws-cdk

# Verify
cdk --version
```

### 4. Install jq (for parsing JSON outputs)

```bash
# macOS
brew install jq

# Linux
sudo apt-get install jq
```

---

## Step 1: Create CDK Infrastructure

### Directory Structure

```bash
mkdir -p infrastructure/{bin,lib}
cd infrastructure
npm init -y
npm install aws-cdk-lib constructs
npm install -D typescript ts-node @types/node
```

### Create CDK App Entry Point

**File**: `infrastructure/bin/opcua-backend.ts`

```typescript
#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { OpcuaBackendStack } from '../lib/opcua-backend-stack';

const app = new cdk.App();

new OpcuaBackendStack(app, 'OpcuaBackendStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  description: 'OPCUA IoT Backend - EC2 with Docker Compose',
});

app.synth();
```

### Create Main Infrastructure Stack

**File**: `infrastructure/lib/opcua-backend-stack.ts`

```typescript
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import * as fs from 'fs';
import * as path from 'path';

export class OpcuaBackendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 1. VPC with single public subnet (cost-optimized)
    const vpc = new ec2.Vpc(this, 'OpcuaVPC', {
      maxAzs: 1,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
      ],
    });

    // 2. Security Group
    const securityGroup = new ec2.SecurityGroup(this, 'OpcuaSecurityGroup', {
      vpc,
      description: 'Security group for OPCUA backend',
      allowAllOutbound: true,
    });

    // Allow inbound traffic
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'Allow HTTP'
    );
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow HTTPS'
    );
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(3000),
      'Allow Backend API'
    );
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(1883),
      'Allow MQTT'
    );

    // Restrict SSH to your IP (update this!)
    securityGroup.addIngressRule(
      ec2.Peer.ipv4('0.0.0.0/0'), // TODO: Replace with your IP
      ec2.Port.tcp(22),
      'Allow SSH'
    );

    // 3. IAM Role for EC2 (optional, for CloudWatch logs)
    const role = new iam.Role(this, 'OpcuaInstanceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'),
      ],
    });

    // 4. User Data Script
    const userDataScript = ec2.UserData.forLinux();

    userDataScript.addCommands(
      '#!/bin/bash',
      'set -e',
      'exec > >(tee /var/log/user-data.log)',
      'exec 2>&1',
      '',
      'echo "=== Starting OPCUA Backend Setup ==="',
      '',
      '# Update system',
      'yum update -y',
      '',
      '# Install Docker',
      'yum install -y docker git',
      'systemctl start docker',
      'systemctl enable docker',
      'usermod -aG docker ec2-user',
      '',
      '# Install Docker Compose',
      'curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose',
      'chmod +x /usr/local/bin/docker-compose',
      'ln -s /usr/local/bin/docker-compose /usr/bin/docker-compose',
      '',
      '# Clone repository',
      'cd /opt',
      'git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git opcua-backend || echo "Update repo URL"',
      'cd opcua-backend',
      '',
      '# Setup environment files',
      'cp .env.compose.example .env.compose || cp .env.compose.template .env.compose',
      'cp .env.local.example .env.local 2>/dev/null || echo "No .env.local.example found"',
      '',
      '# Generate secure secrets',
      'JWT_SECRET=$(openssl rand -base64 48)',
      'POSTGRES_PASSWORD=$(openssl rand -base64 24)',
      'REDIS_PASSWORD=$(openssl rand -base64 24)',
      'INFLUXDB_PASSWORD=$(openssl rand -base64 24)',
      'INFLUXDB_TOKEN=$(openssl rand -base64 48)',
      '',
      '# Update .env.compose with generated secrets',
      'sed -i "s|JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" .env.compose',
      'sed -i "s|POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$POSTGRES_PASSWORD|" .env.compose',
      'sed -i "s|REDIS_PASSWORD=.*|REDIS_PASSWORD=$REDIS_PASSWORD|" .env.compose',
      'sed -i "s|INFLUXDB_PASSWORD=.*|INFLUXDB_PASSWORD=$INFLUXDB_PASSWORD|" .env.compose',
      'sed -i "s|INFLUXDB_TOKEN=.*|INFLUXDB_TOKEN=$INFLUXDB_TOKEN|" .env.compose',
      '',
      '# Update InfluxDB retention to 30 days',
      'sed -i "s|DOCKER_INFLUXDB_INIT_RETENTION:.*|DOCKER_INFLUXDB_INIT_RETENTION: 720h|" docker-compose.yml',
      '',
      '# Start services',
      'docker-compose up -d',
      '',
      '# Create systemd service for auto-restart',
      'cat > /etc/systemd/system/opcua-backend.service <<EOF',
      '[Unit]',
      'Description=OPCUA Backend Docker Compose',
      'After=docker.service',
      'Requires=docker.service',
      '',
      '[Service]',
      'Type=oneshot',
      'RemainAfterExit=yes',
      'WorkingDirectory=/opt/opcua-backend',
      'ExecStart=/usr/local/bin/docker-compose up -d',
      'ExecStop=/usr/local/bin/docker-compose down',
      '',
      '[Install]',
      'WantedBy=multi-user.target',
      'EOF',
      '',
      'systemctl daemon-reload',
      'systemctl enable opcua-backend',
      '',
      'echo "=== OPCUA Backend Setup Complete ==="'
    );

    // 5. EC2 Instance
    const instance = new ec2.Instance(this, 'OpcuaInstance', {
      vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MEDIUM
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux2023({
        cpuType: ec2.AmazonLinuxCpuType.X86_64,
      }),
      securityGroup,
      role,
      blockDevices: [
        {
          deviceName: '/dev/xvda',
          volume: ec2.BlockDeviceVolume.ebs(50, {
            volumeType: ec2.EbsDeviceVolumeType.GP3,
            deleteOnTermination: true,
          }),
        },
      ],
      userData: userDataScript,
      userDataCausesReplacement: false,
    });

    // 6. Elastic IP (Static IP)
    const eip = new ec2.CfnEIP(this, 'OpcuaElasticIP', {
      domain: 'vpc',
      tags: [
        {
          key: 'Name',
          value: 'OPCUA Backend Static IP',
        },
      ],
    });

    new ec2.CfnEIPAssociation(this, 'EIPAssociation', {
      eip: eip.ref,
      instanceId: instance.instanceId,
    });

    // 7. Outputs
    new cdk.CfnOutput(this, 'ElasticIP', {
      value: eip.ref,
      description: 'Static IP address for backend',
      exportName: 'OpcuaBackendElasticIP',
    });

    new cdk.CfnOutput(this, 'InstanceId', {
      value: instance.instanceId,
      description: 'EC2 Instance ID',
    });

    new cdk.CfnOutput(this, 'BackendURL', {
      value: `http://${eip.ref}:3000`,
      description: 'Backend API URL',
    });

    new cdk.CfnOutput(this, 'MQTTBroker', {
      value: `mqtt://${eip.ref}:1883`,
      description: 'MQTT Broker URL',
    });

    new cdk.CfnOutput(this, 'WebSocketURL', {
      value: `ws://${eip.ref}:3000/socket.io/`,
      description: 'WebSocket URL',
    });
  }
}
```

### Create CDK Configuration

**File**: `infrastructure/cdk.json`

```json
{
  "app": "npx ts-node bin/opcua-backend.ts",
  "watch": {
    "include": [
      "**"
    ],
    "exclude": [
      "README.md",
      "cdk*.json",
      "**/*.d.ts",
      "**/*.js",
      "tsconfig.json",
      "package*.json",
      "yarn.lock",
      "node_modules"
    ]
  },
  "context": {
    "@aws-cdk/aws-lambda:recognizeLayerVersion": true,
    "@aws-cdk/core:checkSecretUsage": true,
    "@aws-cdk/core:target-partitions": [
      "aws",
      "aws-cn"
    ],
    "@aws-cdk-containers/ecs-service-extensions:enableDefaultLogDriver": true,
    "@aws-cdk/aws-ec2:uniqueImdsv2TemplateName": true,
    "@aws-cdk/aws-ecs:arnFormatIncludesClusterName": true,
    "@aws-cdk/aws-iam:minimizePolicies": true,
    "@aws-cdk/core:validateSnapshotRemovalPolicy": true,
    "@aws-cdk/aws-codepipeline:crossAccountKeyAliasStackSafeResourceName": true,
    "@aws-cdk/aws-s3:createDefaultLoggingPolicy": true,
    "@aws-cdk/aws-sns-subscriptions:restrictSqsDescryption": true,
    "@aws-cdk/aws-apigateway:disableCloudWatchRole": true,
    "@aws-cdk/core:enablePartitionLiterals": true,
    "@aws-cdk/aws-events:eventsTargetQueueSameAccount": true,
    "@aws-cdk/aws-iam:standardizedServicePrincipals": true,
    "@aws-cdk/aws-ecs:disableExplicitDeploymentControllerForCircuitBreaker": true,
    "@aws-cdk/aws-iam:importedRoleStackSafeDefaultPolicyName": true,
    "@aws-cdk/aws-s3:serverAccessLogsUseBucketPolicy": true,
    "@aws-cdk/aws-route53-patters:useCertificate": true,
    "@aws-cdk/customresources:installLatestAwsSdkDefault": false,
    "@aws-cdk/aws-rds:databaseProxyUniqueResourceName": true,
    "@aws-cdk/aws-codedeploy:removeAlarmsFromDeploymentGroup": true,
    "@aws-cdk/aws-apigateway:authorizerChangeDeploymentLogicalId": true,
    "@aws-cdk/aws-ec2:launchTemplateDefaultUserData": true,
    "@aws-cdk/aws-secretsmanager:useAttachedSecretResourcePolicyForSecretTargetAttachments": true,
    "@aws-cdk/aws-redshift:columnId": true,
    "@aws-cdk/aws-stepfunctions-tasks:enableEmrServicePolicyV2": true,
    "@aws-cdk/aws-ec2:restrictDefaultSecurityGroup": true,
    "@aws-cdk/aws-apigateway:requestValidatorUniqueId": true,
    "@aws-cdk/aws-kms:aliasNameRef": true,
    "@aws-cdk/aws-autoscaling:generateLaunchTemplateInsteadOfLaunchConfig": true,
    "@aws-cdk/core:includePrefixInUniqueNameGeneration": true,
    "@aws-cdk/aws-efs:denyAnonymousAccess": true,
    "@aws-cdk/aws-opensearchservice:enableOpensearchMultiAzWithStandby": true,
    "@aws-cdk/aws-lambda-nodejs:useLatestRuntimeVersion": true,
    "@aws-cdk/aws-efs:mountTargetOrderInsensitiveLogicalId": true,
    "@aws-cdk/aws-rds:auroraClusterChangeScopeOfInstanceParameterGroupWithEachParameters": true,
    "@aws-cdk/aws-appsync:useArnForSourceApiAssociationIdentifier": true,
    "@aws-cdk/aws-rds:preventRenderingDeprecatedCredentials": true,
    "@aws-cdk/aws-codepipeline-actions:useNewDefaultBranchForCodeCommitSource": true,
    "@aws-cdk/aws-cloudwatch-actions:changeLambdaPermissionLogicalIdForLambdaAction": true,
    "@aws-cdk/aws-codepipeline:crossAccountKeysDefaultValueToFalse": true,
    "@aws-cdk/aws-codepipeline:defaultPipelineTypeToV2": true,
    "@aws-cdk/aws-kms:reduceCrossAccountRegionPolicyScope": true,
    "@aws-cdk/aws-eks:nodegroupNameAttribute": true,
    "@aws-cdk/aws-ec2:ebsDefaultGp3Volume": true,
    "@aws-cdk/aws-ecs:removeDefaultDeploymentAlarm": true,
    "@aws-cdk/custom-resources:logApiResponseDataPropertyTrueDefault": false,
    "@aws-cdk/aws-s3:keepNotificationInImportedBucket": false
  }
}
```

**File**: `infrastructure/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": [
      "es2020"
    ],
    "declaration": true,
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": false,
    "inlineSourceMap": true,
    "inlineSources": true,
    "experimentalDecorators": true,
    "strictPropertyInitialization": false,
    "typeRoots": [
      "./node_modules/@types"
    ]
  },
  "exclude": [
    "node_modules",
    "cdk.out"
  ]
}
```

**File**: `infrastructure/package.json`

```json
{
  "name": "opcua-backend-infrastructure",
  "version": "1.0.0",
  "description": "AWS CDK infrastructure for OPCUA IoT Backend",
  "scripts": {
    "build": "tsc",
    "watch": "tsc -w",
    "cdk": "cdk",
    "deploy": "cdk deploy --require-approval never --outputs-file outputs.json",
    "destroy": "cdk destroy",
    "diff": "cdk diff",
    "synth": "cdk synth",
    "test": "node test-deployment.js"
  },
  "dependencies": {
    "aws-cdk-lib": "^2.120.0",
    "constructs": "^10.3.0",
    "source-map-support": "^0.5.21"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "typescript": "^5.3.0",
    "ts-node": "^10.9.0"
  }
}
```

---

## Step 2: Create Deployment Scripts

### One-Command Deploy Script

**File**: `infrastructure/deploy.sh`

```bash
#!/bin/bash
set -e

echo "🚀 Deploying OPCUA Backend to AWS..."
echo ""

# Check prerequisites
command -v aws >/dev/null 2>&1 || { echo "❌ AWS CLI not installed. Run: brew install awscli"; exit 1; }
command -v cdk >/dev/null 2>&1 || { echo "❌ AWS CDK not installed. Run: npm install -g aws-cdk"; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "❌ jq not installed. Run: brew install jq"; exit 1; }

# Install dependencies
echo "📦 Installing CDK dependencies..."
npm install

# Bootstrap CDK (first time only)
if ! aws cloudformation describe-stacks --stack-name CDKToolkit &>/dev/null; then
  echo "🏗️  Bootstrapping CDK (first time setup)..."
  cdk bootstrap
  echo "✅ CDK bootstrap complete"
fi

# Synthesize CloudFormation template (validation)
echo "🔍 Validating CDK stack..."
cdk synth > /dev/null
echo "✅ Stack validation passed"

# Deploy infrastructure
echo "🚀 Deploying infrastructure to AWS..."
cdk deploy --require-approval never --outputs-file outputs.json

# Extract outputs
if [ -f outputs.json ]; then
  ELASTIC_IP=$(cat outputs.json | jq -r '.OpcuaBackendStack.ElasticIP')
  INSTANCE_ID=$(cat outputs.json | jq -r '.OpcuaBackendStack.InstanceId')

  echo ""
  echo "✅ Deployment complete!"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📍 Elastic IP:     $ELASTIC_IP"
  echo "🖥️  Instance ID:    $INSTANCE_ID"
  echo "🌐 Backend URL:    http://$ELASTIC_IP:3000"
  echo "📡 MQTT Broker:    mqtt://$ELASTIC_IP:1883"
  echo "🔌 WebSocket URL:  ws://$ELASTIC_IP:3000/socket.io/"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""

  # Save to file
  cat > ../backend.env <<EOF
ELASTIC_IP=$ELASTIC_IP
INSTANCE_ID=$INSTANCE_ID
BACKEND_URL=http://$ELASTIC_IP:3000
MQTT_BROKER=mqtt://$ELASTIC_IP:1883
WEBSOCKET_URL=ws://$ELASTIC_IP:3000/socket.io/
EOF

  echo "📝 Connection details saved to backend.env"
  echo ""

  # Wait for EC2 user data to complete (Docker setup)
  echo "⏳ Waiting for services to start (this takes ~2-3 minutes)..."
  echo "   EC2 is installing Docker, cloning repo, and starting containers..."

  # Check EC2 status
  aws ec2 wait instance-status-ok --instance-ids $INSTANCE_ID
  echo "✅ EC2 instance is running"

  # Wait additional time for Docker Compose
  echo "⏳ Waiting 60 more seconds for Docker services to initialize..."
  sleep 60

  # Test health endpoint
  echo "🧪 Testing health endpoint..."
  for i in {1..10}; do
    if curl -f -s http://$ELASTIC_IP:3000/health > /dev/null 2>&1; then
      echo "✅ Backend is healthy and responding!"
      echo ""
      echo "🎉 Deployment successful! Your backend is ready."
      echo ""
      echo "Next steps:"
      echo "1. Test API:      curl http://$ELASTIC_IP:3000/health"
      echo "2. View logs:     ssh ec2-user@$ELASTIC_IP 'cd /opt/opcua-backend && docker-compose logs -f'"
      echo "3. Connect MQTT:  mosquitto_pub -h $ELASTIC_IP -t test/topic -m 'hello'"
      echo ""
      exit 0
    fi
    echo "   Attempt $i/10: Health check not ready, retrying in 10s..."
    sleep 10
  done

  echo "⚠️  Health check timed out. Backend may still be starting."
  echo "   Check logs: ssh ec2-user@$ELASTIC_IP 'sudo tail -f /var/log/user-data.log'"
  echo "   Or: ssh ec2-user@$ELASTIC_IP 'cd /opt/opcua-backend && docker-compose logs'"

else
  echo "❌ Deployment outputs not found"
  exit 1
fi
```

Make it executable:
```bash
chmod +x infrastructure/deploy.sh
```

### Test Deployment Script

**File**: `infrastructure/test-deployment.js`

```javascript
const http = require('http');
const fs = require('fs');
const { exit } = require('process');

if (!fs.existsSync('outputs.json')) {
  console.error('❌ outputs.json not found. Run deployment first.');
  process.exit(1);
}

const outputs = JSON.parse(fs.readFileSync('outputs.json', 'utf8'));
const elasticIP = outputs.OpcuaBackendStack.ElasticIP;

console.log(`🧪 Testing deployment at ${elasticIP}...\n`);

async function testEndpoint(path, expectedStatus = 200, method = 'GET') {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: elasticIP,
      port: 3000,
      path,
      method,
      timeout: 5000,
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === expectedStatus) {
          console.log(`✅ ${method} ${path} - Status ${res.statusCode} (OK)`);
          resolve({ status: res.statusCode, data });
        } else {
          console.error(`❌ ${method} ${path} - Expected ${expectedStatus}, got ${res.statusCode}`);
          reject(new Error(`Unexpected status code: ${res.statusCode}`));
        }
      });
    });

    req.on('error', (err) => {
      console.error(`❌ ${method} ${path} - Connection failed: ${err.message}`);
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      console.error(`❌ ${method} ${path} - Timeout after 5s`);
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

(async () => {
  try {
    // Test health endpoint
    await testEndpoint('/health');

    // Test auth endpoints (should return 405 Method Not Allowed for GET)
    await testEndpoint('/auth/login', 405);

    // Test protected endpoint (should return 401 Unauthorized)
    await testEndpoint('/machines', 401);

    // Test non-existent endpoint (should return 404)
    await testEndpoint('/nonexistent', 404);

    console.log('\n✅ All tests passed!');
    console.log(`\n📊 Test Summary:`);
    console.log(`   - Health check: OK`);
    console.log(`   - Auth endpoints: OK`);
    console.log(`   - Protected routes: OK`);
    console.log(`   - Error handling: OK`);
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Tests failed');
    process.exit(1);
  }
})();
```

---

## Step 3: Update Application Configuration

### Update docker-compose.yml

**File**: `docker-compose.yml`

Change line 71:
```yaml
# FROM:
DOCKER_INFLUXDB_INIT_RETENTION: 1h

# TO:
DOCKER_INFLUXDB_INIT_RETENTION: 720h  # 30 days
```

### Update Repository URL in CDK Stack

**File**: `infrastructure/lib/opcua-backend-stack.ts`

Update line with repository clone:
```typescript
'git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git opcua-backend || echo "Update repo URL"',
```

Change to your actual GitHub repository.

---

## Step 4: Deploy to AWS

### First-Time Deployment

```bash
cd infrastructure
./deploy.sh
```

Expected output:
```
🚀 Deploying OPCUA Backend to AWS...
📦 Installing CDK dependencies...
🏗️  Bootstrapping CDK (first time setup)...
✅ CDK bootstrap complete
🔍 Validating CDK stack...
✅ Stack validation passed
🚀 Deploying infrastructure to AWS...

[CDK deployment progress...]

✅ Deployment complete!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 Elastic IP:     52.12.34.56
🖥️  Instance ID:    i-0123456789abcdef0
🌐 Backend URL:    http://52.12.34.56:3000
📡 MQTT Broker:    mqtt://52.12.34.56:1883
🔌 WebSocket URL:  ws://52.12.34.56:3000/socket.io/
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 Connection details saved to backend.env

⏳ Waiting for services to start...
✅ EC2 instance is running
✅ Backend is healthy and responding!

🎉 Deployment successful! Your backend is ready.
```

### Verify Deployment

```bash
# Check health
curl http://$(cat backend.env | grep ELASTIC_IP | cut -d= -f2):3000/health

# SSH into instance
ssh ec2-user@$(cat backend.env | grep ELASTIC_IP | cut -d= -f2)

# View Docker logs
ssh ec2-user@<elastic-ip> 'cd /opt/opcua-backend && docker-compose logs -f'

# Check user data log
ssh ec2-user@<elastic-ip> 'sudo tail -100 /var/log/user-data.log'
```

---

## Step 5: Connect MQTT Devices

### Update Machine Configuration

Point your injection molding machines to the new MQTT broker:

```
Broker:   mqtt://<your-elastic-ip>:1883
Topics:   factory/{factoryId}/machine/{deviceId}/{dataType}

Example:
  factory/factory-1/machine/machine-001/realtime
  factory/factory-1/machine/machine-001/spc
```

### Test MQTT Connection

```bash
# Install mosquitto clients
brew install mosquitto

# Publish test message
mosquitto_pub -h <elastic-ip> -t factory/test/machine/test-001/realtime -m '{"timestamp": 1234567890, "oil_temp": 45.5}'

# Subscribe to all topics
mosquitto_sub -h <elastic-ip> -t '#' -v
```

---

## Step 6: Configure DNS (Optional)

### Using Route53

Update `infrastructure/lib/opcua-backend-stack.ts`:

```typescript
// Add Route53 imports at top
import * as route53 from 'aws-cdk-lib/aws-route53';

// After Elastic IP creation, add:
const zone = route53.HostedZone.fromLookup(this, 'Zone', {
  domainName: 'yourdomain.com',
});

new route53.ARecord(this, 'OpcuaARecord', {
  zone,
  recordName: 'opcua',
  target: route53.RecordTarget.fromIpAddresses(eip.ref),
  ttl: cdk.Duration.minutes(5),
});
```

Then deploy:
```bash
cdk deploy
```

Your backend will be accessible at: `http://opcua.yourdomain.com:3000`

---

## Step 7: Monitoring & Maintenance

### View CloudFormation Stack

```bash
aws cloudformation describe-stacks --stack-name OpcuaBackendStack
```

### Check EC2 Instance Status

```bash
INSTANCE_ID=$(cat infrastructure/outputs.json | jq -r '.OpcuaBackendStack.InstanceId')
aws ec2 describe-instances --instance-ids $INSTANCE_ID
```

### View Docker Logs

```bash
ELASTIC_IP=$(cat backend.env | grep ELASTIC_IP | cut -d= -f2)
ssh ec2-user@$ELASTIC_IP 'cd /opt/opcua-backend && docker-compose logs -f backend'
```

### Check InfluxDB Data

```bash
ssh ec2-user@$ELASTIC_IP
cd /opt/opcua-backend
docker exec -it opcua-influxdb influx
# Then run queries:
> use machine-data
> show measurements
> select * from realtime limit 10
```

### Restart Services

```bash
ssh ec2-user@$ELASTIC_IP 'cd /opt/opcua-backend && docker-compose restart'
```

---

## Step 8: Updates & Rollback

### Update Application Code

```bash
# SSH into EC2
ssh ec2-user@<elastic-ip>

# Pull latest code
cd /opt/opcua-backend
git pull

# Restart services
docker-compose down
docker-compose up -d --build
```

### Update Infrastructure

```bash
cd infrastructure

# View changes
cdk diff

# Deploy updates
cdk deploy
```

### Rollback

```bash
# Destroy stack
cd infrastructure
cdk destroy

# Redeploy previous version
git checkout <previous-commit-hash>
./deploy.sh
```

---

## Cost Monitoring

### View Monthly Costs

```bash
# Get current month costs
aws ce get-cost-and-usage \
  --time-period Start=$(date +%Y-%m-01),End=$(date +%Y-%m-%d) \
  --granularity MONTHLY \
  --metrics "UnblendedCost" \
  --group-by Type=SERVICE

# Expected breakdown:
# - EC2: $30.37
# - EBS: $4.00
# - Data Transfer: $0 (within free tier)
```

### Set Up Billing Alerts

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name opcua-backend-cost-alert \
  --alarm-description "Alert when monthly costs exceed $50" \
  --metric-name EstimatedCharges \
  --namespace AWS/Billing \
  --statistic Maximum \
  --period 21600 \
  --evaluation-periods 1 \
  --threshold 50 \
  --comparison-operator GreaterThanThreshold
```

---

## Troubleshooting

### Health Check Fails

```bash
# Check if EC2 is running
aws ec2 describe-instance-status --instance-ids <instance-id>

# SSH and check Docker
ssh ec2-user@<elastic-ip>
docker-compose ps
docker-compose logs backend

# Check user data execution
sudo cat /var/log/user-data.log
```

### Docker Services Not Starting

```bash
ssh ec2-user@<elastic-ip>
cd /opt/opcua-backend

# Check Docker status
sudo systemctl status docker

# Check Docker Compose
docker-compose ps
docker-compose logs

# Restart services
docker-compose down
docker-compose up -d
```

### Cannot SSH to Instance

```bash
# Verify security group allows your IP
aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=*OpcuaSecurityGroup*"

# Update security group to allow your IP
# Edit infrastructure/lib/opcua-backend-stack.ts
# Redeploy: cdk deploy
```

### MQTT Connection Fails

```bash
# Test from EC2 instance itself
ssh ec2-user@<elastic-ip>
docker exec -it opcua-mosquitto mosquitto_pub -t test -m "hello"

# Check Mosquitto logs
docker logs opcua-mosquitto
```

---

## Summary

You've successfully deployed your IoT backend to AWS with:

- ✅ **Infrastructure as Code**: CDK stack for VPC, EC2, Security Groups
- ✅ **Static IP**: Elastic IP for reliable device connections
- ✅ **One-Command Deploy**: `./deploy.sh` automated deployment
- ✅ **Docker Compose**: All services (NestJS, PostgreSQL, InfluxDB, Redis, Mosquitto)
- ✅ **Auto-Restart**: Systemd service for Docker Compose
- ✅ **30-Day Retention**: InfluxDB configured for historical data
- ✅ **Monitoring**: Health checks and automated testing
- ✅ **Cost-Effective**: $35-45/month for 50-100 machines

**Next Steps**:
1. Connect production machines to `mqtt://<elastic-ip>:1883`
2. Configure frontend to use `http://<elastic-ip>:3000`
3. Set up DNS with Route53 (optional)
4. Configure SSL with ACM + Nginx (optional)
5. Set up CloudWatch alarms for monitoring
