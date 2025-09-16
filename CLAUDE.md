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
npm run test:debug    # Debug tests with Node inspector

# Demo Environment (Dockerized services)
npm run demo:setup    # Copy demo .env configuration
npm run demo:start    # Start PostgreSQL, InfluxDB, Redis, MQTT containers
npm run demo:stop     # Stop all demo containers
npm run demo:restart  # Restart all demo containers
npm run demo:logs     # Follow logs from all containers
npm run demo:health   # Check container status
npm run demo:clean    # Stop containers and remove volumes/images
npm run demo:dev      # Setup + start containers + start NestJS in dev mode
```

## Architecture Overview

This is a NestJS-based backend for an OPC UA dashboard with IoT capabilities. The application integrates with:

- **Database**: PostgreSQL (production) with TypeORM for user, factory, and machine data
- **Authentication**: JWT + AWS Cognito with global user ownership guards
- **Time-Series Data**: InfluxDB for real-time machine metrics and SPC data
- **Message Queue**: Redis for MQTT message processing and caching
- **IoT Communication**: MQTT broker (Mosquitto) for device data ingestion
- **Real-Time Updates**: WebSocket (Socket.IO) for live dashboard updates
- **Payments**: Stripe integration for subscription billing

### Data Processing Pipeline

The application implements a multi-stage IoT data processing pipeline:

1. **MQTT Ingestion** (`MqttProcessorService`): Subscribes to MQTT topics and receives device data
2. **Redis Queue** (`RedisService`): Stores incoming messages in topic-based queues (`mqtt:realtime`, `mqtt:spc`, `mqtt:tech`)
3. **Message Processing** (`MockDataService`, `MessageProcessorService`): Processes queued messages and validates timestamps
4. **InfluxDB Storage** (`InfluxDBService`): Persists time-series data with retention policy compliance
5. **WebSocket Broadcasting** (`MachineGateway`): Broadcasts processed data to connected clients in real-time

### Core Modules

- **AuthModule**: JWT authentication, AWS Cognito integration, email services
- **UserModule**: User management with PostgreSQL entities
- **FactoriesModule**: Factory/facility management with user ownership
- **MachinesModule**: Machine/device registration and configuration
- **SubscriptionModule**: Stripe billing and subscription management
- **MqttProcessorModule**: MQTT message ingestion and queue management
- **InfluxDBModule**: Time-series data storage and retrieval
- **RedisModule**: Caching and message queue operations
- **WebSocketModule**: Real-time data broadcasting via Socket.IO
- **MockDataModule**: Demo data generation for development/testing

### Key Architecture Patterns

- **Global Guards**: `JwtAuthGuard` and `UserOwnershipGuard` applied globally via `APP_GUARD`
- **Public Routes**: Use `@Public()` decorator to bypass authentication  
- **User ID Extraction**: Use `@JwtUserId()` decorator to extract user ID from JWT tokens
- **Queue-Based Processing**: Redis lists for reliable message processing with age validation
- **Retention Policy Compliance**: Timestamp validation prevents InfluxDB retention violations
- **WebSocket Event System**: Topic-based real-time updates (`subscribe-machine`, `realtime-update`, `spc-update`)

### Database Configuration

**PostgreSQL (Production/Demo)**:
- Host: localhost:5432 (demo), configured via environment
- Database: opcua_dashboard
- Entities: User, Factory, Machine, UserSubscription
- Auto-sync enabled in non-production environments

**InfluxDB (Time-Series)**:
- URL: http://localhost:8086
- Organization: opcua-org
- Bucket: machine-data  
- Retention: 1 hour minimum (configurable)
- Token authentication required

**Redis (Cache/Queue)**:
- Host: localhost:6379
- Password authentication
- Queues: `mqtt:realtime`, `mqtt:spc`, `mqtt:tech`
- Publisher/subscriber channels for real-time updates

### Demo Environment

The `demoMqttServer/` directory contains Docker Compose configuration for local development:
- **PostgreSQL**: Metadata storage with health checks
- **InfluxDB**: Time-series data with auto-setup and retention policies
- **Redis**: Message queue and caching with persistence
- **Mosquitto MQTT**: Message broker on port 1884 (mapped from 1883)

MQTT topics follow the pattern: `factory/{factoryId}/machine/{deviceId}/{dataType}`

### AWS Integration (Production)

- **Region**: us-east-1
- **Timestream Database**: injection_dev
- **Timestream Table**: IoTMulti  
- **IoT Core**: Dynamic thing creation/deletion for MQTT clients
- **Cognito**: User authentication and management

### Important Notes

- Database migrated from MySQL to PostgreSQL (old config preserved in comments)
- CORS configured for multiple origins including localhost and Vercel deployments
- WebSocket endpoint: `ws://localhost:3000/socket.io/`
- Mock data generation can be enabled via `ENABLE_MOCK_DATA=true` environment variable
- Stripe service includes production-safe error handling with environment detection
- InfluxDB retention policy violations prevented through timestamp age validation
- use curl --location 'http://localhost:3000/auth/login' \
--header 'Content-Type: application/json' \
--data-raw '{
    "email": "tuchenhsien@gmail.com",
    "password": "abc123"
}'

to get access_token for backend api authentication token