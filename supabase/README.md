# Supabase Setup Guide

This directory contains the database migrations and configuration for DivulgaLinks.
You can use either a local PostgreSQL container (default) or Supabase Cloud.

---

## Option A — Local PostgreSQL (default, development)

No extra steps needed. `docker-compose up` brings up a Postgres 16 container and
the `db-migrate` service applies all Prisma migrations on startup.

---

## Option B — Supabase Cloud (recommended for production)

### 1. Create a Supabase project

Go to [supabase.com](https://supabase.com) and create a new project.
Choose the **South America (São Paulo)** region for lowest latency from Brazil.

### 2. Retrieve connection details

In the Supabase dashboard go to **Project Settings → Database**.

| Setting | Where to find it |
|---|---|
| `DATABASE_URL` (direct) | Connection string → **URI** tab |
| `DATABASE_URL` (pooled) | Connection pooling → **URI** tab |
| `DIRECT_URL` | Connection string → **URI** tab (same as direct) |
| `SUPABASE_URL` | Project Settings → API → Project URL |
| `SUPABASE_ANON_KEY` | Project Settings → API → `anon` `public` key |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API → `service_role` key |

### 3. Configure environment variables

Copy `.env.example` to `.env` and fill in the Supabase values:

```env
# Use the pooler URL for DATABASE_URL (pgBouncer, port 6543)
DATABASE_URL=postgresql://postgres.YOURREF:PASSWORD@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true

# Use the direct URL for DIRECT_URL (Prisma migrations need a direct connection)
DIRECT_URL=postgresql://postgres:PASSWORD@db.YOURREF.supabase.co:5432/postgres

SUPABASE_URL=https://YOURREF.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### 4. Apply migrations

#### Via Supabase CLI (recommended)

```bash
# Install the CLI
npm install -g supabase

# Link to your remote project
supabase link --project-ref YOUR_PROJECT_REF

# Push migrations
supabase db push
```

#### Via Docker (db-migrate service)

```bash
docker-compose run --rm db-migrate
```

#### Via psql directly

```bash
psql "$DIRECT_URL" -f supabase/migrations/20240101000000_initial_schema.sql
psql "$DIRECT_URL" -f supabase/migrations/20240101000001_rls_policies.sql
```

### 5. (Optional) Load sample data

```bash
psql "$DIRECT_URL" -f supabase/seed.sql
```

---

## Migration files

| File | Description |
|---|---|
| `migrations/20240101000000_initial_schema.sql` | All enums, tables, indexes, and `updatedAt` triggers |
| `migrations/20240101000001_rls_policies.sql` | Row Level Security — grants full access to `service_role` |
| `seed.sql` | Sample admin user and platforms (development only) |
| `config.toml` | Supabase CLI local development configuration |

---

## Notes

- The backend connects using the **service_role** key (or a direct Postgres URI), so RLS
  is either bypassed automatically or covered by the service-role policies.
- Never commit real secrets to `.env`. Only `.env.example` is tracked by git.
- For Prisma migrations in CI/CD, always set both `DATABASE_URL` (pooler) and
  `DIRECT_URL` (direct connection) so `prisma migrate deploy` works correctly.
