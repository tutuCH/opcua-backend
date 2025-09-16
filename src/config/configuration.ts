import { registerAs } from '@nestjs/config';

export const databaseConfig = registerAs('database', () => ({
  // PostgreSQL Configuration
  postgres: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT, 10) || 5432,
    username: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'password',
    database: process.env.POSTGRES_DB || 'opcua_dashboard',
  },

  // InfluxDB Configuration
  influxdb: {
    url: process.env.INFLUXDB_URL || 'http://localhost:8086',
    token: process.env.INFLUXDB_TOKEN || 'dev-token-super-secret-admin-token',
    org: process.env.INFLUXDB_ORG || 'opcua-org',
    bucket: process.env.INFLUXDB_BUCKET || 'machine-data',
  },

  // Redis Configuration
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || 'password',
  },
}));

export const mqttConfig = registerAs('mqtt', () => ({
  brokerUrl: process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
  username: process.env.MQTT_USERNAME || null,
  password: process.env.MQTT_PASSWORD || null,
}));

export const appConfig = registerAs('app', () => ({
  environment: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3030',
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
}));

export const mockDataConfig = registerAs('mockData', () => ({
  enabled: process.env.ENABLE_MOCK_DATA === 'true',
  machineCount: parseInt(process.env.MOCK_MACHINES_COUNT, 10) || 3,
  dataInterval: parseInt(process.env.MOCK_DATA_INTERVAL, 10) || 5000,
}));

export const authConfig = registerAs('auth', () => ({
  jwtSecret: process.env.JWT_SECRET || 'default-secret-change-in-production',

  // AWS Cognito
  cognito: {
    domain: process.env.COGNITO_DOMAIN || null,
    clientId: process.env.COGNITO_CLIENT_ID || null,
    clientSecret: process.env.COGNITO_CLIENT_SECRET || null,
    callbackUrl:
      process.env.COGNITO_CALLBACK_URL ||
      'http://localhost:3000/auth/cognito/callback',
    issuerUrl: process.env.COGNITO_ISSUER_URL || null,
  },
}));

export const emailConfig = registerAs('email', () => ({
  address: process.env.EMAIL_ADDRESS || null,
  password: process.env.EMAIL_PASSWORD || null,
}));

export const awsConfig = registerAs('aws', () => ({
  region: process.env.AWS_REGION || 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID || null,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || null,
}));

export const stripeConfig = registerAs('stripe', () => ({
  publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
  secretKey: process.env.STRIPE_SECRET_KEY || null,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || null,
}));
