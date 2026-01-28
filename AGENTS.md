# Repository Guidelines

## Build, Test, and Lint Commands

**Core Commands:**

- `npm run start:dev` — Start Nest in watch mode (auto-reload on changes)
- `npm run build` — Compile to `dist/` via `nest build`
- `npm run start:prod` — Run compiled app: `node dist/main`
- `npm run test` — Run Jest unit tests (all)
- `npm run test:watch` — Run unit tests in watch mode
- `npm run test:e2e` — Run e2e tests in `test/`
- `npm run test:cov` — Run tests and generate coverage in `coverage/`
- `npm run lint` — Run ESLint check
- `npm run format` — Run Prettier write for `src/` and `test/`

**Single Test Execution:**

- Run a specific test file: `npm run test -- src/machines/machines.service.spec.ts`
- Run tests matching pattern: `npm run test -- -- -t "machine.*limits"`
- Run e2e test matching pattern: `npm run test:e2e -- test/**/*auth*.e2e-spec.ts`

## Security & Configuration Tips
- Configuration via `@nestjs/config` loads from `.env.local`, `.env`, and `.env.{NODE_ENV}` (see `src/config/`).
- Do not commit secrets. Provide placeholders in examples and document required keys (e.g., `POSTGRES_*`, `INFLUXDB_*`, `REDIS_*`, `MQTT_*`, `JWT_SECRET`, `COGNITO_*`, `AWS_*`, `STRIPE_*`).
- For local demo, use `npm run demo:dev` to start dockerized deps, then `npm run start:dev`.

## Planning Mode
Use $plan prefix for read-only planning. Output structured plan ONLY:
## Overview
## Files Affected
## Steps
## Risks

Example: $plan Add JWT auth → Generate plan.md excerpt.

After planning, confirm "PLAN APPROVED" before exec.

## Workflow
1. If task has $plan: Plan only.
2. Else: Plan → Confirm → Execute.
