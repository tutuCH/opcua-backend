# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Start in development mode (with hot reload)
npm run start:dev

# Build the application
npm run build

# Run in production mode
npm run start:prod

# Linting and formatting
npm run lint
npm run format

# Testing
npm run test          # Unit tests
npm run test:watch    # Watch mode
npm run test:e2e      # End-to-end tests
npm run test:cov      # Test coverage
```

## Architecture Overview

This is a NestJS-based backend for an OPC UA dashboard with IoT capabilities. The application integrates with:

- **Database**: MySQL with TypeORM for user, factory, and machine data
- **Authentication**: JWT + AWS Cognito with user ownership guards
- **IoT Integration**: AWS IoT Core for MQTT connections and AWS Timestream for time-series data
- **Email**: Gmail SMTP for notifications

### Core Modules

- **AuthModule**: JWT authentication, AWS Cognito integration, email services
- **UserModule**: User management with TypeORM entities
- **FactoriesModule**: Factory management 
- **MachinesModule**: Machine/device management
- **MqttConnectionModule**: AWS IoT Core MQTT connection management
- **MachineTimestreamModule**: AWS Timestream integration for time-series data

### Key Architecture Patterns

- **Global Guards**: `JwtAuthGuard` and `UserOwnershipGuard` applied globally via `APP_GUARD`
- **Public Routes**: Use `@Public()` decorator to bypass authentication
- **User ID Extraction**: Use `@JwtUserId()` decorator to extract user ID from JWT tokens
- **Database**: MySQL connection configured in `AppModule` with entities auto-synchronized

### Database Configuration

The application connects to a local MySQL database:
- Host: localhost:3306
- Database: opcuadashboard
- Username/Password: root/root
- Entities: User, Factory, Machine

### AWS Integration

- **Region**: us-east-1
- **Timestream Database**: injection_dev
- **Timestream Table**: IoTMulti
- **IoT Core**: Dynamic thing creation/deletion for MQTT clients

### Important Notes

- CORS is configured for `http://localhost:3030` and `https://opcua-frontend.vercel.app`
- The application runs on port 3000
- Some helper services (RabbitMQ, DataProcessing) are commented out but present in the codebase
- Email configuration requires Gmail SMTP credentials