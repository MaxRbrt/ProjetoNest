## Finding: RLS disabled + full anon/authenticated grants on all 5 public tables (Data API wide open)

**Severity:** Critical

**Confidence:** High (RLS-off + grants confirmed directly against the live database; Data API network reachability not independently confirmed — see "What I could NOT verify" below)

**Verified how:**

Wrote a temporary TypeORM script (`check-rls-tmp.ts`, run from project root via `npx ts-node`, imported `dataSourceOptions` from `src/db/data-source.ts`, never printed the connection string, deleted immediately after use — nothing committed) that ran three queries against the live Supabase Postgres instance:

1. RLS status via `pg_class.relrowsecurity` / `relforcerowsecurity` for `categories`, `products`, `orders`, `order_items`, `migrations` in `public`:
   ```
   categories   rls_enabled=false  rls_forced=false
   migrations   rls_enabled=false  rls_forced=false
   order_items  rls_enabled=false  rls_forced=false
   orders       rls_enabled=false  rls_forced=false
   products     rls_enabled=false  rls_forced=false
   ```
   → **All 5 tables have RLS disabled.** This independently confirms the Security Advisor screenshot, straight from `pg_catalog`.

2. Policy count via `pg_policies` for those 5 tables → **zero rows returned.** No policies exist at all, so even flipping `ENABLE ROW LEVEL SECURITY` today without adding policies would deny all access (worth noting for the fix).

3. Grants via `information_schema.role_table_grants` for `grantee IN ('anon','authenticated','PUBLIC')` on those 5 tables → **every one of the 5 tables grants `SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER` to both `anon` and `authenticated`.** This is the second half of the exploit chain: it's not just "no row filter," the roles PostgREST authenticates Data API callers as have full CRUD table-level privileges already. This is Supabase's default behavior (the `public` schema has default privileges pre-wired to `anon`/`authenticated` at project creation), not something this app's code did — but it means the privilege prerequisite for Data API exploitation is already satisfied, not merely theoretical.

4. Confirmed `anon`, `authenticated`, `service_role` all exist as real roles in this database (`pg_roles`), i.e., this is a genuine Supabase-provisioned project with the standard Data API role setup, not a bare Postgres instance where those roles would be absent/inert.

Separately, grepped the entire codebase for `@supabase/supabase-js`, `supabase` (case-insensitive, `*.ts`), `ANON_KEY`, `SUPABASE_URL`, `NEXT_PUBLIC` — **zero matches.** The NestJS app talks to Postgres exclusively via TypeORM's direct `DATABASE_URL` connection (`src/db/data-source.ts`); it does not use the Supabase client library, does not read/expose an anon key, and there is no frontend in this repo.

**What I could NOT verify (honestly):** I do not have the project's anon/publishable key and did not attempt to guess or brute it, so I did not send an actual `curl https://<ref>.supabase.co/rest/v1/products` request end-to-end. I cannot 100% prove the Data API endpoint is currently *reachable over the network* (e.g. if the user had explicitly disabled the Data API toggle in Dashboard → Settings → Data API for the `public` schema, PostgREST would reject requests regardless of grants/RLS — the DB-level state I checked doesn't tell me that toggle's position, and the account is not something I have access to check). Data API being enabled for `public` is Supabase's default and there is no evidence in this repo of anyone changing it, so I treat it as enabled, but flagging the gap for honesty.

**Impact:**

Given what's confirmed (RLS off + full CRUD grants to `anon`/`authenticated`, default-enabled Data API), **anyone in possession of this project's anon/publishable key can, via plain HTTPS REST calls to `https://<project-ref>.supabase.co/rest/v1/{categories,products,orders,order_items}`, read, insert, update, delete, or truncate every row in every one of these tables — completely bypassing the NestJS app, its DTOs/validation, and any business logic** (e.g., stock checks in `OrdersService`, price integrity in `ProductsService`). Since there's currently no Supabase Auth integration and no frontend, the anon key isn't yet embedded in a shipped client bundle — but it is not a secret by Supabase's own design (it's meant to be public once a frontend ships) and is visible today to anyone with dashboard/project access (API settings page) or anyone who obtains it via the project's future frontend, a leaked `.env`, screenshot, git history, support ticket, etc. The `migrations` table is TypeORM's own internal history table (low sensitivity — table/column names only) but is exposed via the same path, which additionally lets an outside party fingerprint the schema/migration history.

Net effect: this is a **live, armed vulnerability** the moment the anon key becomes known to anyone outside the project owner — not a "someday if you add a frontend" risk. The direct-connection NestJS path is unaffected (it never goes through PostgREST/anon), so the app's current runtime behavior is not compromised — but the database itself is exposed via a completely separate, already-enabled channel that this codebase's threat model didn't account for.

**Fix:**

Enable RLS on all 5 tables and add explicit, default-deny policies (since the app doesn't use Supabase Auth, there is no `auth.uid()` to scope by yet — so start by locking the Data API out entirely and letting only the direct TypeORM connection, which uses a role outside `anon`/`authenticated`, keep working):

```sql
-- Enable RLS (with zero policies, anon/authenticated are denied by default — this alone closes the hole)
ALTER TABLE public.categories  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.migrations  ENABLE ROW LEVEL SECURITY;

-- Belt-and-suspenders: since this app has no Data API use case at all today,
-- also revoke the blanket grants Supabase pre-wired for anon/authenticated,
-- rather than relying on RLS alone as the only gate:
REVOKE ALL ON public.categories, public.products, public.orders, public.order_items, public.migrations
  FROM anon, authenticated;

-- If/when a legitimate frontend + Supabase Auth flow is added later, add
-- narrow, purpose-built policies at that time, e.g.:
-- CREATE POLICY "read products" ON public.products FOR SELECT TO anon, authenticated USING (true);
-- and keep INSERT/UPDATE/DELETE restricted to service_role (i.e., the NestJS backend only)
-- or to authenticated with an ownership predicate, per the actual access model —
-- do not restore blanket CRUD grants to anon/authenticated.
```

Recommend adding this as a proper TypeORM migration (alongside the existing `CreateCategories`/`CreateProducts`/`CreateOrders` migrations in `src/db/migrations/`) rather than a one-off dashboard change, so it's tracked and reproducible. Not applied — verification and SQL only, per task scope.
