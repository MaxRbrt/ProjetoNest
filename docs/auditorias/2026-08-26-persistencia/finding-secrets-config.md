# Security Audit — Secrets Exposure, Config Hardening, Supply Chain

Scope: NestJS + TypeORM + Postgres (Supabase) backend, static review only.
Working dir: C:\Users\Marcos.Santos\Documents\ProjetoNest.js\projeto-test

---

## Finding: No security-headers middleware (helmet) installed

**Severity:** Low
**Confidence:** High
**Verified how:** Read `package.json` — `dependencies` list is `@nestjs/common`, `@nestjs/config`, `@nestjs/core`, `@nestjs/platform-express`, `@nestjs/typeorm`, `class-transformer`, `class-validator`, `dotenv`, `pg`, `reflect-metadata`, `rxjs`, `typeorm`. No `helmet` package present. Also read `src/main.ts` — bootstrap only calls `NestFactory.create`, `app.useGlobalPipes(new ValidationPipe(...))`, and `app.listen(...)`. No `app.use(helmet())` or equivalent.
**Impact:** Responses are missing standard hardening headers (`X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, etc.). For a pure JSON API (no server-rendered HTML, no cookies observed) the practical exploitability is low, but it's a cheap, standard hardening step.
**Fix:** `npm install helmet` and add `app.use(helmet())` in `src/main.ts` before `app.listen(...)`.

---

## Finding: No rate-limiting on API

**Severity:** Low
**Confidence:** High
**Verified how:** Same `package.json` review — no `@nestjs/throttler` or any rate-limiting package in `dependencies` or `devDependencies`. No `ThrottlerModule` in `src/app.module.ts`.
**Impact:** Endpoints (categories/products/orders CRUD) have no request-rate protection, allowing brute-force/enumeration or resource-exhaustion via rapid repeated requests. Low severity here since there's no auth/login endpoint yet (auth is explicitly out of scope per task brief / a known future sub-project).
**Fix:** `npm install @nestjs/throttler` and wire `ThrottlerModule.forRoot(...)` + `ThrottlerGuard` globally once the app moves toward production exposure.

---

## Non-finding: Global exception filter / stack-trace leakage

**Verified how:** No custom `ExceptionFilter` exists anywhere under `src/` (only default Nest bootstrap in `main.ts`). Nest's built-in default filter (`BaseExceptionFilter`) always returns a generic `{"statusCode":500,"message":"Internal server error"}` body for unhandled exceptions regardless of `NODE_ENV` — it logs the stack server-side via the Logger but never serializes it into the HTTP response. This is Nest framework-level behavior, not something this app's code changes.
**Conclusion:** No stack-trace leakage risk from current code. Not flagged as a finding.

---

## Non-finding: Hardcoded secrets in repo

**Verified how:** Ran a recursive grep (excluding `node_modules`, `dist`, `.git`) across the whole repo for patterns: `password\s*=`, `api[_-]?key`, `secret`, `postgresql://`, `-----BEGIN`, `sk-[a-zA-Z0-9]`, `supabase\.co`, `eyJhbGci` (JWT header prefix), case-insensitive.
Matches were only in:
- `.env.example` (line: `DATABASE_URL=postgresql://user:password@host:5432/postgres`) — this is a placeholder, not a real credential (literal string `user:password`, no real host).
- `docs\superpowers\plans\2026-08-25-persistencia-typeorm-supabase.md` — a planning doc; contains only the word "secret"/config discussion, not an actual credential value.
No real API keys, JWT secrets, private keys, or connection strings with real hosts/passwords were found in any tracked-looking file.
**Conclusion:** No hardcoded secrets found. Not flagged as a finding.

---

## Non-finding: `.env` handling

**Verified how:** Confirmed `.env` exists at repo root (107 bytes, not read). Confirmed `.gitignore` contains an explicit `.env` entry (plus `.env.development.local`, `.env.test.local`, `.env.production.local`, `.env.local`) under a "dotenv environment variable files" section — so it is excluded from version control. Did not read `.env` contents per instructions.
**Conclusion:** Properly gitignored. `.env.example` correctly contains only a placeholder value, no duplication of the real value elsewhere. Not flagged.

---

## Non-finding: TypeORM logging / query-value leakage

**Verified how:** Read `src/db/data-source.ts` in full:
```ts
export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [__dirname + '/../modules/**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
};
```
No `logging` key is set at all (TypeORM defaults `logging` to `false`/off when omitted), so SQL queries and bound values are not being printed to console/logs. This is the sole DataSource config, consumed directly by `TypeOrmModule.forRoot(dataSourceOptions)` in `app.module.ts` — no separate prod/dev variant exists.
**Conclusion:** Not flagged.

---

## Non-finding: `synchronize` flag / dev-prod config drift

**Verified how:** Same `data-source.ts` — `synchronize: false` is a hardcoded literal, not derived from `process.env.NODE_ENV` or any conditional. There is exactly one `DataSourceOptions` object in the codebase (grepped for `synchronize` — only this one hit), reused for both the TypeORM CLI (`npm run typeorm`) and the running app (`app.module.ts` imports `dataSourceOptions` directly). No environment-gated logic exists that could flip this to `true` in any environment.
**Conclusion:** Not flagged — this is correctly hardcoded off.

---

## Non-finding: CORS

**Verified how:** Grepped `src/main.ts` and `src/app.module.ts` — no `app.enableCors(...)` call anywhere, and no CORS-related package/middleware installed. Nest's default (no `enableCors` call) is that CORS is simply not enabled — the Express app does not add `Access-Control-Allow-Origin` headers, meaning cross-origin browser requests are blocked by default. This is the secure default and requires no action.
**Conclusion:** Not flagged.

---

## Finding: `npm audit` — 0 known vulnerabilities

**Severity:** N/A (informational)
**Confidence:** High
**Verified how:** Ran `npm audit` in the project root. Full output:
```
found 0 vulnerabilities
```
**Impact:** None currently — npm's advisory database reports no known vulnerabilities in the current dependency tree.
**Fix:** N/A. Re-run periodically as dependencies/advisories change.

---

## Finding: `typeorm` pinned to an unusual version range (`^1.1.0`)

**Severity:** Low
**Confidence:** Medium
**Verified how:** `package.json` declares `"typeorm": "^1.1.0"` in `dependencies`. Checked the actually-installed package: `node_modules/typeorm/package.json` → `"version": "1.1.0"`. Checked `package-lock.json` — the `@nestjs/typeorm` package's peer dependency range for `typeorm` is `"^0.3.0 || ^1.0.0-dev"`, confirming `1.x` is an intentionally-supported (if newer/less battle-tested) major line rather than a typosquat or dependency-confusion package — it resolves within the real `typeorm` npm package, not an unrelated package. `npm audit` (above) found no advisories against it.
**Impact:** Low — this isn't a hardcoded-secret or auth issue, and `npm audit` shows no known CVEs. The main risk is currently unrelated to security: TypeORM's 1.x line is very new relative to the long-dominant 0.3.x line, so this is more of a stability/maturity note than a vulnerability. Flagging only because it's an atypical version choice worth a second look by whoever owns dependency policy.
**Fix:** No immediate action required from a security standpoint. If stability matters more than picking up 1.x features, consider pinning to the well-established `^0.3.x` line instead; otherwise no change needed.

---

## Finding: Migrations reviewed — no seed data or embedded credentials

**Severity:** N/A (informational)
**Confidence:** High
**Verified how:** Read all three files in `src/db/migrations/`:
- `1787679353968-CreateCategories.ts`
- `1787679693383-CreateProducts.ts`
- `1787741065822-CreateOrders.ts`

All three contain only DDL (`CREATE TABLE`, `ALTER TABLE ... ADD CONSTRAINT`, `DROP TABLE`) for `categories`, `products`, `orders`, `order_items`. No `INSERT` statements, no seed data, no hardcoded credentials or secrets of any kind.
**Conclusion:** Not flagged.

---

## Summary

No exploitable secrets-exposure or config-hardening vulnerabilities found. `.env` is properly gitignored, `.env.example` has only a placeholder, `synchronize` is unconditionally `false`, TypeORM logging is off by default, CORS is off by default (secure), and `npm audit` reports 0 vulnerabilities. Two Low-severity hardening gaps worth addressing before production exposure: missing `helmet` and missing rate-limiting (`@nestjs/throttler`). One Low/Medium-confidence informational note on the atypical `typeorm@^1.1.0` version pin (verified as the genuine package, not a supply-chain issue, per `npm audit` and lockfile peer-range cross-check).
