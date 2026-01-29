import { RealtimeStreamService } from './realtime-stream.service'

describe('RealtimeStreamService connection counters', () => {
  it('tracks active connections by device and user', () => {
    const redisService = { subscribe: jest.fn() } as any
    const service = new RealtimeStreamService(redisService)

    service.registerConnection('c1', '127.0.0.1', 1, 'data', ['C02', 'C03'])
    expect(service.getActiveConnectionsByDeviceId()).toEqual({ C02: 1, C03: 1 })
    expect(service.getActiveConnectionsByUserDevice(1)).toEqual({ C02: 1, C03: 1 })

    service.registerConnection('c2', '127.0.0.1', 1, 'data', ['C02'])
    expect(service.getActiveConnectionsByDeviceId()).toEqual({ C02: 2, C03: 1 })
    expect(service.getActiveConnectionsByUserDevice(1)).toEqual({ C02: 2, C03: 1 })

    service.unregisterConnection('c1')
    expect(service.getActiveConnectionsByDeviceId()).toEqual({ C02: 1 })
    expect(service.getActiveConnectionsByUserDevice(1)).toEqual({ C02: 1 })
  })
})
