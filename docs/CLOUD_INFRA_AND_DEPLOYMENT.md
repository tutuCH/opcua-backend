# Cloud Infrastructure & Deployment Playbook

Scope: serve the frontend at `dashboard.harrytu.cv` via Vercel and the backend at `api-dashboard.harrytu.cv` via AWS (EC2 + Docker Compose/CDK), using Cloudflare for DNS.

## What Exists in the Repo

- One-off EC2 bootstrap (`scripts/setup.sh` + `scripts/deploy.sh`) and Docker-only variant (`scripts/deploy-compose.sh`).
- Demo all-in-one EC2 deploy with generated secrets (`scripts/deploy-demo.sh`) and teardown.
- CDK-based stack with Elastic IP and Docker Compose (`infrastructure/deploy.sh`, `infrastructure/lib/*`), plus instance management helpers (`infrastructure/scripts/manage-instance.sh`, `backup-data.sh`, `restore-data.sh`).
- General deployment docs: `DEPLOYMENT.md`, `infrastructure/README.md`, `infrastructure/PHASED_DEPLOYMENT.md`.

## Target Architecture

- **DNS (Cloudflare)**: zone `harrytu.cv`, CNAME `dashboard` → Vercel, A/CNAME `api-dashboard` → AWS entrypoint.
- **Frontend**: Vercel project (connected repo), auto-builds on git pushes. Deployed at `dashboard.harrytu.cv`.
- **Backend**: AWS EC2 (t3.small/medium) running Docker Compose (NestJS + Postgres + Redis + InfluxDB + Mosquitto), Elastic IP for static addressing, reachable at `api-dashboard.harrytu.cv`.
- **TLS**: Cloudflare proxy/SSL for both subdomains (orange-cloud) or direct A/AAAA + ACM/Certbot if you prefer end-to-end.

## Deployment Pipeline (recommended)

- **Frontend**: Git push → Vercel build → preview → promote/alias to `dashboard.harrytu.cv`.
- **Backend**: Trigger `infrastructure/deploy.sh` (CDK) or `scripts/deploy-demo.sh` (single-script) from CI/manual → EC2 boots, pulls repo, runs Docker Compose → health check `/health`. Use `infrastructure/scripts/manage-instance.sh` for start/stop/logs.
- **Config**: Set `FRONTEND_URL=https://dashboard.harrytu.cv` and CORS origins to include both subdomains; use `.env.compose`/`.env.local`.

## DNS & Routing Plan

- `dashboard.harrytu.cv` → CNAME to Vercel provided target (e.g., `cname.vercel-dns.com`). Keep proxied (✅) for HTTPS/WWW redirect.
- `api-dashboard.harrytu.cv`:
  - If EC2 with Elastic IP: A record to the Elastic IP. Optionally proxied to offload TLS at Cloudflare; otherwise leave DNS-only and terminate TLS on EC2/ALB.
  - If you add an ALB later: CNAME to the ALB DNS name instead of A record.

## Setup Steps (CLI-first, console-second)

### 1) Frontend on Vercel (`dashboard.harrytu.cv`)

**CLI path**

1. Install/login: `npm i -g vercel` → `vercel login`.
2. From the frontend repo: `vercel link` (select team/project) → `vercel env pull .env.local` (if needed).
3. Deploy: `vercel` (preview) → `vercel --prod`.
4. Add custom domain: `vercel domains add dashboard.harrytu.cv`.
5. Get the Vercel DNS target: `vercel domains inspect dashboard.harrytu.cv` (note the `cname.vercel-dns.com` target).
6. Cloudflare CLI/API or manual DNS: create CNAME `dashboard` → that target, proxied = on. Wait for propagation, then `vercel alias ls` to confirm green.

**Console path**

1. Vercel UI: Import project from git, set build settings, add env vars, deploy.
2. Vercel → Settings → Domains → Add `dashboard.harrytu.cv`; copy the required CNAME value.
3. Cloudflare DNS: Add CNAME `dashboard` → the Vercel target, proxy on. Verify with `nslookup dashboard.harrytu.cv`.

### 2) Backend on AWS (`api-dashboard.harrytu.cv`)

**CLI path (CDK, static IP)**

1. Prereqs: `aws` CLI, `cdk`, `jq`; `aws configure`.
2. From `infrastructure/`: `npm install` → `./deploy.sh` (or `DEPLOY_ENV=testing ./deploy.sh` for the phased plan).
3. Capture outputs (`outputs.json` or `backend.env`) — note Elastic IP.
4. Set Cloudflare DNS: A record `api-dashboard` → Elastic IP (proxy on for TLS, or off if you terminate TLS on EC2).
5. Update backend env: set `FRONTEND_URL=https://dashboard.harrytu.cv`, `APP_ENV=production`, etc. For Compose deployments, edit `.env.compose` before redeploy.
6. Verify: `curl https://api-dashboard.harrytu.cv/health` (if proxied) or `http://...` if DNS-only; check websockets reach via `wss://api-dashboard.harrytu.cv/socket.io/` when proxied.

**CLI path (one-shot demo)**

1. `./scripts/deploy-demo.sh us-east-1 t3.small` (generates secrets + env).
2. Note the printed public IP; create Cloudflare A `api-dashboard` → IP (proxy optional).

**Console path**

1. CloudFormation/CDK: Run `./deploy.sh` once; then in AWS Console check the EC2 instance and Elastic IP association.
2. Copy the Elastic IP from EC2 console.
3. Cloudflare DNS: create A record `api-dashboard` → Elastic IP (proxy on).
4. (Optional) If using ALB: create target group + listener (80/443), attach instance, then set Cloudflare CNAME `api-dashboard` → ALB DNS, proxy on.

**Post-deploy checks**

- Health: `curl -I https://api-dashboard.harrytu.cv/health`.
- CORS/WS: ensure `app.enableCors` includes `https://dashboard.harrytu.cv`.
- JWT/auth: rotate `JWT_SECRET` in `.env.compose` if reusing demo secrets.

## Operational Notes

- Use `infrastructure/scripts/manage-instance.sh` to start/stop/restart or fetch IP/logs.
- Backups: `infrastructure/scripts/backup-data.sh` and `restore-data.sh` exist; upload to S3 if needed.
- Security: tighten SG rules to your IP for SSH; consider ACM/Certbot if running DNS-only without Cloudflare proxy.
- Cost controls: stop non-prod instances; avoid idle Elastic IPs unattached to instances.

## Next Steps Checklist

- [ ] Confirm Vercel project builds and domain added (`dashboard.harrytu.cv`).
- [ ] Run `./infrastructure/deploy.sh`, capture Elastic IP, and wire `api-dashboard.harrytu.cv`.
- [ ] Update `.env.compose`/CORS with the new domains and redeploy backend.
- [ ] Validate HTTPS + WebSocket paths from the frontend against the new subdomains.
