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

**Demo Helpers:**

- `npm run demo:dev` — Start demo Docker Compose stack
- `npm run demo:start` — Start demo services
- `npm run demo:stop` — Stop demo services
- `npm run demo:logs` — View demo Docker Compose logs

## Code Style and Conventions

**File Structure:**

- NestJS + TypeScript, source in `src/`
- Modules follow pattern: `auth/`, `machines/`, `subscription/`, `influxdb/`, `redis/`, `websocket/`
- App entry: `src/main.ts`, root module: `src/app.module.ts`

**Naming Conventions:**

- Files/directories: kebab-case (e.g., `spc-limits.service.ts`, `auth.controller.ts`)
- Classes/Enums: PascalCase (e.g., `JwtAuthGuard`, `CreateMachineDto`)
- Variables/functions: camelCase (e.g., `userId`, `findFactoriesAndMachines`)
- Constants: UPPER_SNAKE_CASE (e.g., `ALLOWED_SPC_FIELDS`, `DEFAULT_LOOKBACK`)

**Imports and Formatting:**

- Imports grouped: third-party → internal → relative
- Use absolute imports: `@nestjs/common`, `@nestjs/typeorm`, not relative paths
- Formatting: Prettier (2-space indent), single quotes for strings
- No unused imports—ESLint will flag

**TypeScript and Types:**

- Strict TypeScript, `target: ES2020` in `tsconfig.json`
- Avoid `any`; use DTOs with `class-validator` for request/response shapes
- Use Prisma-generated types where applicable
- Service methods use DTOs; controllers use DTOs

**Validation:**

- All API input uses DTOs with `class-validator` decorators
- Custom validators in `src/auth/validators/` for password/email rules
- Validation errors throw `BadRequestException` or `HttpException`

**Error Handling:**

- Use `HttpException` with proper status codes (400, 401, 403, 404, 500)
- Services throw exceptions; controllers catch and re-throw or let Nest global filter handle
- No logging sensitive data (passwords, tokens)
- Use Nest Logger: `this.logger = new Logger(ClassName.name)`

**Configuration:**

- Environment via `@nestjs/config` only; never `process.env` in source
- Config keys in `.env`, `.env.local`, `.env.{NODE_ENV}`
- Public keys: `NODE_ENV`, `PORT`, `CORS_ORIGIN` (via `@IsPublic()`)

**Patterns to Avoid:**

- Business logic in controllers or routes—delegate to services
- Direct database access from controllers—use service layer
- Circular dependencies—inject via constructor
- Committing secrets to git

**Testing:**

- Unit tests colocated: `*.spec.ts` next to implementation files
- E2E tests in `test/*.e2e-spec.ts`
- Mock external dependencies (MQTT, InfluxDB, Redis, Stripe)
- Test error paths and validations
- Aim for meaningful coverage; check with `npm run test:cov`

**Security:**

- Use `@UseGuards(JwtAuthGuard)` for protected routes
- Use `@Public()` for public routes
- Validate user ownership on resources (factories, machines)
- Never expose `password` in responses (user endpoints are admin-only)
- JWT includes `sub` (userId), `email`, `role` (accessLevel)

**API Design:**

- Controllers use `@Controller('prefix')` and decorators (`@Get`, `@Post`, `@Patch`, `@Delete`)
- Services contain business logic; controllers orchestrate auth/validation
- Pagination enforced: `limit` (max 1000) and `offset`
- Field whitelists for sensitive endpoints (SPC fields via `ALLOWED_SPC_FIELDS`)
- Consistent response shapes: `{ data, pagination, metadata }` for paginated endpoints

**Commit and PR Guidelines:**

- Commits: present-tense imperative (e.g., "add SPC v2 endpoints", "fix InfluxDB reduce accumulator param")
- Group related changes; concise messages
- Run `npm run lint` and `npm run test` before pushing
- Include issue references (e.g., "fixes #123")

**Linting:**

- ESLint config: `.eslintrc.js`
- Prettier config: `.prettierrc`
- Fix all lint errors before committing

**WebSocket (Socket.IO):**

- Gateway at `src/websocket/websocket.gateway.ts`
- Events: `subscribe-machine`, `unsubscribe-machine`, `realtime-update`, `spc-update`, `machine-alert`
- No auth required (configure via CORS in production)

## Important Note
- don't call signup api for auth token, it sends an actual email.
- testing account
  - email: tuchenhsien@gmail.com
  - password: abc123
