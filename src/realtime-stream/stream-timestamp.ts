export type StreamTimestampSelection = {
  source: string
  raw: unknown
  epochMs: number | null
}

const SPACE_TIME_REGEX = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/
const TIMEZONE_REGEX = /([zZ]|[+-]\d{2}:?\d{2})$/

export function normalizeEpochMs(value: unknown): number | null {
  if (value === null || value === undefined) return null

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null
    return value < 1e12 ? value * 1000 : value
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null

    const numeric = Number(trimmed)
    if (!Number.isNaN(numeric) && trimmed !== '') {
      return numeric < 1e12 ? numeric * 1000 : numeric
    }

    const normalized = SPACE_TIME_REGEX.test(trimmed)
      ? trimmed.replace(' ', 'T')
      : trimmed

    const hasTimezone = TIMEZONE_REGEX.test(normalized)
    const withZone = !hasTimezone && normalized.includes('T')
      ? `${normalized}Z`
      : normalized

    const parsed = Date.parse(withZone)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

export function selectStreamTimestamp(data: Record<string, unknown> | null | undefined): StreamTimestampSelection {
  const candidates: Array<{ source: string; value: unknown }> = [
    { source: 'timestamp', value: data?.timestamp },
    { source: 'sendStamp', value: data?.sendStamp },
    { source: 'time', value: data?.time },
    { source: 'sendTime', value: data?.sendTime },
  ]

  for (const candidate of candidates) {
    const epochMs = normalizeEpochMs(candidate.value)
    if (epochMs !== null) {
      return {
        source: candidate.source,
        raw: candidate.value,
        epochMs,
      }
    }
  }

  return { source: 'none', raw: undefined, epochMs: null }
}
