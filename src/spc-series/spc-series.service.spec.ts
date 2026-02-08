import { SPCSeriesService } from './spc-series.service';

const influxDbService = {
  querySPCSeriesCoverageStats: jest.fn(),
  querySPCSeries: jest.fn(),
};

describe('SPCSeriesService', () => {
  const originalMaxPoints = process.env.SPC_SERIES_MAX_POINTS;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SPC_SERIES_MAX_POINTS = originalMaxPoints;
  });

  afterAll(() => {
    process.env.SPC_SERIES_MAX_POINTS = originalMaxPoints;
  });

  it('returns UTC window bounds and series timestamps', async () => {
    influxDbService.querySPCSeriesCoverageStats.mockResolvedValue({
      count: 1,
      firstTs: '2026-01-29T20:15:33.166Z',
      lastTs: '2026-01-29T20:15:33.166Z',
    });
    influxDbService.querySPCSeries.mockResolvedValue([
      { _time: '2026-01-29T20:15:33.166Z', _value: 42 },
    ]);

    const service = new SPCSeriesService(influxDbService as any);
    const result = await service.getSeries(
      'C02',
      1,
      'cycle_time' as any,
      'last_1h',
      undefined,
      undefined,
      100,
      'asc',
      false,
      false,
      'none',
    );

    expect(result.window.start.endsWith('Z')).toBe(true);
    expect(result.window.end.endsWith('Z')).toBe(true);
    expect(result.series[0].ts.endsWith('Z')).toBe(true);
  });

  it('passes downsample and interval to influx query for last_24h', async () => {
    influxDbService.querySPCSeriesCoverageStats.mockResolvedValue({
      count: 300,
      firstTs: '2026-02-07T12:00:00.000Z',
      lastTs: '2026-02-07T17:00:00.000Z',
    });
    influxDbService.querySPCSeries.mockResolvedValue([
      { _time: '2026-02-07T15:00:00.000Z', _value: 41 },
      { _time: '2026-02-07T16:00:00.000Z', _value: 42 },
    ]);

    const service = new SPCSeriesService(influxDbService as any);
    await service.getSeries(
      'C02',
      1,
      'cycle_time' as any,
      'last_24h',
      undefined,
      undefined,
      100,
      'asc',
      false,
      false,
      'avg',
    );

    expect(influxDbService.querySPCSeries).toHaveBeenCalledTimes(1);
    const args = influxDbService.querySPCSeries.mock.calls[0];
    expect(args[0]).toBe('C02');
    expect(args[1]).toBe('cycle_time');
    expect(args[4]).toBe(100);
    expect(args[5]).toBe('asc');
    expect(args[6]).toBe('avg');
    const expectedInterval = Math.ceil(
      (Date.parse('2026-02-07T17:00:00.000Z') - Date.parse('2026-02-07T12:00:00.000Z')) /
        99,
    );
    expect(args[7]).toBe(expectedInterval);
  });

  it('returns deterministic ascending order and coverage metadata', async () => {
    influxDbService.querySPCSeriesCoverageStats.mockResolvedValue({
      count: 3,
      firstTs: '2026-02-07T16:00:00.000Z',
      lastTs: '2026-02-07T17:00:00.000Z',
    });
    influxDbService.querySPCSeries.mockResolvedValue([
      { _time: '2026-02-07T16:50:00.000Z', _value: 42 },
      { _time: '2026-02-07T16:00:00.000Z', _value: 41 },
      { _time: '2026-02-07T17:00:00.000Z', _value: 43 },
    ]);

    const service = new SPCSeriesService(influxDbService as any);
    const result = await service.getSeries(
      'C02',
      1,
      'cycle_time' as any,
      'last_24h',
      undefined,
      undefined,
      100,
      'asc',
      false,
      false,
      'avg',
    );

    expect(result.series.map((point) => point.ts)).toEqual([
      '2026-02-07T16:00:00.000Z',
      '2026-02-07T16:50:00.000Z',
      '2026-02-07T17:00:00.000Z',
    ]);

    expect(result.coverage.firstTs).toBe('2026-02-07T16:00:00.000Z');
    expect(result.coverage.lastTs).toBe('2026-02-07T17:00:00.000Z');
    expect(result.coverage.requestedSpanMs).toBe(24 * 60 * 60 * 1000);
    expect(result.coverage.tailGapMs).toBeGreaterThanOrEqual(0);
    expect(result.coverage.coverageRatio).toBeGreaterThan(0);
    expect(result.coverage.coverageRatio).toBeLessThan(1);
    expect(result.coverage.isPartial).toBe(true);
  });

  it('falls back to raw query when observed points are already within limit', async () => {
    influxDbService.querySPCSeriesCoverageStats.mockResolvedValue({
      count: 42,
      firstTs: '2026-02-07T17:03:12.746Z',
      lastTs: '2026-02-07T17:40:06.603Z',
    });
    influxDbService.querySPCSeries.mockResolvedValue([
      { _time: '2026-02-07T17:03:12.746Z', _value: 10.1 },
      { _time: '2026-02-07T17:20:12.746Z', _value: 10.2 },
      { _time: '2026-02-07T17:40:06.603Z', _value: 10.3 },
    ]);

    const service = new SPCSeriesService(influxDbService as any);
    const result = await service.getSeries(
      'C02',
      1,
      'injection_time' as any,
      'last_24h',
      undefined,
      undefined,
      100,
      'asc',
      false,
      false,
      'avg',
    );

    expect(influxDbService.querySPCSeries).toHaveBeenCalledTimes(1);
    const args = influxDbService.querySPCSeries.mock.calls[0];
    expect(args[6]).toBe('none');
    expect(args[7]).toBeUndefined();
    expect(result.sampling.downsample).toBe('none');
    expect(result.sampling.returned).toBe(3);
  });

  it('clamps requested limit to configured SPC_SERIES_MAX_POINTS', async () => {
    process.env.SPC_SERIES_MAX_POINTS = '240';
    influxDbService.querySPCSeriesCoverageStats.mockResolvedValue({
      count: 250,
      firstTs: '2026-02-07T10:00:00.000Z',
      lastTs: '2026-02-07T17:00:00.000Z',
    });
    influxDbService.querySPCSeries.mockResolvedValue([
      { _time: '2026-02-07T10:00:00.000Z', _value: 50 },
      { _time: '2026-02-07T17:00:00.000Z', _value: 51 },
    ]);

    const service = new SPCSeriesService(influxDbService as any);
    await service.getSeries(
      'C02',
      1,
      'cycle_time' as any,
      'last_24h',
      undefined,
      undefined,
      999,
      'asc',
      false,
      false,
      'avg',
    );

    expect(influxDbService.querySPCSeries).toHaveBeenCalledTimes(1);
    expect(influxDbService.querySPCSeries.mock.calls[0][4]).toBe(240);
  });
});
