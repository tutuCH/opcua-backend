import { Test, TestingModule } from '@nestjs/testing';
import { SPCLimitsService } from './spc-limits.service';
import { RedisService } from '../redis/redis.service';
import { InfluxDBService } from '../influxdb/influxdb.service';

describe('SPCLimitsService', () => {
  let service: SPCLimitsService;
  let mockRedisService: jest.Mocked<RedisService>;
  let mockInfluxDBService: jest.Mocked<InfluxDBService>;

  const mockInfluxData = [
    { cycle_time: 12.0, _time: '2026-01-18T09:00:00Z' },
    { cycle_time: 12.5, _time: '2026-01-18T09:01:00Z' },
    { cycle_time: 11.8, _time: '2026-01-18T09:02:00Z' },
    { cycle_time: 12.2, _time: '2026-01-18T09:03:00Z' },
    { cycle_time: 12.7, _time: '2026-01-18T09:04:00Z' },
  ];

  beforeEach(async () => {
    mockRedisService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    } as any;

    mockInfluxDBService = {
      querySPCData: jest.fn().mockResolvedValue(mockInfluxData),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SPCLimitsService,
        { provide: RedisService, useValue: mockRedisService },
        { provide: InfluxDBService, useValue: mockInfluxDBService },
      ],
    }).compile();

    service = module.get<SPCLimitsService>(SPCLimitsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getLimits', () => {
    it('should calculate limits from InfluxDB when cache miss', async () => {
      mockRedisService.get.mockResolvedValue(null);

      const result = await service.getLimits('M1', ['cycle_time'], '24h', 3, false);

      expect(result.limits.cycle_time).toBeDefined();
      expect(result.limits.cycle_time.mean).toBeCloseTo(12.24, 1);
      expect(result.limits.cycle_time.stdDev).toBeGreaterThan(0);
      expect(result.limits.cycle_time.ucl).toBeGreaterThan(result.limits.cycle_time.mean);
      expect(result.limits.cycle_time.lcl).toBeLessThan(result.limits.cycle_time.mean);
      expect(result.limits.cycle_time.n).toBe(5);
      expect(result.limits.cycle_time.isCached).toBe(false);
      expect(result.metadata.deviceId).toBe('M1');
      expect(result.metadata.cacheKey).toContain('spc:limits:M1');
    });

    it('should return cached limits when available and fresh', async () => {
      const cachedLimits = {
        cycle_time: {
          mean: 12.5,
          stdDev: 0.5,
          ucl: 14.0,
          lcl: 11.0,
          n: 100,
          calculatedAt: new Date(Date.now() - 1000).toISOString(),
          expiresAt: new Date(Date.now() + 29 * 60 * 1000).toISOString(), // 29 minutes from now
          isCached: true,
        },
      };
      mockRedisService.get.mockResolvedValue(cachedLimits);

      const result = await service.getLimits('M1', ['cycle_time'], '24h', 3, false);

      expect(result.limits.cycle_time.isCached).toBe(true);
      expect(result.limits.cycle_time.mean).toBe(12.5);
      expect(mockInfluxDBService.querySPCData).not.toHaveBeenCalled();
      expect(mockRedisService.set).not.toHaveBeenCalled();
    });

    it('should force recalculate when forceRecalculate=true', async () => {
      const cachedLimits = {
        cycle_time: {
          mean: 12.5,
          stdDev: 0.5,
          ucl: 14.0,
          lcl: 11.0,
          n: 100,
          calculatedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 29 * 60 * 1000).toISOString(),
          isCached: true,
        },
      };
      mockRedisService.get.mockResolvedValue(cachedLimits);

      await service.getLimits('M1', ['cycle_time'], '24h', 3, true);

      expect(mockInfluxDBService.querySPCData).toHaveBeenCalled();
      expect(mockRedisService.set).toHaveBeenCalled();
    });

    it('should throw error when insufficient data', async () => {
      mockInfluxDBService.querySPCData.mockResolvedValue([{ cycle_time: 12.0 }]);

      await expect(
        service.getLimits('M1', ['cycle_time'], '24h', 3, false),
      ).rejects.toThrow('Insufficient data points');
    });

    it('should throw error when no data found', async () => {
      mockInfluxDBService.querySPCData.mockResolvedValue([]);

      await expect(
        service.getLimits('M1', ['cycle_time'], '24h', 3, false),
      ).rejects.toThrow('No data found');
    });

    it('should calculate limits for multiple fields', async () => {
      const multiFieldData = [
        {
          cycle_time: 12.0,
          injection_velocity_max: 85.0,
          _time: '2026-01-18T09:00:00Z',
        },
        {
          cycle_time: 12.5,
          injection_velocity_max: 86.0,
          _time: '2026-01-18T09:01:00Z',
        },
        {
          cycle_time: 11.8,
          injection_velocity_max: 84.0,
          _time: '2026-01-18T09:02:00Z',
        },
      ];
      mockInfluxDBService.querySPCData.mockResolvedValue(multiFieldData);
      mockRedisService.get.mockResolvedValue(null);

      const result = await service.getLimits(
        'M1',
        ['cycle_time', 'injection_velocity_max'],
        '24h',
        3,
        false,
      );

      expect(result.limits.cycle_time).toBeDefined();
      expect(result.limits.injection_velocity_max).toBeDefined();
      expect(result.limits.cycle_time.mean).toBeCloseTo(12.1, 1);
      expect(result.limits.injection_velocity_max.mean).toBeCloseTo(85.0, 0);
    });

    it('should respect different sigma values', async () => {
      mockRedisService.get.mockResolvedValue(null);

      const result2Sigma = await service.getLimits('M1', ['cycle_time'], '24h', 2, false);
      const result3Sigma = await service.getLimits('M1', ['cycle_time'], '24h', 3, false);
      const result4Sigma = await service.getLimits('M1', ['cycle_time'], '24h', 4, false);

      // UCL should increase with higher sigma
      expect(result2Sigma.limits.cycle_time.ucl).toBeLessThan(result3Sigma.limits.cycle_time.ucl);
      expect(result3Sigma.limits.cycle_time.ucl).toBeLessThan(result4Sigma.limits.cycle_time.ucl);

      // LCL should decrease with higher sigma
      expect(result2Sigma.limits.cycle_time.lcl).toBeGreaterThan(result3Sigma.limits.cycle_time.lcl);
      expect(result3Sigma.limits.cycle_time.lcl).toBeGreaterThan(result4Sigma.limits.cycle_time.lcl);
    });
  });

  describe('updateLimitsWithNewPoint', () => {
    it('should incrementally update cached limits', async () => {
      const existingLimits = {
        cycle_time: {
          mean: 12.0,
          stdDev: 0.5,
          ucl: 13.5,
          lcl: 10.5,
          n: 5,
          calculatedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 29 * 60 * 1000).toISOString(),
          isCached: true,
        },
      };
      mockRedisService.get.mockResolvedValue(existingLimits);

      await service.updateLimitsWithNewPoint('M1', 'cycle_time', 12.5, '24h', 3);

      expect(mockRedisService.set).toHaveBeenCalled();
      const savedLimits = mockRedisService.set.mock.calls[0][1] as Record<string, any>;
      expect(savedLimits.cycle_time.n).toBe(6);
      expect(savedLimits.cycle_time.mean).toBeCloseTo(12.08, 1);
    });

    it('should return early if no cached limits exist', async () => {
      mockRedisService.get.mockResolvedValue(null);

      await service.updateLimitsWithNewPoint('M1', 'cycle_time', 12.5, '24h', 3);

      expect(mockRedisService.set).not.toHaveBeenCalled();
    });

    it('should return early if cached limits do not contain the field', async () => {
      const existingLimits = {
        injection_velocity_max: {
          mean: 85.0,
          stdDev: 2.0,
          ucl: 91.0,
          lcl: 79.0,
          n: 5,
          calculatedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 29 * 60 * 1000).toISOString(),
          isCached: true,
        },
      };
      mockRedisService.get.mockResolvedValue(existingLimits);

      await service.updateLimitsWithNewPoint('M1', 'cycle_time', 12.5, '24h', 3);

      expect(mockRedisService.set).not.toHaveBeenCalled();
    });
  });

  describe('invalidateCache', () => {
    it('should delete cache keys for all lookback/sigma combinations', async () => {
      await service.invalidateCache('M1', ['cycle_time']);

      // 4 lookbacks × 3 sigmas = 12 keys
      expect(mockRedisService.del).toHaveBeenCalledTimes(12);
    });

    it('should delete cache keys for multiple fields', async () => {
      await service.invalidateCache('M1', ['cycle_time', 'injection_velocity_max']);

      // 4 lookbacks × 3 sigmas = 12 keys
      expect(mockRedisService.del).toHaveBeenCalledTimes(12);
      // Verify the cache key contains both field names
      const lastCall = mockRedisService.del.mock.calls[11][0] as string;
      expect(lastCall).toContain('cycle_time');
      expect(lastCall).toContain('injection_velocity_max');
    });
  });

  describe('cache behavior', () => {
    it('should use correct cache key format', async () => {
      mockRedisService.get.mockResolvedValue(null);

      await service.getLimits('M1', ['cycle_time'], '24h', 3, false);

      expect(mockRedisService.get).toHaveBeenCalled();
      const cacheKey = mockRedisService.get.mock.calls[0][0];
      expect(cacheKey).toBe('spc:limits:M1:cycle_time:24h:sigma3');
    });

    it('should sort fields in cache key', async () => {
      const multiFieldData = [
        {
          cycle_time: 12.0,
          injection_velocity_max: 85.0,
          _time: '2026-01-18T09:00:00Z',
        },
        {
          cycle_time: 12.5,
          injection_velocity_max: 86.0,
          _time: '2026-01-18T09:01:00Z',
        },
      ];
      mockInfluxDBService.querySPCData.mockResolvedValue(multiFieldData);
      mockRedisService.get.mockResolvedValue(null);

      await service.getLimits('M1', ['injection_velocity_max', 'cycle_time'], '24h', 3, false);

      expect(mockRedisService.get).toHaveBeenCalled();
      const cacheKey = mockRedisService.get.mock.calls[0][0];
      expect(cacheKey).toBe('spc:limits:M1:cycle_time,injection_velocity_max:24h:sigma3');
    });

    it('should save to cache with correct TTL', async () => {
      mockRedisService.get.mockResolvedValue(null);

      await service.getLimits('M1', ['cycle_time'], '24h', 3, false);

      expect(mockRedisService.set).toHaveBeenCalled();
      const cacheKey = mockRedisService.set.mock.calls[0][0];
      const ttl = mockRedisService.set.mock.calls[0][2];
      expect(ttl).toBe(1800); // 30 minutes
    });
  });
});
