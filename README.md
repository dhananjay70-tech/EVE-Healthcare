# EVE Healthcare Backend

Backend for a diagnostic healthcare booking platform: user accounts and
roles, a diagnostic centre/test catalog, bookings, and simulated payments
with an idempotent webhook.

## Project Overview

This is the backend for the EVE Healthcare SDE Intern Assignment: a REST
API where a user can sign up, browse diagnostic centres and the tests they
offer, book a test, pay for it (simulated — no real payment gateway), and
cancel a booking. An `ADMIN` role can additionally manage the centre/test
catalog.

**Current implementation status — everything below is implemented and
verified (see [Tests](#running-tests)):**

* Signup / login / JWT authentication, with a `USER`/`ADMIN` role.
* Diagnostic centres and tests: public read APIs, `ADMIN`-only create/
  update/delete APIs.
* Authenticated booking creation, listing, retrieval, and cancellation.
* Simulated payments (`POST /api/payments`) and an idempotent simulated
  webhook (`POST /api/payments/webhook`).

**Not implemented** (out of scope per the assignment): a real payment
gateway integration; see [Limitations and Possible Improvements](#limitations-and-possible-improvements)
for the full list of what's deliberately left out.

## Tech Stack

* Node.js + Express.js (CommonJS, no TypeScript)
* PostgreSQL (hosted on Supabase in this setup; plain PostgreSQL works too)
* Drizzle ORM + Drizzle Kit (schema, migrations)
* `pg` (node-postgres) driver
* Zod for request validation
* bcryptjs for password hashing
* jsonwebtoken for JWT authentication
* Jest + Supertest for testing

No Docker, no Redis, no real payment gateway, no framework/ORM/database
other than the above.

## Prerequisites

* **Node.js 20+** (developed and tested on Node v24.13.1) and npm (tested
  on npm 11.8.0).
* A **PostgreSQL database** — either a Supabase project (used for this
  build) or a local PostgreSQL install. See [Database Setup](#1-database-setup).
* No other services required — nothing to install beyond `npm install`.

## Folder Structure

```
Backend/
├── src/
│   ├── app.js                  # Express app: middleware, routes, error handling (no listen())
│   ├── server.js                # Starts the HTTP server, handles graceful shutdown
│   ├── config/
│   │   └── env.js               # Validates and exports environment variables
│   ├── db/
│   │   ├── index.js             # PostgreSQL pool + Drizzle instance (reused across requests)
│   │   ├── seed.js              # Idempotent sample data seeder
│   │   └── schema/
│   │       ├── _schema.js       # The shared `eve_healthcare` pgSchema every table lives under
│   │       ├── users.js         # Includes the USER/ADMIN role enum
│   │       ├── centres.js
│   │       ├── tests.js
│   │       ├── bookings.js
│   │       └── payments.js
│   ├── routes/
│   │   ├── auth.routes.js       # POST /signup, /login, GET /me
│   │   ├── centres.routes.js    # GET /, GET /:id, GET /:id/tests (public) + POST/PATCH/DELETE (admin)
│   │   ├── tests.routes.js      # GET /:id (public) + POST/PATCH/DELETE (admin)
│   │   ├── bookings.routes.js   # POST /, GET /, GET /:id, PATCH /:id/cancel (all authenticated)
│   │   └── payments.routes.js   # POST /, POST /webhook
│   ├── controllers/
│   │   ├── auth.controller.js
│   │   ├── centres.controller.js
│   │   ├── tests.controller.js
│   │   ├── bookings.controller.js
│   │   └── payments.controller.js
│   ├── services/
│   │   ├── auth.service.js      # Hashing, lookups, JWT signing, safe-user shaping (incl. role)
│   │   ├── centres.service.js   # Reads + admin create/update/delete, booking-safe deletion
│   │   ├── tests.service.js     # Reads + admin create/update/delete, booking-safe deletion
│   │   ├── bookings.service.js  # Create/list/get/cancel, server-side pricing, ownership checks
│   │   └── payments.service.js  # Simulated payment processing + webhook idempotency, transactions
│   ├── middleware/
│   │   ├── authenticate.js      # JWT auth guard, attaches req.user (incl. role)
│   │   ├── requireAdmin.js      # Runs after authenticate; 403s non-admins
│   │   ├── validate.js          # Zod request-body validator (used by auth)
│   │   └── validateRequest.js   # Zod validator for params/query/body (used elsewhere)
│   ├── validators/
│   │   ├── auth.validators.js
│   │   ├── common.validators.js  # Shared id-param and pagination-query schemas
│   │   ├── centres.validators.js
│   │   ├── tests.validators.js
│   │   ├── bookings.validators.js
│   │   └── payments.validators.js
│   └── utils/
│       └── AppError.js          # Error class carrying a statusCode for the error handler
├── tests/                       # Jest + Supertest tests
├── drizzle/                     # Generated SQL migrations (created by db:generate)
├── drizzle.config.js            # Drizzle Kit configuration
├── .env                         # Local secrets (gitignored — never committed)
├── .env.example                 # Placeholder values only, safe to commit
└── package.json
```

**Folder responsibilities:**

* `config/` — reads and validates `process.env` once, at startup. Nothing
  else in the app should read `process.env` directly.
* `db/` — the only place that talks to PostgreSQL directly. `db/index.js`
  exports one shared pool/Drizzle instance; `db/schema/` defines the tables
  (all under the `eve_healthcare` schema via `_schema.js`).
* `routes/` → `controllers/` → `services/` — the request flow for every
  feature: routes wire URLs to controllers (and declare which middleware
  guards them), controllers handle HTTP concerns (status codes,
  request/response shape), services hold business logic and call the
  database directly via `db`.
* `middleware/` — cross-cutting Express middleware: `authenticate` (JWT
  verification), `requireAdmin` (role check, composes with `authenticate`),
  and `validate`/`validateRequest` (Zod validation).
* `validators/` — Zod schemas for validating request bodies/params/query.
* `utils/` — small shared helpers, e.g. `AppError` for throwing errors with
  an HTTP status code that the centralized error handler in `app.js` reads.

## Local Setup

### 1. Database Setup

This project connects to a **hosted Supabase PostgreSQL instance** (see
`DATABASE_URL` in `.env.example` for the placeholder shape). That Supabase
project is **shared with other, unrelated applications** in this specific
setup — it has its own `public`, `aero_resolve`, and `nuzio_ai` schemas
with unrelated tables (including their own `users` table with a completely
different structure).

To avoid ever colliding with those, **every EVE Healthcare table lives in
its own dedicated Postgres schema, `eve_healthcare`**, instead of the
default `public` schema:

* `src/db/schema/_schema.js` defines `const eveHealthcareSchema = pgSchema('eve_healthcare')`.
* Every table file (`users.js`, `centres.js`, etc.) builds its table with
  `eveHealthcareSchema.table(...)` / `eveHealthcareSchema.enum(...)` instead
  of the bare `pgTable`/`pgEnum`. Drizzle then automatically qualifies every
  generated query and migration statement with `"eve_healthcare".` — no
  other application code has to know about this.
* `drizzle.config.js` sets `schemaFilter: ['eve_healthcare']` so Drizzle Kit
  itself never introspects or touches `public`, `aero_resolve`, or
  `nuzio_ai`.

**Verifying the tables live under `eve_healthcare`:** in the Supabase
dashboard, **Table Editor** → use the schema dropdown at the top (defaults
to `public`) → switch it to `eve_healthcare`. You should see `users`,
`centres`, `tests`, `bookings`, `payments` and nothing else there. Or via
`psql` / any SQL client:

```sql
SELECT table_name FROM information_schema.tables WHERE table_schema = 'eve_healthcare' ORDER BY table_name;
```

#### Running against local PostgreSQL instead

* **Install:** `winget install PostgreSQL.PostgreSQL.17` (elevated
  PowerShell), or the installer from
  https://www.postgresql.org/download/windows/.
* **Create a database:** `psql -U postgres -c "CREATE DATABASE eve_healthcare;"`
* Point `DATABASE_URL` in `.env` at it — see [Environment Variables](#2-environment-variables)
  below.
* The `eve_healthcare` *schema* setup above still applies — Drizzle creates
  it inside whichever database `DATABASE_URL` points at, local or hosted.

### 2. Environment Variables

Copy `.env.example` to `.env` and fill in your own values — **every value
below is a placeholder**, not a real credential:

```
PORT=5000
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/eve_healthcare
JWT_SECRET=replace_with_a_secure_secret
JWT_EXPIRES_IN=1d
```

* `PORT` — port the HTTP server listens on.
* `DATABASE_URL` — a standard `postgresql://` connection string, for either
  a local PostgreSQL instance or a hosted one (e.g. Supabase's connection
  string from **Project Settings → Database → Connection string**, using
  the transaction pooler).
* `JWT_SECRET` — any long random string; generate one locally with e.g.
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
  Never reuse an example value in a real deployment.
* `JWT_EXPIRES_IN` — any value `jsonwebtoken` accepts (`"1d"`, `"12h"`, etc.).

`.env` is gitignored and must never be committed; `.gitignore` also excludes
`node_modules/`, `coverage/`, and log files. `.env.example` holds only
placeholders and is safe to commit. **No real secrets, API keys, passwords,
or database URLs appear anywhere in this repository or this README.**

### 3. Install Dependencies

```bash
npm install
```

### 4. Generate and Apply Migrations

```bash
npm run db:generate   # reads src/db/schema/*.js, writes SQL to drizzle/
npm run db:migrate    # applies pending migrations in drizzle/ to your database
```

Always review the generated SQL file in `drizzle/` before running
`db:migrate` against a database you care about. Every migration in this
repo so far is purely additive (`CREATE TABLE`/`CREATE TYPE`/`ALTER TABLE
ADD COLUMN`/`ADD CONSTRAINT`) — nothing drops existing tables, columns, or
data, and `schemaFilter: ['eve_healthcare']` keeps every statement scoped
to that schema.

Verify the tables were created (see [Database Setup](#1-database-setup)
above for the Supabase Table Editor method):

```sql
SELECT table_name FROM information_schema.tables WHERE table_schema = 'eve_healthcare' ORDER BY table_name;
```

You should see `users`, `centres`, `tests`, `bookings`, and `payments`.

### 5. Seed Sample Data (Optional)

```bash
npm run db:seed
```

Inserts three sample diagnostic centres (City Diagnostic Centre, Health
First Diagnostics, Metro Medical Labs) and a few sample tests (Complete
Blood Count, Blood Sugar Test, Thyroid Profile) with realistic prices. The
script checks for existing rows by name before inserting, so running it
multiple times never creates duplicates. It never creates user accounts.

### 6. Promote a User to ADMIN (Optional)

There is intentionally **no API to create or promote an admin** (that
would be a self-elevation hole). Sign up normally through `POST
/api/auth/signup` — every new account is `USER` — then promote it directly
in the database:

```sql
UPDATE eve_healthcare.users SET role = 'ADMIN' WHERE email = 'you@example.com';
```

The JWT payload only carries the user's id (see
[Authorization / Roles](#authorization--roles)) — `role` is looked up fresh
from the database on every request. That means an **existing, already-issued
token immediately reflects the promotion** on its very next request; there's
no need to log in again for the new role to take effect (only a client's own
cached copy of a previous `/me` response would look stale).

### 7. Run the Backend

```bash
npm run dev     # nodemon, auto-restarts on file changes
npm start        # plain node
```

`GET /` responds with:

```json
{ "success": true, "message": "EVE Healthcare Backend is running" }
```

## Running Tests

```bash
npm test
npm run test:watch
```

Tests do **not** require a running PostgreSQL instance. The app/health/env/db
tests only construct the connection pool (which doesn't connect eagerly)
and never run a query. Every other test file mocks `src/db` (the
bookings/payments tests additionally mock `db.transaction` and its
row-locked `tx`), so the whole suite — auth, centres/tests reads and admin
writes, bookings including cancellation, and the payments/webhook flow —
runs without touching PostgreSQL.

Beyond the mocked suite, the booking/payment/cancellation/admin-catalog
logic has also been verified by hand against the live Supabase database
(signup → login → role promotion → admin create/update/delete → booking →
payment success/failure/retry → cancellation, including a CONFIRMED
booking → webhook idempotent replay) — see [Assumptions](#assumptions) for
what that verification covered. That live verification isn't part of the
automated `npm test` run; when integration tests against a real database
are added, point them at a separate database (e.g. `eve_healthcare_test`)
via a `DATABASE_URL` override, and never run tests against the production
database.

## Database Schema and Relationships

All five tables live under the `eve_healthcare` Postgres schema (e.g. the
real table is `eve_healthcare.users`, not `public.users`) — see
[Database Setup](#1-database-setup) for why.

| Table      | Key columns                                                   |
|------------|----------------------------------------------------------------|
| `users`    | `id`, `name`, `email` (unique), `password_hash`, `role` (`USER`\|`ADMIN`, default `USER`) |
| `centres`  | `id`, `name`, `location`                                       |
| `tests`    | `id`, `centre_id` → `centres.id`, `name`, `description`, `price` |
| `bookings` | `id`, `user_id` → `users.id`, `test_id` → `tests.id`, `centre_id` → `centres.id`, `appointment_at`, `amount`, `status` |
| `payments` | `id`, `booking_id` → `bookings.id`, `amount`, `status`, `provider_event_id` |

Relationships:

* One `user` → many `bookings`.
* One `centre` → many `tests` and many `bookings`.
* One `test` → many `bookings`.
* One `booking` → many `payments` (retry attempts).

Constraints worth knowing about:

* `tests.price`, `bookings.amount`, and `payments.amount` all have a
  `CHECK (... > 0)` constraint — no zero or negative amounts at the
  database level.
* `payments.provider_event_id` has a unique index, so the same webhook
  event can never be recorded twice — but multiple `NULL` values are
  allowed (Postgres treats `NULL`s as distinct in a unique index), which is
  what "nullable initially, unique when present" requires.
* **Payment retries:** a booking can have multiple `payments` rows (e.g.
  `PENDING` → `FAILED` → `PENDING` → `SUCCESS`), but a **partial unique
  index** (`payments_one_success_per_booking_idx`) on `booking_id` scoped
  to `WHERE status = 'SUCCESS'` guarantees at most one successful payment
  per booking, without blocking earlier failed/pending attempts from
  existing alongside it.
* Booking and payment statuses are Postgres enums (`booking_status`,
  `payment_status`), and `users.role` is also an enum (`user_role`) —
  invalid values are rejected by the database itself, not just by the API.
* **A booked test must belong to the booked centre.** `tests` has a unique
  constraint on `(id, centre_id)`, and `bookings` has a composite foreign
  key on `(test_id, centre_id)` referencing it — the database rejects a
  booking whose `test_id`/`centre_id` pair doesn't correspond to a real
  test actually offered by that centre. `POST /api/bookings` also checks
  this explicitly at the application layer first (returning a clean
  `400`), so the database constraint is a second, defense-in-depth layer.
* `bookings.amount` is computed server-side from `tests.price` in
  `bookings.service.js` at booking-creation time — the create-booking
  request body has no `amount` field at all, so there's nothing for a
  client to override. This amount is then a **frozen snapshot**: later
  admin edits to `tests.price` never retroactively change an existing
  booking's `amount` (verified live: updating a test's price after a
  booking exists leaves that booking's `amount` untouched).
* **A centre/test with any existing booking cannot be deleted** —
  `centres.service.js`/`tests.service.js` explicitly check for a
  referencing `bookings` row first and return `409` if one exists, rather
  than allowing a delete that would orphan a booking's `test_id`/`centre_id`.
  A test's `centre_id` also can't be changed via `PATCH` (see
  [Diagnostic Centres and Tests](#diagnostic-centres-and-tests)) — a test's
  centre is fixed at creation time, which sidesteps a more complex
  re-validation problem for existing bookings.

## Authorization / Roles

`users.role` is either `USER` (default, everyone who signs up) or `ADMIN`.

* **New accounts always get `USER`** — the signup request body has no
  `role` field, so a client can never self-elevate; even if one is sent,
  Zod strips it before it reaches the service, and the service never reads
  it from client input anyway (verified by a test asserting the raw
  `INSERT` values never contain a `role` key from the request).
* **Promoting to `ADMIN` is a manual database step** (see
  [Local Setup, step 6](#6-promote-a-user-to-admin-optional)) — there is no
  admin-creation/promotion API, by design.
* `authenticate` looks the user up fresh from the database on every
  request and attaches `{ id, name, email, role, createdAt, updatedAt }` to
  `req.user`. `requireAdmin` (used after `authenticate`) checks
  `req.user.role === 'ADMIN'` and returns `403` otherwise. Both are
  reusable on any future route.
* `GET /api/auth/me` and the signup/login responses include `role`, so a
  client can tell which kind of account it has.

## API Reference

Every response is JSON, shaped either `{ "success": true, "data": {...} }`
or `{ "success": false, "message": "..." }`. Validation errors and
not-found/conflict errors return a clear `message`; unexpected server
errors return a generic `"Internal server error"` in production (never a
raw database error or stack trace — see `src/app.js`'s error handler).

### Authentication

Three endpoints under `/api/auth`.

#### `POST /api/auth/signup` — public

Request:

```json
{ "name": "User Name", "email": "user@example.com", "password": "StrongPassword123" }
```

* `name` — required, non-empty.
* `email` — required, valid email; trimmed and lowercased before
  storing/comparing.
* `password` — required, 8–72 characters (bcrypt only considers the first
  72 bytes, so longer input is rejected rather than silently truncated).

Response (`201`):

```json
{
  "success": true,
  "data": {
    "user": { "id": "…", "name": "User Name", "email": "user@example.com", "role": "USER", "createdAt": "…", "updatedAt": "…" }
  }
}
```

`password_hash` is never included in any response, anywhere in this API.
A duplicate email returns `409` with a generic message (no database
details exposed).

#### `POST /api/auth/login` — public

Request: `{ "email": "user@example.com", "password": "StrongPassword123" }`

Response (`200`):

```json
{
  "success": true,
  "data": {
    "token": "<JWT>",
    "user": { "id": "…", "name": "…", "email": "…", "role": "USER", "createdAt": "…", "updatedAt": "…" }
  }
}
```

An incorrect email **or** password both return the same `401` with message
`"Invalid email or password"`. The token is signed with `JWT_SECRET` and
expires after `JWT_EXPIRES_IN` (both from `.env`; never hardcoded).

#### `GET /api/auth/me` — requires `Authorization: Bearer <token>`

Response (`200`): the same safe `user` shape as above. Missing, malformed,
invalid, or expired tokens all return `401`.

### Diagnostic Centres and Tests

Reads are public; writes require `Authorization: Bearer <token>` for an
`ADMIN` account (see [Authorization / Roles](#authorization--roles)). List
responses are paginated: `page` (default `1`, max `1,000,000`) and `limit`
(default `20`, max `100`) query params, both Zod-validated. Prices are
returned as decimal **strings** (e.g. `"350.00"`) to avoid floating-point
rounding.

#### `GET /api/centres` — public

```
GET /api/centres?page=1&limit=20
```

```json
{
  "success": true,
  "data": {
    "centres": [{ "id": "…", "name": "City Diagnostic Centre", "location": "…", "createdAt": "…", "updatedAt": "…" }],
    "pagination": { "page": 1, "limit": 20, "total": 3, "totalPages": 1 }
  }
}
```

#### `GET /api/centres/:id` — public

`:id` must be a UUID (`400` if not); `404` if no centre has that id.

#### `GET /api/centres/:id/tests` — public

Same pagination as above; `404` if the centre doesn't exist.

#### `POST /api/centres` — admin only

Request: `{ "name": "New Centre", "location": "Pune" }` (both required).

Response (`201`): `{ "success": true, "data": { "centre": { "id": "…", "name": "New Centre", "location": "Pune", "createdAt": "…", "updatedAt": "…" } } }`

`401` if not authenticated, `403` if authenticated but not `ADMIN`, `400`
for missing/empty fields.

#### `PATCH /api/centres/:id` — admin only

Request: any non-empty subset of `{ "name": "...", "location": "..." }`.

Response (`200`) with the updated centre; `400` if the body is empty or
invalid; `403` if not admin; `404` if the centre doesn't exist.

#### `DELETE /api/centres/:id` — admin only

Response: `204 No Content`. `404` if the centre doesn't exist; **`409` if
the centre has any existing booking** (directly, or via one of its tests)
— deletion is blocked rather than corrupting that booking's history. A
centre with tests that have *no* bookings can be deleted; those
booking-free tests are removed along with it (`ON DELETE CASCADE`).

#### `POST /api/tests` — admin only

Request: `{ "centreId": "…", "name": "New Test", "description": "optional", "price": 199.5 }`.

* `price` accepts a number or numeric string, must be `> 0`, and is stored
  normalized to 2 decimal places (e.g. `199.5` → `"199.50"`).
* `centreId` must reference an existing centre (`404` if not).

Response (`201`) with the created test; `403` if not admin; `400` for
invalid/missing fields.

#### `PATCH /api/tests/:id` — admin only

Request: any non-empty subset of `{ "name": "...", "description": "...", "price": ... }`.
**`centreId` is not an updatable field** — a test's centre is fixed at
creation time (see [Database Schema](#database-schema-and-relationships)
for why). Response (`200`) with the updated test; `400`/`403`/`404` as
above. Existing bookings' stored `amount` is unaffected by a price change
(frozen snapshot — verified live).

#### `DELETE /api/tests/:id` — admin only

Response: `204 No Content`. **`409` if the test has any existing booking**;
otherwise deleted.

### Bookings

All four endpoints require `Authorization: Bearer <token>`. The user id
always comes from the JWT — never from the request body — so there's no
way to create, read, or cancel a booking on another user's behalf.

#### `POST /api/bookings`

Request: `{ "testId": "…", "centreId": "…", "appointmentAt": "2026-10-05T10:00:00.000Z" }`

* `testId`, `centreId` — required UUIDs. `appointmentAt` — required, must
  parse as a date and be in the future.
* There is **no `amount` field** — the server looks up `testId`, takes its
  current `tests.price`, and stores that as `bookings.amount`.
* The server checks that `testId` actually belongs to `centreId` and
  returns `400` if it doesn't; `404` if the centre or test doesn't exist.
  The whole check-and-insert runs inside one DB transaction.

Response (`201`), booking created with `status: "PENDING"`:

```json
{
  "success": true,
  "data": {
    "booking": {
      "id": "…", "userId": "…", "testId": "…", "centreId": "…",
      "appointmentAt": "2026-10-05T10:00:00.000Z", "amount": "350.00",
      "status": "PENDING", "createdAt": "…", "updatedAt": "…"
    }
  }
}
```

#### `GET /api/bookings`

Paginated (same params as centres/tests), returns **only the authenticated
user's own bookings**, most recent first, each with a joined `test`/`centre`
summary.

#### `GET /api/bookings/:id`

Returns **`404` both when the booking doesn't exist and when it belongs to
a different user** — deliberately the same response either way, so a
request can never confirm that some other user's booking id exists.

#### `PATCH /api/bookings/:id/cancel`

Cancels the caller's own booking.

* `404` — booking doesn't exist, or belongs to a different user (same
  no-leak reasoning as `GET /api/bookings/:id`).
* `409` — the booking is already `CANCELLED`.
* Otherwise (from `PENDING`, `FAILED`, **or `CONFIRMED`**): status becomes
  `CANCELLED`.
* Runs inside a transaction with the booking row locked (`SELECT … FOR
  UPDATE`) for its duration — the same locking pattern `POST /api/payments`
  uses, so a cancellation racing a concurrent payment attempt on the same
  booking is serialized rather than producing an inconsistent result (see
  [Assumptions](#assumptions)).

Response (`200`):

```json
{ "success": true, "data": { "booking": { "id": "…", "status": "CANCELLED", "…": "…" } } }
```

If the booking had already been paid (was `CONFIRMED`), the response also
includes a `note`:

```json
{
  "success": true,
  "data": {
    "booking": { "status": "CANCELLED", "…": "…" },
    "note": "This booking had a successful simulated payment. No real refund has been processed (payments are simulated, not a real gateway)."
  }
}
```

No payment record is modified or reversed by a cancellation — the
`payments` history stays exactly as it happened; only `bookings.status`
changes. See [Assumptions](#assumptions).

#### Booking status values

`PENDING` (just created, unpaid) → `CONFIRMED` (a payment succeeded) or
`FAILED` (a payment attempt failed — but the booking can still be retried)
→ `CANCELLED` (via `PATCH /:id/cancel`, from any status except an already-
`CANCELLED` one). Once `CONFIRMED`, no further payment attempts are
accepted (`409`) — but cancellation is still allowed. Once `CANCELLED`, no
further payment attempts **or** cancellations are accepted (`409` either
way).

### Simulated Payments + Webhook

There is no real payment gateway — both endpoints **simulate** one, per
the assignment. Neither endpoint accepts a client-supplied `amount`; the
amount always comes from `bookings.amount`.

#### `POST /api/payments` — requires `Authorization: Bearer <token>`

A user paying for their **own** booking.

Request: `{ "bookingId": "…", "outcome": "SUCCESS" }`

* `outcome` — optional, `"SUCCESS"` or `"FAILED"`. This is the simulation
  control, standing in for whatever a real gateway would decide. If
  omitted, the outcome is randomized (80% success). Pass it explicitly for
  a deterministic result.
* `404` if the booking doesn't exist or isn't the caller's own.
* `409` if the booking is already `CONFIRMED` or `CANCELLED`.
* Otherwise: within one transaction, the booking row is locked (`FOR
  UPDATE`), a `payments` row is inserted with the resolved outcome, and the
  booking's status is updated (`CONFIRMED` on `SUCCESS`, `FAILED` on
  `FAILED`) — committed together, or none of it is.

Response (`201`):

```json
{
  "success": true,
  "data": {
    "payment": { "id": "…", "bookingId": "…", "amount": "350.00", "status": "SUCCESS", "providerEventId": null, "createdAt": "…", "updatedAt": "…" },
    "booking": { "id": "…", "status": "CONFIRMED", "…": "…" }
  }
}
```

**Retries:** a `FAILED` payment leaves the booking `FAILED`, not a dead
end — `POST /api/payments` again with the same `bookingId` is allowed and,
on success, moves the booking to `CONFIRMED`. Verified live: `FAILED` then
`SUCCESS` correctly ends `CONFIRMED` with both `payments` rows present.

#### `POST /api/payments/webhook` — public (no user JWT)

Simulates an inbound callback from an external payment provider, which
wouldn't carry one of our users' JWTs. (A real integration would verify a
provider-supplied signature header instead — out of scope for a
simulation.)

Request: `{ "bookingId": "…", "providerEventId": "evt_12345", "status": "SUCCESS" }`

**Webhook idempotency**, using `payments.provider_event_id`'s unique index:

1. **Fast path:** before anything else, the handler checks whether a
   `payments` row with this `providerEventId` already exists. If so, it
   returns that existing payment/booking immediately (`idempotent: true`),
   without inserting anything or touching the booking's status again —
   covers a provider redelivering the same event sequentially.
2. **Race path:** if two deliveries of the same event arrive concurrently
   and both pass the fast-path check before either commits, the database's
   unique index rejects the second `INSERT`; that failure is caught, the
   losing transaction rolls back, and the handler re-reads the winning row
   and returns it the same way (`idempotent: true`).
3. Either way, **repeated events never create a second `payments` row and
   never re-apply a booking status change** — verified live by sending the
   same event twice and confirming the second response returns the
   identical `payment.id` with `idempotent: true`. Also verified live: a
   replay carrying a *different* claimed `bookingId`/`status` than the
   original event is still resolved to the **original** recorded payment —
   a reused event id can't be used to retroactively alter what actually
   happened.

Other behavior shared with `POST /api/payments`: `404` for an unknown
`bookingId`; `409` if the booking is `CONFIRMED` or `CANCELLED` (a new,
distinct event can't override an already-settled booking); `409` (via the
`payments_one_success_per_booking_idx` constraint) if a genuinely new event
somehow tries to record a second `SUCCESS` for one booking.

#### Transactions and locking, in one place

`POST /api/payments`, the webhook handler, and `PATCH /api/bookings/:id/cancel`
all wrap their read-modify-write sequence in a single `db.transaction(...)`,
with the booking row locked via `SELECT … FOR UPDATE` for the duration.
That lock is what actually serializes concurrent operations against the
*same* booking, whichever of the three they are — the second one simply
waits for the first transaction to commit, then sees the already-updated
status and is accepted/rejected accordingly by its own status checks. The
unique-constraint `catch` blocks in the payments service exist as a second,
defense-in-depth layer for edge cases that slip past that lock (e.g. two
different webhook events genuinely racing on `provider_event_id`).

## Assumptions

* **Cancellation and payments:** payments are simulated, so cancelling a
  `CONFIRMED` (paid) booking never claims a real refund was processed — the
  API response explicitly says so via the `note` field, and no `payments`
  row is modified, reversed, or deleted by a cancellation. A cancelled
  booking's payment history remains exactly as it happened.
* **Cancellable statuses:** `PENDING`, `FAILED`, and `CONFIRMED` bookings
  can all be cancelled; an already-`CANCELLED` booking cannot be cancelled
  again (`409`). There's no un-cancel.
* **Concurrency:** a cancellation and a payment attempt racing on the same
  booking are serialized by the same row lock (`SELECT … FOR UPDATE`) used
  everywhere else in the payments flow — whichever transaction acquires
  the lock first wins, and the other sees the already-updated status.
* **Admin promotion:** there is no signup field or API endpoint for
  becoming an `ADMIN` — it's a manual database update, by design, so a
  client can never self-elevate.
* **A test's centre is immutable after creation** (`PATCH /api/tests/:id`
  doesn't accept `centreId`) — reassigning a test to a different centre
  after bookings may already reference it is treated as a data-integrity
  hazard rather than a supported edit.
* **Booking price is a frozen snapshot** — an admin changing `tests.price`
  later never retroactively changes an existing booking's `amount`.

## Limitations and Possible Improvements

* No real payment gateway (explicitly out of scope for this assignment) —
  `POST /api/payments`'s `outcome` field and the webhook endpoint are both
  simulations.
* No refresh-token, logout/token-blocklist, or password-reset flow — a JWT
  is simply valid until it expires.
* No admin-management API (list/promote/demote users) — promotion is a
  manual SQL step (see [Local Setup, step 6](#6-promote-a-user-to-admin-optional)).
  A small admin-only "list users" / "set role" endpoint would be a natural
  next addition.
* No rate limiting on any endpoint (e.g. login, signup, payment attempts).
* Centre/test deletion is all-or-nothing (blocked entirely if any booking
  references it) rather than soft-deletion — sufficient for this
  assignment's scope, but a `deactivated_at`/`is_active` column with reads
  filtering it out would allow removing a centre/test from new bookings
  while keeping it fully intact for existing ones.
* No automated integration tests against a real (even if disposable)
  PostgreSQL database — the suite mocks the DB layer throughout; the
  DB-touching logic (transactions, locking, constraints) has instead been
  verified by hand against the live Supabase database, which isn't
  repeatable via `npm test`.
* No OpenAPI/Swagger spec or Postman collection — this README's
  [API Reference](#api-reference) is the only documentation.
* No CI configuration to run `npm test` automatically on push/PR.

## Commands Reference

```bash
npm run dev          # start with nodemon
npm start             # start with node
npm test               # run Jest test suite
npm run test:watch    # run Jest in watch mode
npm run db:generate   # generate a new migration from the schema
npm run db:migrate    # apply pending migrations
npm run db:seed        # insert sample centres/tests (idempotent)
```
