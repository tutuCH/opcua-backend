# Frontend Production Integration

## Production URLs

- **Frontend**: `https://dashboard.harrytu.cv`
- **Backend API base**: `https://api-dashboard.harrytu.cv`
- **Health check**: `https://api-dashboard.harrytu.cv/health`
- **WebSocket (Socket.IO)**: `wss://api-dashboard.harrytu.cv/socket.io/`

## Frontend Environment Variables

Use your frontend framework’s public env convention. The key names below are examples; align them with the frontend repo:

- `NEXT_PUBLIC_API_BASE_URL=https://api-dashboard.harrytu.cv`
- `NEXT_PUBLIC_WS_URL=wss://api-dashboard.harrytu.cv/socket.io/`

If the frontend uses Vite or another bundler, map to its public prefix (e.g., `VITE_API_BASE_URL`).

## Backend Configuration Required for Frontend

Ensure backend env/config allows the production frontend origin:

- `FRONTEND_URL=https://dashboard.harrytu.cv`
- CORS should allow `https://dashboard.harrytu.cv`

## Authentication Notes

- Auth tokens (JWTs) are issued by the backend. The frontend should store tokens securely (HTTP-only cookies recommended if supported).
- Backend secrets such as `JWT_SECRET`, database credentials, and Cloudflare origin private keys **must never** be included in the frontend.

## Cloudflare + TLS

- Cloudflare proxy is enabled for `api-dashboard.harrytu.cv` (orange cloud).
- SSL/TLS mode should be **Full (strict)** in Cloudflare.
- Origin cert is installed on the server under `/etc/nginx/ssl/`.

## Keys You Should Be Aware Of

- **Public** frontend-usable keys only (if applicable): e.g. Stripe publishable key or other public client IDs.
- **Private** server-only keys: `JWT_SECRET`, `POSTGRES_*`, `INFLUXDB_*`, `REDIS_*`, `MQTT_*`, Cloudflare origin private key.

## Verification Checklist

- `curl https://api-dashboard.harrytu.cv/health` returns `200`.
- Frontend loads data from `https://api-dashboard.harrytu.cv`.
- WebSocket connects to `wss://api-dashboard.harrytu.cv/socket.io/`.
