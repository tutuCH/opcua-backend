import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as http from 'http';
import { RealtimeStreamController } from './realtime-stream.controller';
import { RealtimeStreamService } from './realtime-stream.service';
import { RealtimeStreamAuthService } from './realtime-stream-auth.service';
import { RedisService } from '../redis/redis.service';
import { MachinesService } from '../machines/machines.service';

describe('RealtimeStreamController (SSE)', () => {
  let app: INestApplication;
  let streamService: RealtimeStreamService;
  let authService: RealtimeStreamAuthService;
  let machinesService: jest.Mocked<MachinesService>;
  let baseUrl: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret' })],
      controllers: [RealtimeStreamController],
      providers: [
        RealtimeStreamService,
        RealtimeStreamAuthService,
        {
          provide: RedisService,
          useValue: {
            subscribe: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: MachinesService,
          useValue: {
            findOneByNameForUser: jest.fn().mockResolvedValue({
              machineId: 1,
              machineName: 'Machine 1',
              user: { userId: 123 },
            }),
            getMachineStatus: jest.fn().mockResolvedValue({
              deviceId: 'Machine 1',
              data: { devId: 'Machine 1' },
              source: 'cache',
              timestamp: new Date().toISOString(),
            }),
          },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
    await app.listen(0);

    baseUrl = await app.getUrl();
    streamService = app.get(RealtimeStreamService);
    authService = app.get(RealtimeStreamAuthService);
    machinesService = app.get(MachinesService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('streams realtime-update events', async () => {
    const { ticket } = await authService.createStreamTicket(123, 300);

    const streamData = await new Promise<string>((resolve, reject) => {
      const streamUrl = `${baseUrl}/sse/stream?deviceId=${encodeURIComponent(
        'Machine 1',
      )}&ticket=${encodeURIComponent(ticket)}`;

      const req = http.get(streamUrl, (res) => {
        res.setEncoding('utf8');
        let buffer = '';
        const timeout = setTimeout(() => {
          req.destroy();
          reject(new Error('Stream timeout'));
        }, 5000);

        setTimeout(() => {
          streamService.publish({
            type: 'realtime-update',
            deviceId: 'Machine 1',
            data: {
              deviceId: 'Machine 1',
              data: { OT: 55 },
              timestamp: new Date().toISOString(),
            },
          });
        }, 50);

        res.on('data', (chunk) => {
          buffer += chunk;
          if (buffer.includes('event: realtime-update')) {
            clearTimeout(timeout);
            req.destroy();
            resolve(buffer);
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });
    });

    expect(streamData).toContain('event: realtime-update');
    expect(streamData).toContain('"deviceId":"Machine 1"');
    expect(machinesService.findOneByNameForUser).toHaveBeenCalledWith(
      'Machine 1',
      123,
    );
  });
});
