const queryRowsMock = jest.fn();

jest.mock('@influxdata/influxdb-client', () => {
  const mockWriteApi = {
    useDefaultTags: jest.fn(),
    writePoint: jest.fn(),
  };

  return {
    InfluxDB: jest.fn().mockImplementation(() => ({
      getWriteApi: jest.fn(() => mockWriteApi),
      getQueryApi: jest.fn(() => ({
        queryRows: queryRowsMock,
      })),
    })),
    Point: jest.fn().mockImplementation(() => ({
      tag: jest.fn().mockReturnThis(),
      floatField: jest.fn().mockReturnThis(),
      intField: jest.fn().mockReturnThis(),
      timestamp: jest.fn().mockReturnThis(),
    })),
  };
});

import { InfluxDBService } from './influxdb.service';

describe('InfluxDBService querySPCSeries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryRowsMock.mockImplementation((_query, handlers) => {
      handlers.complete();
    });
  });

  it('uses aggregateWindow for avg downsampling and limits after aggregation', async () => {
    const service = new InfluxDBService();
    await service.onModuleInit();
    let capturedQuery = '';
    queryRowsMock.mockImplementation((query, handlers) => {
      capturedQuery = query;
      handlers.complete();
    });

    await service.querySPCSeries(
      'C02',
      'cycle_time',
      '2026-02-06T17:03:35.111Z',
      '2026-02-07T17:03:35.111Z',
      100,
      'asc',
      'avg',
      864000,
    );

    expect(capturedQuery).toContain(
      'aggregateWindow(every: 864000ms, fn: mean, createEmpty: false)',
    );
    expect(capturedQuery).toContain('|> limit(n: 100)');
    expect(capturedQuery.indexOf('aggregateWindow')).toBeLessThan(
      capturedQuery.indexOf('|> limit(n: 100)'),
    );
  });

  it('keeps raw query path when downsample is none', async () => {
    const service = new InfluxDBService();
    await service.onModuleInit();
    let capturedQuery = '';
    queryRowsMock.mockImplementation((query, handlers) => {
      capturedQuery = query;
      handlers.complete();
    });

    await service.querySPCSeries(
      'C02',
      'cycle_time',
      '2026-02-06T17:03:35.111Z',
      '2026-02-07T17:03:35.111Z',
      100,
      'asc',
      'none',
      864000,
    );

    expect(capturedQuery).not.toContain('aggregateWindow');
    expect(capturedQuery).toContain('|> sort(columns: ["_time"], desc: false)');
    expect(capturedQuery).toContain('|> limit(n: 100)');
  });

  it('queries coverage stats for first/last/count within the window', async () => {
    const service = new InfluxDBService();
    await service.onModuleInit();
    const capturedQueries: string[] = [];
    queryRowsMock.mockImplementation((query, handlers) => {
      capturedQueries.push(query);
      if (query.includes('|> count(column: "_value")')) {
        handlers.next([], {
          toObject: () => ({ _value: 42 }),
        });
      } else if (query.includes('|> first(column: "_time")')) {
        handlers.next([], {
          toObject: () => ({ _time: '2026-02-07T17:03:12.746Z' }),
        });
      } else if (query.includes('|> last(column: "_time")')) {
        handlers.next([], {
          toObject: () => ({ _time: '2026-02-07T17:40:06.603Z' }),
        });
      }
      handlers.complete();
    });

    const result = await service.querySPCSeriesCoverageStats(
      'C02',
      'cycle_time',
      '2026-02-06T17:03:35.111Z',
      '2026-02-07T17:03:35.111Z',
    );

    expect(capturedQueries.some((q) => q.includes('|> count(column: "_value")'))).toBe(true);
    expect(capturedQueries.some((q) => q.includes('|> first(column: "_time")'))).toBe(true);
    expect(capturedQueries.some((q) => q.includes('|> last(column: "_time")'))).toBe(true);
    expect(result.count).toBe(42);
    expect(result.firstTs).toBe('2026-02-07T17:03:12.746Z');
    expect(result.lastTs).toBe('2026-02-07T17:40:06.603Z');
  });
});
