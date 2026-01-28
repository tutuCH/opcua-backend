import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface OpcuaBackendStackProps extends cdk.StackProps {
  instanceType?: ec2.InstanceType;
  storageSize?: number;
  enableElasticIP?: boolean;
}

export class OpcuaBackendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: OpcuaBackendStackProps) {
    super(scope, id, props);

    // Default to production configuration if not specified
    const instanceType =
      props?.instanceType ||
      ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM);
    const storageSize = props?.storageSize || 50;
    const enableElasticIP = props?.enableElasticIP ?? true;

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
      'Allow HTTP',
    );
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow HTTPS',
    );
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(3000),
      'Allow Backend API',
    );
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(1883),
      'Allow MQTT',
    );

    // Restrict SSH to your IP (update this!)
    // For now allowing from anywhere - UPDATE THIS for security
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      'Allow SSH - UPDATE TO YOUR IP!',
    );

    // 3. IAM Role for EC2 (for CloudWatch logs and Systems Manager)
    const role = new iam.Role(this, 'OpcuaInstanceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'CloudWatchAgentServerPolicy',
        ),
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'AmazonSSMManagedInstanceCore',
        ),
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
      'echo "Timestamp: $(date)"',
      '',
      '# Update system',
      'echo "Updating system packages..."',
      'yum update -y',
      '',
      '# Install Docker',
      'echo "Installing Docker..."',
      'yum install -y docker git',
      'systemctl start docker',
      'systemctl enable docker',
      'usermod -aG docker ec2-user',
      '',
      '# Install Docker Compose',
      'echo "Installing Docker Compose..."',
      'curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose',
      'chmod +x /usr/local/bin/docker-compose',
      'ln -sf /usr/local/bin/docker-compose /usr/bin/docker-compose',
      '',
      '# Verify installations',
      'echo "Docker version: $(docker --version)"',
      'echo "Docker Compose version: $(docker-compose --version)"',
      '',
      '# Clone repository',
      'echo "Cloning repository..."',
      'cd /opt',
      'git clone https://github.com/tutuCH/opcua-backend.git opcua-backend || {',
      '  echo "ERROR: Failed to clone repository. Please update the repository URL in the CDK stack."',
      '  echo "Edit infrastructure/lib/opcua-backend-stack.ts and update the git clone URL."',
      '  exit 1',
      '}',
      'cd opcua-backend',
      '',
      '# Setup environment files',
      'echo "Setting up environment files..."',
      'if [ -f .env.compose.example ]; then',
      '  cp .env.compose.example .env.compose',
      'elif [ -f .env.compose.template ]; then',
      '  cp .env.compose.template .env.compose',
      'else',
      '  echo "ERROR: No .env.compose template found"',
      '  exit 1',
      'fi',
      '',
      'if [ -f .env.local.example ]; then',
      '  cp .env.local.example .env.local',
      'fi',
      '',
      '# Generate secure secrets',
      'echo "Generating secure secrets..."',
      'JWT_SECRET=$(openssl rand -base64 48)',
      'POSTGRES_PASSWORD=$(openssl rand -base64 24)',
      'REDIS_PASSWORD=$(openssl rand -base64 24)',
      'INFLUXDB_PASSWORD=$(openssl rand -base64 24)',
      'INFLUXDB_TOKEN=$(openssl rand -base64 48)',
      '',
      '# Set production Stripe keys from environment or AWS Secrets Manager',
      '# TODO: Update these with actual keys from secure storage',
      'STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY:-}"',
      'STRIPE_PUBLISHABLE_KEY="${STRIPE_PUBLISHABLE_KEY:-}"',
      'STRIPE_WEBHOOK_SECRET="${STRIPE_WEBHOOK_SECRET:-}"',
      '',
      '# Update .env.compose with generated secrets',
      'echo "Updating environment variables..."',
      'sed -i "s|JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" .env.compose',
      'sed -i "s|POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$POSTGRES_PASSWORD|" .env.compose',
      'sed -i "s|REDIS_PASSWORD=.*|REDIS_PASSWORD=$REDIS_PASSWORD|" .env.compose',
      'sed -i "s|INFLUXDB_PASSWORD=.*|INFLUXDB_PASSWORD=$INFLUXDB_PASSWORD|" .env.compose',
      'sed -i "s|INFLUXDB_TOKEN=.*|INFLUXDB_TOKEN=$INFLUXDB_TOKEN|" .env.compose',
      'sed -i "s|FRONTEND_URL=.*|FRONTEND_URL=https://dashboard.harrytu.cv|" .env.compose',
      'sed -i "s|STRIPE_SECRET_KEY=.*|STRIPE_SECRET_KEY=$STRIPE_SECRET_KEY|" .env.compose',
      'sed -i "s|STRIPE_PUBLISHABLE_KEY=.*|STRIPE_PUBLISHABLE_KEY=$STRIPE_PUBLISHABLE_KEY|" .env.compose',
      'sed -i "s|STRIPE_WEBHOOK_SECRET=.*|STRIPE_WEBHOOK_SECRET=$STRIPE_WEBHOOK_SECRET|" .env.compose',
      '',
      '# Update InfluxDB retention to 30 days',
      'echo "Configuring InfluxDB retention to 30 days..."',
      'sed -i "s|DOCKER_INFLUXDB_INIT_RETENTION:.*|DOCKER_INFLUXDB_INIT_RETENTION: 720h|" docker-compose.yml',
      '',
      '# Start services',
      'echo "Starting Docker Compose services..."',
      'docker-compose up -d',
      '',
      '# Wait for services to be healthy',
      'echo "Waiting for services to initialize..."',
      'sleep 30',
      '',
      '# Check service status',
      'echo "Service status:"',
      'docker-compose ps',
      '',
      '# Create systemd service for auto-restart',
      'echo "Creating systemd service..."',
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
      'echo "=== OPCUA Backend Setup Complete ==="',
      'echo "Timestamp: $(date)"',
      'echo "Check service status: docker-compose ps"',
      'echo "View logs: docker-compose logs -f"',
    );

    // 5. EC2 Instance
    const instance = new ec2.Instance(this, 'OpcuaInstance', {
      vpc,
      instanceType, // Use parameter from props
      machineImage: ec2.MachineImage.latestAmazonLinux2023({
        cpuType: ec2.AmazonLinuxCpuType.X86_64,
      }),
      securityGroup,
      role,
      blockDevices: [
        {
          deviceName: '/dev/xvda',
          volume: ec2.BlockDeviceVolume.ebs(storageSize, {
            // Use parameter from props
            volumeType: ec2.EbsDeviceVolumeType.GP3,
            deleteOnTermination: true,
          }),
        },
      ],
      userData: userDataScript,
      userDataCausesReplacement: false,
    });

    // Tag the instance
    cdk.Tags.of(instance).add('Name', 'OPCUA Backend');

    // 6. Elastic IP (Static IP) - Conditional based on enableElasticIP
    let ipAddress: string;

    if (enableElasticIP) {
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

      ipAddress = eip.ref;

      new cdk.CfnOutput(this, 'ElasticIP', {
        value: eip.ref,
        description: 'Static IP address for backend',
        exportName: 'OpcuaBackendElasticIP',
      });
    } else {
      // Use dynamic public IP
      ipAddress = instance.instancePublicIp;

      new cdk.CfnOutput(this, 'PublicIP', {
        value: instance.instancePublicIp,
        description: 'Dynamic public IP (changes on stop/start)',
      });
    }

    // 7. Outputs
    new cdk.CfnOutput(this, 'InstanceId', {
      value: instance.instanceId,
      description: 'EC2 Instance ID',
    });

    new cdk.CfnOutput(this, 'BackendURL', {
      value: `http://${ipAddress}:3000`,
      description: 'Backend API URL',
    });

    new cdk.CfnOutput(this, 'HealthCheckURL', {
      value: `http://${ipAddress}:3000/health`,
      description: 'Health check endpoint',
    });

    new cdk.CfnOutput(this, 'MQTTBroker', {
      value: `mqtt://${ipAddress}:1883`,
      description: 'MQTT Broker URL for devices',
    });

    new cdk.CfnOutput(this, 'WebSocketURL', {
      value: `ws://${ipAddress}:3000/socket.io/`,
      description: 'WebSocket URL for real-time updates',
    });

    new cdk.CfnOutput(this, 'SSHCommand', {
      value: `ssh ec2-user@${ipAddress}`,
      description: 'SSH command to connect to instance',
    });

    new cdk.CfnOutput(this, 'InstanceType', {
      value: instanceType.toString(),
      description: 'EC2 instance type',
    });

    new cdk.CfnOutput(this, 'StorageSize', {
      value: `${storageSize} GB`,
      description: 'EBS storage size',
    });
  }
}
