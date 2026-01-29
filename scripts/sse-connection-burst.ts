import { setTimeout as delay } from 'timers/promises'

type Args = {
  baseUrl: string
  deviceId: string
  count: number
  durationMs: number
  email: string
  password: string
  token?: string
}

function parseArgs(): Args {
  const args = process.argv.slice(2)
  const getArg = (name: string, fallback?: string) => {
    const index = args.findIndex((arg) => arg === `--${name}`)
    if (index === -1) return fallback
    return args[index + 1] ?? fallback
  }

  return {
    baseUrl: getArg('baseUrl', 'http://localhost:3000') as string,
    deviceId: getArg('deviceId', 'C02') as string,
    count: Number(getArg('count', '3')),
    durationMs: Number(getArg('durationMs', '10000')),
    email: getArg('email', 'tuchenhsien@gmail.com') as string,
    password: getArg('password', 'abc123') as string,
    token: getArg('token'),
  }
}

async function loginForToken(baseUrl: string, email: string, password: string) {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Login failed (${response.status}): ${body}`)
  }

  const payload = await response.json()
  if (!payload?.access_token) {
    throw new Error('Login response missing access_token')
  }
  return payload.access_token as string
}

async function requestStreamTicket(baseUrl: string, token: string) {
  const response = await fetch(`${baseUrl}/sse/stream-ticket`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ ttlSeconds: 300, purpose: 'data' }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Ticket request failed (${response.status}): ${body}`)
  }

  const payload = await response.json()
  if (!payload?.ticket) {
    throw new Error('Ticket response missing ticket')
  }
  return payload.ticket as string
}

async function fetchStatus(baseUrl: string, token: string) {
  const response = await fetch(`${baseUrl}/sse/status`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Status request failed (${response.status}): ${body}`)
  }

  return response.json()
}

async function main() {
  const args = parseArgs()
  const token = args.token ?? await loginForToken(args.baseUrl, args.email, args.password)
  const ticket = await requestStreamTicket(args.baseUrl, token)
  const url = `${args.baseUrl}/sse/stream?deviceId=${encodeURIComponent(args.deviceId)}&ticket=${encodeURIComponent(ticket)}`

  console.log(`Opening ${args.count} SSE connections to ${url}`)

  const controllers: AbortController[] = []
  for (let i = 0; i < args.count; i += 1) {
    const controller = new AbortController()
    controllers.push(controller)

    fetch(url, {
      method: 'GET',
      headers: { Accept: 'text/event-stream' },
      signal: controller.signal,
    }).catch((error) => {
      console.error(`Connection ${i + 1} error:`, error.message)
    })
  }

  await delay(1000)
  const statusAfterConnect = await fetchStatus(args.baseUrl, token)
  console.log('Status after connect:', JSON.stringify(statusAfterConnect, null, 2))

  await delay(args.durationMs)
  controllers.forEach((controller) => controller.abort())

  await delay(1000)
  const statusAfterClose = await fetchStatus(args.baseUrl, token)
  console.log('Status after close:', JSON.stringify(statusAfterClose, null, 2))
}

main().catch((error) => {
  console.error('SSE burst script failed:', error)
  process.exit(1)
})
