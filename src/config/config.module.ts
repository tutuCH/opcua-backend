// src/config/config.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
  databaseConfig,
  mqttConfig,
  appConfig,
  mockDataConfig,
  authConfig,
  emailConfig,
  awsConfig,
  stripeConfig,
} from './configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        databaseConfig,
        mqttConfig,
        appConfig,
        mockDataConfig,
        authConfig,
        emailConfig,
        awsConfig,
        stripeConfig,
      ],
      envFilePath: [
        '.env.local',
        '.env',
        `.env.${process.env.NODE_ENV || 'development'}`,
      ],
    }),
  ],
  exports: [ConfigModule],
})
export class AppConfigModule {}
