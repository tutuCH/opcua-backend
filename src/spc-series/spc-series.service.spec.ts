import { SPCSeriesService } from './spc-series.service'

const influxDbService = {
  querySPCSeries: jest.fn(),
}

describe('SPCSeriesService', () => {
  it('returns UTC window bounds and series timestamps', async () => {
    influxDbService.querySPCSeries.mockResolvedValue([
      { _time: '2026-01-29T20:15:33.166Z', _value: 42 },
    ])

    const service = new SPCSeriesService(influxDbService as any)
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
      'none'
    )

    expect(result.window.start.endsWith('Z')).toBe(true)
    expect(result.window.end.endsWith('Z')).toBe(true)
    expect(result.series[0].ts.endsWith('Z')).toBe(true)
  })
})
