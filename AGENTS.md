# Repository Guidelines

## Project Structure & Module Organization
- Backend uses NestJS + TypeScript.
- Source lives in `src/` (e.g., `auth/`, `mqtt-processor/`, `websocket/`, `influxdb/`, `redis/`, `subscription/`, `machines/`).
- App entry points: `src/main.ts`, root module `src/app.module.ts`.
- Tests: unit in `src/**/*.spec.ts`; e2e in `test/*.e2e-spec.ts`.
- Build output goes to `dist/`. Docs in `docs/`. Demo stack in `demoMqttServer/` (Docker Compose MQTT/infra).

## Build, Test, and Development Commands
- `npm run start:dev` — start Nest in watch mode.
- `npm run build` — compile to `dist/` via `nest build`.
- `npm run start:prod` — run compiled app (`node dist/main`).
- `npm run test` / `test:watch` — run Jest unit tests.
- `npm run test:e2e` — run e2e tests in `test/`.
- `npm run test:cov` — generate coverage in `coverage/`.
- `npm run lint` — ESLint check with `--fix`.
- `npm run format` — Prettier write for `src/` and `test/`.
- Demo helpers: `npm run demo:dev`, `demo:start`, `demo:stop` (see `demoMqttServer/`).

## Coding Style & Naming Conventions
- TypeScript, ES2020; 2-space indent (Prettier).
- Use Nest patterns: `*.module.ts`, `*.service.ts`, `*.controller.ts`.
- Files/directories: kebab-case; Classes/Enums: PascalCase; variables/functions: camelCase; constants: UPPER_SNAKE_CASE.
- Prefer DTOs and `class-validator` for inputs; avoid `any`.
- Run `npm run lint && npm run format` before pushing.

## Testing Guidelines
- Framework: Jest (`ts-jest`).
- Unit test files: `*.spec.ts` colocated with code in `src/`.
- E2E tests: `*.e2e-spec.ts` in `test/` (see `test/jest-e2e.json`).
- Aim for meaningful coverage; check with `npm run test:cov`.
- Keep tests deterministic; mock external services (MQTT, DB, Redis).

## Commit & Pull Request Guidelines
- Commits: present-tense imperative (“add mqtt ingestion”, “fix auth guard”).
- Group related changes; keep messages concise; reference issues (`#123`).
- PRs must include: summary (what/why), implementation notes, test plan/steps, screenshots or logs if applicable, and updated docs/config notes.
- Ensure CI basics pass locally: `npm run lint`, `npm test`, `npm run build`.

## Security & Configuration Tips
- Configuration via `@nestjs/config` loads from `.env.local`, `.env`, and `.env.{NODE_ENV}` (see `src/config/`).
- Do not commit secrets. Provide placeholders in examples and document required keys (e.g., `POSTGRES_*`, `INFLUXDB_*`, `REDIS_*`, `MQTT_*`, `JWT_SECRET`, `COGNITO_*`, `AWS_*`, `STRIPE_*`).
- For local demo, use `npm run demo:dev` to start dockerized deps, then `npm run start:dev`.
