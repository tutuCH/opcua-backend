import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { JwtAuthGuard } from './auth/strategies/auth.guard';
import { Reflector } from '@nestjs/core';
import { UserOwnershipGuard } from './auth/strategies/user.ownership.guard';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });
  
  app.enableCors({
    origin: [
      'http://localhost:3030',
      'http://localhost:3031',
      'https://opcua-frontend.vercel.app',
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true,
  });
  
  // Get Reflector instance from the app context
  const reflector = app.get(Reflector);

  // Apply JwtAuthGuard globally
  app.useGlobalGuards(
    new JwtAuthGuard(reflector),
    new UserOwnershipGuard(reflector),
  );
  await app.listen(3000);
}
bootstrap();
