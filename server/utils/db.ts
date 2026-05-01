import pg from 'pg'
import { createError } from 'h3'

const { Pool } = pg

let pool: pg.Pool | null = null
let migrationPromise: Promise<void> | null = null

function databaseUrl(): string {
  const config = useRuntimeConfig()
  const url = String(process.env.DATABASE_URL || config.databaseUrl || '')
  if (!url) {
    throw createError({
      statusCode: 503,
      statusMessage: 'DATABASE_URL is not configured.',
    })
  }
  return url
}

function sslConfig(url: string): pg.PoolConfig['ssl'] {
  if (process.env.PGSSLMODE === 'require' || /[?&]sslmode=require\b/i.test(url)) {
    return { rejectUnauthorized: false }
  }
  return undefined
}

export function getPool(): pg.Pool {
  if (!pool) {
    const url = databaseUrl()
    pool = new Pool({
      connectionString: url,
      ssl: sslConfig(url),
      max: 10,
      idleTimeoutMillis: 30_000,
    })
  }
  return pool
}

export async function ensureSchema(): Promise<void> {
  if (!migrationPromise) {
    migrationPromise = getPool().query(`
      CREATE TABLE IF NOT EXISTS users (
        id text PRIMARY KEY,
        email text NOT NULL,
        email_normalized text NOT NULL UNIQUE,
        email_verified_at timestamptz,
        is_admin boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS auth_sessions (
        id text PRIMARY KEY,
        user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash text NOT NULL UNIQUE,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        last_used_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS auth_sessions_token_hash_idx ON auth_sessions(token_hash);
      CREATE INDEX IF NOT EXISTS auth_sessions_user_id_idx ON auth_sessions(user_id);

      CREATE TABLE IF NOT EXISTS otp_challenges (
        id text PRIMARY KEY,
        email text NOT NULL,
        email_normalized text NOT NULL,
        code_hash text NOT NULL,
        ip_hash text NOT NULL,
        user_agent text,
        attempts integer NOT NULL DEFAULT 0,
        consumed_at timestamptz,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS otp_challenges_email_created_idx ON otp_challenges(email_normalized, created_at DESC);
      CREATE INDEX IF NOT EXISTS otp_challenges_ip_created_idx ON otp_challenges(ip_hash, created_at DESC);

      CREATE TABLE IF NOT EXISTS email_send_events (
        id bigserial PRIMARY KEY,
        email_normalized text NOT NULL,
        ip_hash text NOT NULL,
        purpose text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS email_send_events_email_created_idx ON email_send_events(email_normalized, created_at DESC);
      CREATE INDEX IF NOT EXISTS email_send_events_ip_created_idx ON email_send_events(ip_hash, created_at DESC);

      CREATE TABLE IF NOT EXISTS projects (
        id text PRIMARY KEY,
        owner_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name text NOT NULL,
        visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('public', 'private')),
        client_project_id text NOT NULL,
        source_project_id text REFERENCES projects(id) ON DELETE SET NULL,
        is_demo boolean NOT NULL DEFAULT false,
        remix_count integer NOT NULL DEFAULT 0,
        public_style text,
        snapshot bytea,
        snapshot_filename text,
        snapshot_content_type text,
        snapshot_updated_at timestamptz,
        published_at timestamptz,
        deleted_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (owner_id, client_project_id)
      );

      CREATE INDEX IF NOT EXISTS projects_owner_updated_idx ON projects(owner_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS projects_public_idx ON projects(visibility, published_at DESC) WHERE deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS projects_demo_idx ON projects(is_demo, visibility, updated_at DESC) WHERE deleted_at IS NULL;
    `).then(() => undefined)
  }
  await migrationPromise
}

export async function dbQuery<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  await ensureSchema()
  return await getPool().query<T>(text, params)
}

export async function withDbClient<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  await ensureSchema()
  const client = await getPool().connect()
  try {
    return await fn(client)
  }
  finally {
    client.release()
  }
}
