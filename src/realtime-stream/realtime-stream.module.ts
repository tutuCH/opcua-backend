import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RealtimeStreamController } from './realtime-stream.controller';
import { RealtimeStreamService } from './realtime-stream.service';
import { RealtimeStreamAuthService } from './realtime-stream-auth.service';
import { RedisModule } from '../redis/redis.module';
import { MachinesModule } from '../machines/machines.module';

@Module({
  imports: [
    RedisModule,
    MachinesModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret:
          configService.get<string>('auth.jwtSecret') ||
          process.env.JWT_SECRET ||
          'fallback-secret',
      }),
    }),
  ],
  controllers: [RealtimeStreamController],
  providers: [RealtimeStreamService, RealtimeStreamAuthService],
  exports: [RealtimeStreamService, RealtimeStreamAuthService],
})
export class RealtimeStreamModule {}
