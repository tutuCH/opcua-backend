import { normalizeEpochMs, selectStreamTimestamp } from './stream-timestamp'

describe('stream timestamp helpers', () => {
  it('normalizes numeric milliseconds', () => {
    expect(normalizeEpochMs(1769718546425)).toBe(1769718546425)
  })

  it('normalizes numeric seconds to milliseconds', () => {
    expect(normalizeEpochMs(1769718546)).toBe(1769718546000)
  })

  it('parses ISO timestamps with Z', () => {
    expect(normalizeEpochMs('2026-01-29T20:15:33.166Z')).toBe(
      Date.parse('2026-01-29T20:15:33.166Z')
    )
  })

  it('parses space-separated timestamps as UTC', () => {
    expect(normalizeEpochMs('2026-01-29 20:29:06')).toBe(
      Date.parse('2026-01-29T20:29:06Z')
    )
  })

  it('selects timestamp in priority order', () => {
    const data = {
      timestamp: 1769718546425,
      sendStamp: 1769718548425,
      time: '2026-01-29 20:29:06',
    }

    const result = selectStreamTimestamp(data)

    expect(result.source).toBe('timestamp')
    expect(result.epochMs).toBe(1769718546425)
  })
})
