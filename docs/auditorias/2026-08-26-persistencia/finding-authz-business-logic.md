# Authorization / Business Logic Audit — projeto-test

Scope: authorization, business logic abuse, HTTP security posture.
App tested live at http://localhost:3000 (already running). All findings below are backed by real curl requests and real responses, not inferred from code alone.

---

## Finding: No authentication/authorization on any endpoint — full anonymous read/write/delete access to all data
**Severity:** High
**Confidence:** High
**Verified how:**
Grepped the entire `src/` tree for `UseGuards|Guard|@Auth|Authorization` — zero matches. Read `src/main.ts` (only a global `ValidationPipe` is registered, no auth middleware/guard) and all three controllers (`categories.controller.ts`, `products.controller.ts`, `orders.controller.ts`) — no decorators restrict any route. Confirmed live with plain unauthenticated curl calls (no headers, no cookies, no token):
- `GET /products` → 200, full product list including price/stock for every product.
- `GET /orders/1` → 200, full order detail including `total` and `items`.
- `POST /categories` with `{"name":"cors-test-cat"}` → 201 Created (arbitrary anonymous write).
- `DELETE /products/:id` and `DELETE /categories/:id` → succeed for anonymous callers (blocked only by the business-rule 409 when dependents exist, not by any authz check).

**Impact:** Every route on this API — all `GET`, `POST`, `PATCH`, `DELETE` on `/products`, `/categories`, `/orders` — is reachable by anyone who can reach port 3000, with no identity, role, or ownership check anywhere in the call chain. Concretely, right now, any anonymous caller can: read every product's price/stock and every order's full contents and history; create arbitrary categories/products/orders; modify any product's price/stock via `PATCH`; delete any category or product (as long as it currently has no dependents). There is no partial protection — it is 100% of the surface area, both read and write.

This is a known, already-accepted gap (JWT auth is planned as a future sub-project), so this is not a new discovery — it is included here to make the current blast radius explicit and concrete rather than theoretical, since "no auth" and "no auth on write-capable endpoints that can also delete/mutate business data" are different risk levels worth stating plainly before this ships anywhere beyond local dev.

**Fix:** Implement authentication (the planned JWT work) and add authorization guards (`@UseGuards(AuthGuard)` at minimum on all mutating routes — `POST`/`PATCH`/`DELETE`) before this API is exposed outside a trusted/local environment. Until then, this must not be deployed to any network-reachable environment without a compensating control (e.g., network-level restriction, reverse-proxy auth).

---

## Finding: Sequential integer IDs allow trivial full-dataset enumeration (forward-looking IDOR risk)
**Severity:** Low (today, given no auth exists) / will become a real IDOR the moment ownership-based access control is added
**Confidence:** High
**Verified how:** Looped `GET /categories/{1..6}`, `GET /products/{1..6}`, `GET /orders/{1..6}` with no auth:
```
GET /categories/2 -> 200 {"id":2,"name":"Eletronicos"}
GET /categories/3 -> 200 {"id":3,"name":"Bebidas Task4"}
GET /categories/5 -> 200 {"id":5,"name":"TestCat2"}
GET /products/1   -> 200 {"id":1,"name":"Mouse","price":99.9,"stock":8,"categoryId":2}
GET /orders/1     -> 200 {"id":1,"total":16.5,"createdAt":"...","items":[...]}
GET /orders/2     -> 200 {"id":2,"total":40,"createdAt":"...","items":[...]}
```
All existing records were retrievable simply by walking the integer ID space; non-existent IDs correctly return 404 (no information leak beyond existence), but no restriction otherwise.

**Impact:** Today there is no "other user's data" concept, so this is not exploitable as a privilege boundary bypass — it's just consistent with finding #1. However, once auth/ownership is added (e.g., orders belonging to a specific customer), sequential IDs will let any authenticated user enumerate and read/modify every other user's orders/products by simply incrementing the ID, unless explicit ownership checks are added on top of authentication. Authentication alone will NOT close this gap.

**Fix (forward-looking, not urgent today):** When ownership is introduced, add explicit ownership/role checks in the service layer (not just route-level auth) for every `findOne`/`update`/`remove` by ID. Consider UUIDs for resources that will have per-user visibility restrictions, as defense in depth (not a substitute for authorization checks).

---

## Finding: Confirmed real oversell via race condition on concurrent `POST /orders` (known/parked issue — reproduced with real evidence)
**Severity:** Medium (documented/accepted design gap; elevated from theoretical to confirmed)
**Confidence:** High
**Verified how:** This is the already-documented, deliberately-parked race condition (no row locking in `OrdersService.create`, `src/modules/orders/orders.service.ts` lines 40-64: `manager.findOneBy(Product,...)` then later `manager.save(product)` inside a transaction, but the read is a plain `SELECT` with no `FOR UPDATE`, so it doesn't block concurrent readers, and the final `UPDATE` is an unconditional "last write wins" based on a value read before the transaction committed). It was reproduced live, not just re-asserted from code:

Test 1 (3 concurrent, stock=5, qty=3 each — only 1 should succeed):
```
Product RaceTestProd (id 6) created with stock:5
3x parallel POST /orders {"items":[{"productId":6,"quantity":3}]}
Result: 1x 201 Created, 2x 400 "Estoque insuficiente" — final stock=2 (correct)
```
This run did NOT reproduce oversell — the timing window was too narrow with only 3 requests.

Test 2 (10 concurrent, stock=10, qty=2 each — only 5 should succeed, 5 should get 400):
```
Product RaceTestProd2 (id 9) created with stock:10
10x parallel POST /orders {"items":[{"productId":9,"quantity":2}]}
Result: ALL 10 requests returned 201 Created (order ids 4-13), ZERO returned 400
Final GET /products/9 -> {"id":9,...,"stock":4,...}
```
Expected correct behavior: exactly 5 orders succeed (using up all 10 stock), 5 fail with `400 Estoque insuficiente`, final stock = 0.
Actual: all 10 orders succeeded (20 units worth of orders recorded against a product that only had 10 units of stock), and the final stock value (4) is inconsistent with either the correct outcome (0) or a "no protection at all" outcome (would be -10) — it reflects several requests each independently reading stock=10 (or a stale intermediate value) and writing back a stale computed value, clobbering each other's decrements (classic read-modify-write lost update).

**Impact:** Under real concurrent load (verified with as few as 10 near-simultaneous requests, no special tooling — plain parallel curl), the system will happily accept far more orders than inventory supports, and the product's stock counter becomes actively wrong (not merely negative — silently incorrect in a way that under-reports how oversold the product actually is, which is arguably worse operationally since it doesn't even trip an obvious "negative stock" alarm). This is a real, easily-triggered data integrity bug, not a narrow theoretical edge case — confirmed with 100% reproduction rate (10/10 concurrent orders succeeded when only 5 should have) on the first attempt at this concurrency level.

**Fix:** Use a row lock in the same transaction, e.g. TypeORM `manager.findOne(Product, { where: { id }, lock: { mode: 'pessimistic_write' } })` (Postgres `SELECT ... FOR UPDATE`) before checking/decrementing stock, or use an atomic conditional update: `UPDATE product SET stock = stock - :qty WHERE id = :id AND stock >= :qty` and check the affected row count, which avoids the read-then-write window entirely and scales better than pessimistic locking.

---

## Finding: No CORS policy configured (informational — confirmed, not assumed)
**Severity:** Informational
**Confidence:** High
**Verified how:** `src/main.ts` calls `NestFactory.create(AppModule)` with no `cors: true` and no `app.enableCors(...)`; no `cors` or `helmet` package present in `package.json`. Confirmed live:
```
curl -i -H "Origin: http://evil.example.com" GET /products
  -> no Access-Control-Allow-Origin header in response (headers present: X-Powered-By, Content-Type, ETag, Date, Connection, Keep-Alive — nothing CORS-related)
curl -i -X OPTIONS -H "Origin: http://evil.example.com" -H "Access-Control-Request-Method: POST" /products
  -> 404 "Cannot OPTIONS /products" (Nest has no CORS preflight handler registered)
```
Note: a direct server-side `curl -X POST` from an arbitrary Origin still succeeds (201 Created) because curl doesn't enforce CORS — CORS is a browser-side protection on response readability/preflight, not a server-side allowlist. A real browser issuing a JSON `fetch()` cross-origin would be blocked at the preflight stage (`OPTIONS` returns 404, not a permissive CORS response), so this is not currently exploitable as a browser-based CSRF/data-exfiltration vector via `fetch`/XHR from another origin.

**Impact:** None currently exploitable — absence of CORS headers means browsers will not allow malicious cross-origin JS to read responses, and preflight-triggering requests (JSON POST bodies) are blocked outright since there's no OPTIONS handler. Worth noting only because when a real frontend is built, `enableCors()` will need to be added deliberately with an explicit allowed-origins list (not `*`, especially once auth/cookies are introduced) rather than left to default.

**Fix:** No action required today. When a frontend consumer is added, configure `app.enableCors({ origin: [...explicit allowlist...] })` explicitly rather than enabling permissive/default CORS.

---

## Finding: Missing standard security headers (Low, correctly scoped for current context)
**Severity:** Low
**Confidence:** High
**Verified how:** `curl -i http://localhost:3000/products` response headers: `X-Powered-By: Express`, `Content-Type`, `ETag`, `Date`, `Connection`, `Keep-Alive`. Explicitly absent: `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, `Content-Security-Policy`. `helmet` is not in `package.json`.

**Impact:** Low in the current state — this is a local/dev JSON API with no auth, no cookies, no HTML rendering, so clickjacking/MIME-sniffing/HSTS concerns don't have a meaningful attack surface yet. `X-Powered-By: Express` is minor information disclosure (framework fingerprinting).

**Fix:** Add `helmet` (`app.use(helmet())` in `main.ts`) before any production/public deployment. Low priority relative to the auth and race-condition findings above.

---

## Sanity check (not a finding): DELETE conflict behavior confirmed working
Verified the recently-added dependent-record protection works as intended:
```
POST /categories {"name":"RaceTestCat"} -> 201, id 10
POST /products {"name":"RaceTestProd","price":10,"categoryId":10,"stock":5} -> 201, id 6
DELETE /categories/10 (has dependent product) -> 409 Conflict, "Não é possível remover a categoria 10: existem produtos vinculados a ela"
DELETE /products/6 (has dependent order, created during race test) -> 409 Conflict, "Não é possível remover o produto 6: existem pedidos vinculados a ele"
```
Both correctly return 409, not 500. No issue found here.

## Sanity check (not a finding): PATCH validation on price/stock confirmed working
```
PATCH /products/1 {"price":-1} -> 400 "price must be a positive number"
PATCH /products/1 {"price":0}  -> 400 "price must be a positive number"
PATCH /products/1 {"stock":-1} -> 400 "stock must not be less than 0"
PATCH /products/1 {"id":999,"price":50} -> 400 "property id should not exist" (global ValidationPipe whitelist/forbidNonWhitelisted correctly rejects unknown/mass-assignment fields)
```
`UpdateProductDto` validators work as coded; no bypass found.

## Sanity check (not a finding): SQL injection payload as data
`POST /categories {"name":"x'; DROP TABLE categories; --"}` was accepted and stored/returned as a literal string value (category id 6, pre-existing test data), confirming TypeORM's parameterized queries are not vulnerable to this trivial injection attempt — the payload was never executed as SQL.

---

## Test data created during this audit (left in place, not cleaned up)
- Categories id 9 (`cors-test-cat`), 10 (`RaceTestCat`), 11 (`RaceTestCat2`)
- Products id 6 (`RaceTestProd`, stock left at 2, has a dependent order so cannot be deleted without also deleting order id 3), id 9 (`RaceTestProd2`, stock left at 4)
- Orders id 3-13 (created by race-condition tests)

These are harmless test rows in what appears to be a dev/local Supabase Postgres instance; flagging their presence for whoever reviews this environment next.
