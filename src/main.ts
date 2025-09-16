import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { JwtAuthGuard } from './auth/strategies/auth.guard';
import { Reflector } from '@nestjs/core';
import { UserOwnershipGuard } from './auth/strategies/user.ownership.guard';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  // Get configuration service
  const configService = app.get(ConfigService);
  const port = configService.get('app.port') || 3000;
  const environment = configService.get('app.environment');
  const frontendUrl = configService.get('app.frontendUrl');

  // Enhanced CORS configuration for demo environment
  const corsOrigins = [
    'http://localhost:3030',
    'http://localhost:3031',
    'http://localhost:3000', // For WebSocket testing
    'https://opcua-frontend.vercel.app',
  ];

  if (frontendUrl && !corsOrigins.includes(frontendUrl)) {
    corsOrigins.push(frontendUrl);
  }

  // Add development origins in demo mode
  if (environment === 'development') {
    corsOrigins.push(
      'http://127.0.0.1:3030',
      'http://127.0.0.1:3000',
      'ws://localhost:3000',
      'ws://127.0.0.1:3000',
    );
  }

  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'x-requested-with'],
  });

  // Get Reflector instance from the app context
  const reflector = app.get(Reflector);

  // Apply JwtAuthGuard globally (but allow @Public() decorator to bypass)
  app.useGlobalGuards(
    new JwtAuthGuard(reflector),
    new UserOwnershipGuard(reflector),
  );

  await app.listen(port);

  logger.log(`🚀 Application started on port ${port}`);
  logger.log(`🌍 Environment: ${environment}`);
  logger.log(`📡 CORS enabled for: ${corsOrigins.join(', ')}`);
  logger.log(`🏥 Health check: http://localhost:${port}/health`);
  logger.log(`🧪 Demo endpoints: http://localhost:${port}/demo`);
  logger.log(`🔌 WebSocket endpoint: ws://localhost:${port}/socket.io/`);
  logger.log(
    `📊 WebSocket events: subscribe-machine, realtime-update, spc-update, machine-alert`,
  );

  // Log demo-specific information
  const mockDataEnabled = configService.get('mockData.enabled');
  if (mockDataEnabled) {
    logger.log(`🤖 Mock data generation: ENABLED`);
    logger.log(`🔗 Demo integration: PostgreSQL + InfluxDB + Redis + MQTT`);
  }
}
bootstrap();
