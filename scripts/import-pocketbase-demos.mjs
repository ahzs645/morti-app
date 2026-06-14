#!/usr/bin/env node
import { Buffer } from 'node:buffer'
import { createRequire } from 'node:module'

const require = createRequire(process.env.NODE_REQUIRE_FROM || import.meta.url)
const { Pool } = require('pg')

const OLD_DEMOS_URL = process.env.POCKETBASE_DEMOS_URL
const DEMO_OWNER_ID = process.env.DEMO_OWNER_ID || 'legacy_demo_owner'
const DEMO_OWNER_EMAIL = process.env.DEMO_OWNER_EMAIL || 'demo@example.invalid'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required.')
}

if (!OLD_DEMOS_URL) {
  throw new Error('POCKETBASE_DEMOS_URL is required.')
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
})

function apiOrigin(url) {
  const parsed = new URL(url)
  return `${parsed.protocol}//${parsed.host}`
}

async function fetchJson(url) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${await response.text()}`)
  }
  return await response.json()
}

async function fetchBuffer(url) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${await response.text()}`)
  }
  return {
    body: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get('content-type') || 'application/octet-stream',
  }
}

function dateOrNull(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${value}`)
  }
  return date.toISOString()
}

function publicStyle(value) {
  if (value === null || value === undefined || value === '') return null
  return typeof value === 'string' ? value : JSON.stringify(value)
}

async function loadRecords() {
  const records = []
  let page = 1
  let totalPages = 1

  while (page <= totalPages) {
    const url = new URL(OLD_DEMOS_URL)
    url.searchParams.set('page', String(page))
    const data = await fetchJson(url.toString())
    records.push(...(data.items || []))
    totalPages = Number(data.totalPages || 1)
    page += 1
  }

  return records
}

async function main() {
  const records = await loadRecords()
  const origin = apiOrigin(OLD_DEMOS_URL)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `
        INSERT INTO users (id, email, email_normalized, email_verified_at, is_admin)
        VALUES ($1, $2, $3, now(), false)
        ON CONFLICT (id) DO UPDATE
        SET email = EXCLUDED.email,
            email_normalized = EXCLUDED.email_normalized,
            email_verified_at = COALESCE(users.email_verified_at, now()),
            updated_at = now()
      `,
      [DEMO_OWNER_ID, DEMO_OWNER_EMAIL, DEMO_OWNER_EMAIL.toLowerCase()],
    )

    let imported = 0
    for (const record of records) {
      if (!record.id || !record.client_project_id || !record.snapshot) {
        console.warn(`Skipping incomplete record ${record.id || '(missing id)'}`)
        continue
      }

      const fileUrl = `${origin}/api/files/${record.collectionId}/${record.id}/${encodeURIComponent(record.snapshot)}`
      const snapshot = await fetchBuffer(fileUrl)

      await client.query(
        `
          INSERT INTO projects (
            id,
            owner_id,
            name,
            visibility,
            client_project_id,
            source_project_id,
            is_demo,
            remix_count,
            public_style,
            snapshot,
            snapshot_filename,
            snapshot_content_type,
            snapshot_updated_at,
            published_at,
            deleted_at,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, null, true, $6, $7, $8, $9, $10, $11, $12, null, $13, $14)
          ON CONFLICT (id) DO UPDATE
          SET owner_id = EXCLUDED.owner_id,
              name = EXCLUDED.name,
              visibility = EXCLUDED.visibility,
              client_project_id = EXCLUDED.client_project_id,
              source_project_id = EXCLUDED.source_project_id,
              is_demo = EXCLUDED.is_demo,
              remix_count = EXCLUDED.remix_count,
              public_style = EXCLUDED.public_style,
              snapshot = EXCLUDED.snapshot,
              snapshot_filename = EXCLUDED.snapshot_filename,
              snapshot_content_type = EXCLUDED.snapshot_content_type,
              snapshot_updated_at = EXCLUDED.snapshot_updated_at,
              published_at = EXCLUDED.published_at,
              deleted_at = EXCLUDED.deleted_at,
              created_at = LEAST(projects.created_at, EXCLUDED.created_at),
              updated_at = EXCLUDED.updated_at
        `,
        [
          record.id,
          DEMO_OWNER_ID,
          String(record.name || 'Untitled project').slice(0, 160),
          record.visibility === 'private' ? 'private' : 'public',
          record.client_project_id,
          Number(record.remix_count || 0),
          publicStyle(record.public_style),
          snapshot.body,
          record.snapshot,
          snapshot.contentType,
          dateOrNull(record.updated),
          dateOrNull(record.published_at),
          dateOrNull(record.created) || new Date().toISOString(),
          dateOrNull(record.updated) || new Date().toISOString(),
        ],
      )

      imported += 1
      console.log(`Imported ${record.name || record.id} (${snapshot.body.length} bytes)`)
    }

    await client.query('COMMIT')

    const count = await pool.query(
      `
        SELECT count(*)::integer AS count
        FROM projects
        WHERE is_demo = true
          AND visibility = 'public'
          AND deleted_at IS NULL
          AND snapshot IS NOT NULL
      `,
    )
    console.log(`Done. Imported ${imported} records. Demo projects in Postgres: ${count.rows[0].count}`)
  }
  catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
  finally {
    client.release()
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
