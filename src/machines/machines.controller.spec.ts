import { Test, TestingModule } from '@nestjs/testing';
import { MachinesController } from './machines.controller';
import { MachinesService } from './machines.service';
import { InfluxDBService } from '../influxdb/influxdb.service';
import { RedisService } from '../redis/redis.service';
import { SPCLimitsService } from '../spc-limits/spc-limits.service';
import { LatestDataCacheService } from '../latest-data-cache/latest-data-cache.service';
import { HttpException } from '@nestjs/common';

describe('MachinesController', () => {
  let controller: MachinesController;
  let service: jest.Mocked<MachinesService>;
  let influxDbService: jest.Mocked<InfluxDBService>;
  let spcLimitsService: jest.Mocked<SPCLimitsService>;
  let latestDataCacheService: jest.Mocked<LatestDataCacheService>;

  const mockMachine = {
    machineId: 1,
    machineName: 'TestMachine',
    machineIndex: '1',
    status: 'running',
    createdAt: new Date(),
    user: {} as any,
    factory: {} as any,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MachinesController],
      providers: [
        {
          provide: MachinesService,
          useValue: {
            findOneForUser: jest.fn().mockResolvedValue(mockMachine),
            findOne: jest.fn().mockResolvedValue(mockMachine),
          },
        },
        {
          provide: InfluxDBService,
          useValue: {
            querySPCDataWithIntelligentDownsampling: jest.fn(),
            queryRealtimeDataWithIntelligentDownsampling: jest.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: {},
        },
        {
          provide: SPCLimitsService,
          useValue: {
            getLimits: jest.fn(),
          },
        },
        {
          provide: LatestDataCacheService,
          useValue: {
            getLatestSPCData: jest.fn(),
            getLatestRealtimeData: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<MachinesController>(MachinesController);
    service = module.get(MachinesService);
    influxDbService = module.get(InfluxDBService);
    spcLimitsService = module.get(SPCLimitsService);
    latestDataCacheService = module.get(LatestDataCacheService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('SPC v2.0 Endpoints', () => {
    beforeEach(() => {
      jest.spyOn(service, 'findOneForUser').mockResolvedValue(mockMachine);
      jest.spyOn(service, 'findOne').mockResolvedValue(mockMachine);
    });

    describe('GET /:id/spc/limits', () => {
      it('should return SPC limits for valid fields', async () => {
        const mockLimits = {
          limits: {
            cycle_time: {
              mean: 12.5,
              stdDev: 0.8,
              ucl: 14.9,
              lcl: 10.1,
              n: 100,
              calculatedAt: '2026-01-18T10:00:00Z',
              expiresAt: '2026-01-18T10:30:00Z',
              isCached: false,
            },
          },
          metadata: {
            deviceId: 'TestMachine',
            calculationTime: '50ms',
            cacheKey: 'spc:limits:TestMachine:cycle_time:24h:sigma3',
          },
        };

        jest.spyOn(spcLimitsService, 'getLimits').mockResolvedValue(mockLimits);

        const result = await controller.getSPCLimits(
          '1',
          1,
          'cycle_time',
          '24h',
          '3',
          'false',
        );

        expect(result).toEqual(mockLimits);
        expect(spcLimitsService.getLimits).toHaveBeenCalledWith(
          'TestMachine',
          ['cycle_time'],
          '24h',
          3,
          false,
        );
      });

      it('should throw 400 when fields parameter is missing', async () => {
        await expect(
          controller.getSPCLimits('1', 1, undefined, '24h', '3', 'false'),
        ).rejects.toThrow(HttpException);
      });

      it('should validate field names and throw 400 for invalid fields', async () => {
        await expect(
          controller.getSPCLimits(
            '1',
            1,
            'invalid_field,another_invalid',
            '24h',
            '3',
            'false',
          ),
        ).rejects.toThrow(HttpException);
      });

      it('should accept multiple valid fields', async () => {
        const mockLimits = {
          limits: {
            cycle_time: { mean: 12.5, stdDev: 0.8, ucl: 14.9, lcl: 10.1, n: 100, calculatedAt: '2026-01-18T10:00:00Z', expiresAt: '2026-01-18T10:30:00Z', isCached: false },
            injection_velocity_max: { mean: 84.5, stdDev: 2.3, ucl: 91.4, lcl: 77.6, n: 100, calculatedAt: '2026-01-18T10:00:00Z', expiresAt: '2026-01-18T10:30:00Z', isCached: false },
          },
          metadata: {
            deviceId: 'TestMachine',
            calculationTime: '50ms',
            cacheKey: 'spc:limits:TestMachine:cycle_time,injection_velocity_max:24h:sigma3',
          },
        };

        jest.spyOn(spcLimitsService, 'getLimits').mockResolvedValue(mockLimits);

        const result = await controller.getSPCLimits(
          '1',
          1,
          'cycle_time,injection_velocity_max',
          '24h',
          '3',
          'false',
        );

        expect(result.limits).toHaveProperty('cycle_time');
        expect(result.limits).toHaveProperty('injection_velocity_max');
      });
    });

    describe('GET /:id/spc/latest', () => {
      it('should return latest N SPC data points', async () => {
        const mockData = [
          { _time: '2026-01-18T10:00:00Z', cycle_time: 12.3 },
          { _time: '2026-01-18T10:01:00Z', cycle_time: 12.5 },
        ];

        jest
          .spyOn(latestDataCacheService, 'getLatestSPCData')
          .mockResolvedValue(mockData);

        const result = await controller.getSPCLatest('1', 1, 'cycle_time', '5');

        expect(result.deviceId).toBe('TestMachine');
        expect(result.data).toEqual(mockData);
        expect(result.metadata.count).toBe(2);
      });

      it('should use default count of 10 when not specified', async () => {
        const mockData = Array.from({ length: 10 }, (_, i) => ({
          _time: `2026-01-18T10:0${i}:00Z`,
          cycle_time: 12 + i * 0.1,
        }));

        jest
          .spyOn(latestDataCacheService, 'getLatestSPCData')
          .mockResolvedValue(mockData);

        await controller.getSPCLatest('1', 1, 'cycle_time', undefined);

        expect(latestDataCacheService.getLatestSPCData).toHaveBeenCalledWith(
          'TestMachine',
          10,
        );
      });
    });

    describe('GET /:id/realtime/latest', () => {
      it('should return latest N realtime data points', async () => {
        const mockData = [
          { _time: '2026-01-18T10:00:00Z', oil_temp: 52.3 },
          { _time: '2026-01-18T10:01:00Z', oil_temp: 52.5 },
        ];

        jest
          .spyOn(latestDataCacheService, 'getLatestRealtimeData')
          .mockResolvedValue(mockData);

        const result = await controller.getRealtimeLatest(
          '1',
          1,
          'oil_temp',
          '5',
        );

        expect(result.deviceId).toBe('TestMachine');
        expect(result.data).toEqual(mockData);
        expect(result.metadata.count).toBe(2);
      });
    });

    describe('GET /:id/spc/history-optimized', () => {
      it('should return downsampled data with field filtering', async () => {
        const mockData = [
          { _time: '2026-01-18T09:00:00Z', cycle_time: 12.3 },
          { _time: '2026-01-18T09:30:00Z', cycle_time: 12.5 },
        ];

        jest
          .spyOn(influxDbService, 'querySPCDataWithIntelligentDownsampling')
          .mockResolvedValue(mockData);

        const result = await controller.getSPCHistoryOptimized(
          '1',
          1,
          '2026-01-18T09:00:00Z',
          '2026-01-18T10:00:00Z',
          'cycle_time',
          '50',
        );

        expect(result.deviceId).toBe('TestMachine');
        expect(result.data).toHaveLength(2);
        expect(result.metadata.requestedFields).toEqual(['cycle_time']);
        expect(result.metadata.timeRange).toBe(
          '2026-01-18T09:00:00Z/2026-01-18T10:00:00Z',
        );
        // Verify queryTime is a valid duration format (number + 'ms')
        expect(result.metadata.queryTime).toMatch(/\d+ms/);
      });

      it('should return all fields when no fields parameter is provided', async () => {
        const mockData = [
          {
            _time: '2026-01-18T09:00:00Z',
            cycle_time: 12.3,
            injection_velocity_max: 85.2,
          },
        ];

        jest
          .spyOn(influxDbService, 'querySPCDataWithIntelligentDownsampling')
          .mockResolvedValue(mockData);

        const result = await controller.getSPCHistoryOptimized(
          '1',
          1,
          '2026-01-18T09:00:00Z',
          '2026-01-18T10:00:00Z',
          undefined,
          '50',
        );

        expect(result.data).toHaveLength(1);
        expect(result.data[0]).toHaveProperty('cycle_time');
        expect(result.data[0]).toHaveProperty('injection_velocity_max');
        expect(result.metadata).not.toHaveProperty('requestedFields');
      });

      it('should throw 400 when from/to parameters are missing', async () => {
        await expect(
          controller.getSPCHistoryOptimized(
            '1',
            1,
            undefined,
            undefined,
            undefined,
            undefined,
          ),
        ).rejects.toThrow(HttpException);
      });

      it('should validate field names', async () => {
        await expect(
          controller.getSPCHistoryOptimized(
            '1',
            1,
            '2026-01-18T09:00:00Z',
            '2026-01-18T10:00:00Z',
            'invalid_field',
            '50',
          ),
        ).rejects.toThrow(HttpException);
      });
    });

    describe('GET /:id/realtime/history-optimized', () => {
      it('should return downsampled realtime data', async () => {
        const mockData = [
          { _time: '2026-01-18T09:00:00Z', oil_temp: 52.3 },
          { _time: '2026-01-18T09:30:00Z', oil_temp: 52.5 },
        ];

        jest.spyOn(
          influxDbService,
          'queryRealtimeDataWithIntelligentDownsampling',
        ).mockResolvedValue(mockData);

        const result = await controller.getRealtimeHistoryOptimized(
          '1',
          1,
          '2026-01-18T09:00:00Z',
          '2026-01-18T10:00:00Z',
          'oil_temp',
          '50',
        );

        expect(result.deviceId).toBe('TestMachine');
        expect(result.data).toHaveLength(2);
        expect(result.metadata.requestedFields).toEqual(['oil_temp']);
        expect(result.metadata.queryTime).toMatch(/\d+ms/);
      });
    });

    describe('GET /:id/spc/metadata', () => {
      it('should return field metadata and capabilities', async () => {
        const result = await controller.getSPCMetadata('1', 1);

        expect(result.deviceId).toBe('TestMachine');
        expect(result.fields).toBeDefined();
        expect(result.fields.length).toBeGreaterThan(0);
        expect(result.capabilities.supportedAggregations).toContain('mean');
        expect(result.capabilities.supportedResolutions).toContain('1m');
      });

      it('should include all required field metadata properties', async () => {
        const result = await controller.getSPCMetadata('1', 1);

        const field = result.fields[0];
        expect(field).toHaveProperty('name');
        expect(field).toHaveProperty('displayName');
        expect(field).toHaveProperty('unit');
        expect(field).toHaveProperty('dataType');
        expect(field).toHaveProperty('min');
        expect(field).toHaveProperty('max');
        expect(field).toHaveProperty('suggestedRange');
      });
    });
  });
});
