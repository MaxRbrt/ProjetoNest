# Injection, Validation Bypass & Error-Message Leakage — Audit Findings

Target: http://localhost:3000 (NestJS + TypeORM + Postgres/Supabase)
Global pipe: `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`
No custom global exception filter exists anywhere in `src/` (confirmed via grep for `ExceptionFilter`/`catch(QueryFailedError)`).

---

## Finding: Unbounded integer inputs cause unhandled 500 errors instead of clean 400 (int4 overflow, unauthenticated, DB-error passthrough)

**Severity:** Medium
**Confidence:** High

**Root cause:** `Product.stock` and `Product.categoryId` (in `src/modules/products/entities/product.entity.ts`) are plain `@Column()` — TypeORM maps this to Postgres `integer` (int4, range -2147483648..2147483647). The corresponding DTOs only enforce `@IsInt()` / `@Min(0)` / `@IsPositive()` with no `@Max()` upper bound:
- `src/modules/products/dto/create-product.dto.ts` — `stock: @IsInt() @Min(0)`, `categoryId: @IsInt() @IsPositive()`
- `src/modules/products/dto/update-product.dto.ts` — same, both optional
- Numeric path params (`:id` on products/categories, via Nest's `ParseIntPipe`) are similarly unbounded — any integer-looking string is accepted and passed straight to the DB layer.

Since there is no global exception filter, an out-of-range value reaches Postgres, which throws (integer out of range), TypeORM surfaces it as an unhandled `QueryFailedError`, and Nest's default handler converts it to a generic `500 Internal Server Error` — instead of a clean, validated `400`.

**Verified how:**

```
curl -s -i -X POST http://localhost:3000/products -H "Content-Type: application/json" \
  -d '{"name":"boundprod2","price":10,"categoryId":2,"stock":2147483648}'
```
Response:
```
HTTP/1.1 500 Internal Server Error
{"statusCode":500,"message":"Internal server error"}
```
Compare with the boundary value that fits int4 (2147483647), which succeeds normally (`201 Created`) — confirming the break is exactly at the int4 boundary, not generic input rejection.

Same root cause reproduced on `categoryId`:
```
curl -s -i -X POST http://localhost:3000/products -H "Content-Type: application/json" \
  -d '{"name":"boundprod4","price":10,"categoryId":2147483648,"stock":5}'
→ HTTP/1.1 500 Internal Server Error {"statusCode":500,"message":"Internal server error"}
```

And on numeric path params, for both GET and DELETE, on both resources (fully unauthenticated, read-only requests included):
```
curl -s -i http://localhost:3000/products/2147483648
→ 500 {"statusCode":500,"message":"Internal server error"}

curl -s -i http://localhost:3000/products/99999999999999999999
→ 500 {"statusCode":500,"message":"Internal server error"}

curl -s -i -X DELETE http://localhost:3000/categories/2147483648
→ 500 {"statusCode":500,"message":"Internal server error"}
```

The response body itself does not leak a stack trace, SQL fragment, or file path (Nest's default filter masks it) — so this is not an information-disclosure issue. It is a validation-robustness / error-handling gap: unauthenticated clients can trivially force `500`s on effectively every read/write endpoint that takes a numeric id or a `stock`/`categoryId` value, on every single request, with a single crafted integer. This also means legitimate 4xx-vs-5xx monitoring/alerting for the API is unreliable (a routine bad client input shows up as a server fault), and any log/monitoring pipeline that treats 500s as incidents will page on attacker-controlled input.

Note: the equivalent order path (`quantity` in `CreateOrderItemDto`, same missing `@Max()`) is currently *not* exploitable end-to-end, because `OrdersService.create` (`src/modules/orders/orders.service.ts`) checks `product.stock < item.quantity` in application code before any DB write — and stock itself is capped at int4 max, so a quantity larger than int4 max always fails that comparison first with a clean `400 "Estoque insuficiente..."`. The DTO-level gap is identical though, and would become exploitable if that ordering check were ever removed or changed.

**Impact:** Denial-of-service-adjacent nuisance and monitoring/alerting pollution — trivial, unauthenticated, single-request 500s on `GET/DELETE /products/:id`, `GET/DELETE /categories/:id`, `POST /products` (`stock`, `categoryId`), `PATCH /products/:id` (same fields). Not data-disclosing, but violates the expectation that malformed client input is always cleanly rejected with 4xx, and pollutes error tracking / uptime metrics with attacker-triggered "internal errors."

**Fix:**
1. Add explicit upper bounds matching the DB column range to the DTOs, e.g. `@Max(2147483647)` on `stock` and `categoryId` in both `create-product.dto.ts` and `update-product.dto.ts` (and on `quantity`/`productId` in `create-order.dto.ts` for defense in depth).
2. For path params, replace/augment the bare `ParseIntPipe` with a pipe or custom validation that rejects values outside a sane range (e.g. `> 2147483647`) before they reach TypeORM, returning a proper `400`.
3. Add a global exception filter that catches TypeORM's `QueryFailedError` and maps DB constraint/range/type errors to `400 Bad Request` with a generic message, so any future gap of this shape degrades to a clean 4xx instead of a 500 — this is a good defense-in-depth backstop regardless of point 1/2.

---

## Everything else tried: no vulnerability found (safe / correctly rejected)

- **SQL injection** — `POST /categories` with `{"name": "x'; DROP TABLE categories; --"}"` and `{"name": "' OR '1'='1"}"` → both `201 Created`, payload stored **literally** as the `name` string (confirmed via subsequent `GET /categories`), table intact. TypeORM's parameterized queries are working correctly. Also tried smuggling a SQL string into the numeric `categoryId` field (`"1 OR 1=1"`) → cleanly rejected `400` by `class-validator`'s `@IsInt()` before ever reaching the DB.
- **Mass assignment / whitelist bypass** — `POST /products` with extra `id`/`isAdmin` fields → `400 {"message":["property id should not exist","property isAdmin should not exist"],...}`. Nested object mass-assignment (`"category": {...}`) → also `400`, `forbidNonWhitelisted` works as intended.
- **Type confusion** — `price: "abc"`, `price: [1,2,3]`, `price: {"a":1}`, `stock: -999999` → all cleanly rejected with `400` and specific `class-validator` messages. `quantity: 0` and `quantity: -1` on orders → both cleanly `400` ("must not be less than 1").
- **Array size abuse** — a 5000-item `POST /orders` body (145KB) was rejected outright with `413 Payload Too Large` by Express's default `body-parser` limit (100KB) before it ever reached validation or the DB. A 1600-item body (~46KB, under the limit) was processed in ~470ms and cleanly rejected with a business-logic `400` ("Estoque insuficiente..."). The known gap (no `@ArrayMaxSize` on `CreateOrderDto.items`) exists in the code, but in practice the default body-size limit already bounds the blast radius to roughly a few thousand items, and processing time for that volume was not alarming. Not re-reported as a new finding since impact is minimal given the existing size cap; note `OrdersService.create` does process items in a sequential `for` loop (one `SELECT` + one `UPDATE` per item, all inside one transaction) which is an N+1 pattern worth knowing about for future capacity work, but did not produce an observable DoS in this test.
- **Error-message / stack trace leakage** — malformed JSON body → `400` with a body-parser message that includes JSON parse position (`"Expected property name or '}' in JSON at position 1..."`) but no file paths, stack traces, or library internals. Missing `Content-Type` header → correctly still validated/rejected `400` (Nest still parsed and validated the body). Non-existent route → clean `404 {"message":"Cannot GET /nonexistent-route-xyz",...}`. None of these leak DB error codes, SQL fragments, absolute file paths, or stack traces in the response body.
- **NoSQL/prototype-pollution-style JSON** — `{"name": {"$ne": null}}"` → `400` ("name must be a string"). `{"name":"x","__proto__":{"polluted":true}}` → `201`, `__proto__` silently dropped by whitelist stripping (harmless — not merged into any object, and `class-transformer`'s plain-object instantiation doesn't touch the real prototype here); no evidence of pollution. Both endpoints behave safely given the strict DTOs.
