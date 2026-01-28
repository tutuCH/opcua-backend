#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { OpcuaBackendStack } from '../lib/opcua-backend-stack';

const app = new cdk.App();

// Get deployment environment from ENV variable (planning, testing, production)
const environment = process.env.DEPLOY_ENV || 'production';

// Configuration for each phase
const config = {
  planning: {
    instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.SMALL),
    storageSize: 30,
    enableElasticIP: false,  // Use dynamic IP to save $3.60/month
    description: 'OPCUA IoT Backend - Planning Phase (On-Demand)',
  },
  testing: {
    instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.SMALL),
    storageSize: 30,
    enableElasticIP: true,  // Static IP for machine configuration
    description: 'OPCUA IoT Backend - Testing Phase (1-10 machines)',
  },
  production: {
    instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM),
    storageSize: 50,
    enableElasticIP: true,
    description: 'OPCUA IoT Backend - Production (50-100 machines)',
  },
};

// Validate environment
if (!['planning', 'testing', 'production'].includes(environment)) {
  console.error(`Invalid DEPLOY_ENV: ${environment}`);
  console.error('Valid values: planning, testing, production');
  process.exit(1);
}

const envConfig = config[environment as keyof typeof config];

console.log(`Deploying with environment: ${environment}`);
console.log(`Description: ${envConfig.description}`);
console.log(`Instance type: ${envConfig.instanceType}`);
console.log(`Storage size: ${envConfig.storageSize} GB`);
console.log(`Elastic IP: ${envConfig.enableElasticIP ? 'enabled' : 'disabled (dynamic IP)'}`);

new OpcuaBackendStack(app, 'OpcuaBackendStack', {
  instanceType: envConfig.instanceType,
  storageSize: envConfig.storageSize,
  enableElasticIP: envConfig.enableElasticIP,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  tags: {
    Project: 'OPCUA Dashboard',
    Environment: environment.charAt(0).toUpperCase() + environment.slice(1),
    ManagedBy: 'AWS CDK',
    Phase: environment,
  },
});

app.synth();
