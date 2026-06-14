# Morti

Open-source parametric furniture design for cabinets, shelves, wardrobes, and other panel-based pieces. Morti is local-first: projects are edited in the browser with Yjs and IndexedDB, then can optionally sync to a Postgres-backed cloud service for publishing, sharing, and remixing.

<p align="center">
  <img src="docs/assets/morti-demo.gif" alt="Morti furniture designer demo showing a parametric wardrobe in the 3D editor" width="900" />
</p>

<a href="https://www.digitalocean.com/?refcode=228d4bc321e8&utm_campaign=Referral_Invite&utm_medium=Referral_Program&utm_source=badge"><img src="https://web-platforms.sfo2.cdn.digitaloceanspaces.com/WWW/Badge%203.svg" alt="DigitalOcean Referral Badge" /></a>

## Features

- Parametric furniture editor with columns, shelves, drawers, doors, and metric constraints.
- Local-first project storage with `.morti` import/export.
- 3D assembly preview, technical rendering, and GLB/GLTF export.
- Cutlist and panel operation views for manufacturing-oriented output.
- Passwordless email sign-in, cloud sync, public publishing, demo projects, and remix counts.
- Optional Cloudflare Workers AI furniture generation.
- Optional PostHog or custom script analytics, disabled by default for self-hosted installs.

## Stack

- Nuxt 4, Vue 3, Nitro server routes, Nuxt UI, Tailwind CSS 4.
- Three.js and three-bvh-csg for rendering and generated panel geometry.
- Yjs for design documents and browser-side merge semantics.
- IndexedDB for local projects, editor state, undo checkpoints, and preview snapshots.
- Postgres for users, OTP challenges, sessions, cloud projects, published snapshots, and AI rate limits.
- Postmark for email OTP delivery.
- Docker and Docker Compose for local development and production deployment.

## Project Structure

```text
pages/              Nuxt routes for dashboard, editor, public viewer, render views
components/         App dialogs, project UI, cutlist UI, and Three.js canvases
composables/        Local storage, cloud sync, auth, editor state, and rendering helpers
server/api/         Nitro API routes for auth, projects, public projects, and AI generation
server/utils/       Postgres schema/bootstrap, auth, email, rate limiting, project helpers
shared/domain/      Furniture model, compiler, cutlist, hardware, materials, validation
shared/yjs/         Yjs document initialization, migrations, and .morti import/export
shared/idb/         IndexedDB adapter for local-first persistence
public/             Icons, logos, and bundled hardware model assets
scripts/            One-off operational scripts
```

## Requirements

- Node.js `>=22.18.0`
- npm
- Docker and Docker Compose for containerized development or deployment
- Postgres 16 or compatible Postgres service
- Postmark account for production email sign-in
- Optional Cloudflare account with Workers AI access

## Environment

Copy the example file when running without Docker:

```bash
cp .env.example .env
```

Important variables:

| Variable | Required | Notes |
| --- | --- | --- |
| `APP_BASE_URL` | Yes | Public app URL. Use `http://localhost:3000` for local dev and `https://your-domain.example` in production. |
| `NUXT_PUBLIC_APP_BASE_URL` | Production recommended | Public mirror of `APP_BASE_URL`; Compose files set this automatically. |
| `AUTH_SECRET` | Yes | At least 32 characters. Used for sessions, OTP hashes, and rate-limit hashes. |
| `DATABASE_URL` | Yes | Postgres connection string. Add `?sslmode=require` or set `PGSSLMODE=require` if your provider requires SSL. |
| `POSTGRES_PASSWORD` | Docker prod | Used by `docker-compose.prod.yml` for the bundled Postgres service. |
| `POSTMARK_SERVER_TOKEN` | Production auth | Required for OTP email unless you only use local dev bypass. |
| `POSTMARK_FROM_EMAIL` | Production auth | Must be a verified sender/domain in Postmark. |
| `POSTMARK_MESSAGE_STREAM` | No | Defaults to `outbound`. |
| `LOCAL_AUTH_BYPASS` | Dev only | Set `true` only for Nuxt dev mode on localhost. Ignored in production builds. |
| `CLOUDFLARE_ACCOUNT_ID` | Optional | Required only when AI furniture generation is enabled. |
| `CLOUDFLARE_AI_API_TOKEN` | Optional | Required only when AI furniture generation is enabled. |
| `CLOUDFLARE_AI_MODEL` | Optional | Defaults to `@cf/openai/gpt-oss-120b`. |
| `NUXT_PUBLIC_FEATURES_PROMPT_FURNITURE` | Optional | Set `true` to show the prompt-based furniture UI. |
| `NUXT_PUBLIC_POSTHOG_KEY` | Optional | Leave blank to disable PostHog. |
| `NUXT_PUBLIC_ANALYTICS_SCRIPT_SRC` | Optional | Custom analytics script URL. Leave blank to disable. |

The server creates and updates its Postgres schema on startup, so there is currently no separate migration command.

## Local Development

Start Postgres however you prefer, then install dependencies and run Nuxt:

```bash
npm ci
npm run dev
```

For a no-email local workflow, set these in `.env`:

```env
APP_BASE_URL=http://localhost:3000
AUTH_SECRET=morti-local-development-secret-change-me-32-chars
DATABASE_URL=postgres://morti:morti_dev_password@localhost:5432/morti
LOCAL_AUTH_BYPASS=true
```

`LOCAL_AUTH_BYPASS=true` only works in Nuxt dev mode on localhost. It lets contributors use the app without Postmark while developing.

## Local Docker

The default Compose file runs a Nuxt dev server plus Postgres with local auth bypass enabled:

```bash
docker compose up --build
```

If your Docker install still uses the legacy Compose binary, replace `docker compose` with `docker-compose`.

Open `http://localhost:3000`. Data is stored in Docker volumes named `morti_dev_postgres_data` and `morti_dev_node_modules`.

Useful commands:

```bash
docker compose logs -f app
docker compose down
docker compose down -v
```

Use `docker compose down -v` only when you want to delete the local Docker database volume.

## Production Docker

`docker-compose.prod.yml` builds the Nuxt production image and runs it behind a local-only port binding at `127.0.0.1:3000`. Put Caddy, Nginx, Traefik, or another reverse proxy in front of it for HTTPS.

On the server:

```bash
git clone https://github.com/your-org/morti.git
cd morti
cp .env.example .env
```

Edit `.env` for production:

```env
APP_BASE_URL=https://your-domain.example
AUTH_SECRET=generate-a-long-random-secret-at-least-32-chars
POSTGRES_PASSWORD=generate-a-long-random-postgres-password
POSTMARK_SERVER_TOKEN=your-postmark-token
POSTMARK_FROM_EMAIL=auth@your-domain.example
POSTMARK_MESSAGE_STREAM=outbound
NUXT_PUBLIC_FEATURES_PROMPT_FURNITURE=false
LOCAL_AUTH_BYPASS=false
AI_FURNITURE_ALLOW_LOCAL_UNAUTH=false
```

Generate secrets with:

```bash
openssl rand -base64 48
```

Start the production stack:

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f app
```

Example Nginx location:

```nginx
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

## DigitalOcean Deployment

Referral link: https://m.do.co/c/228d4bc321e8

The simplest DigitalOcean path is a Docker Droplet:

1. Create a Droplet with Docker preinstalled or install Docker on Ubuntu.
2. Point your DNS record at the Droplet.
3. Clone this repository on the Droplet.
4. Create `.env` from `.env.example` and set production values.
5. Run `docker compose -f docker-compose.prod.yml up -d --build`.
6. Put a reverse proxy with TLS in front of `127.0.0.1:3000`.

For DigitalOcean App Platform:

1. Create an App Platform app from this repository or from a container image.
2. Use the included `Dockerfile`.
3. Set the service HTTP port to `3000`.
4. Add a managed Postgres database and expose its connection string as `DATABASE_URL`.
5. Add `AUTH_SECRET`, `APP_BASE_URL`, `NUXT_PUBLIC_APP_BASE_URL`, Postmark variables, and any optional Cloudflare or analytics variables.
6. Redeploy after changing environment variables.

If you use a managed Postgres database that requires SSL, set `PGSSLMODE=require` or include `sslmode=require` in `DATABASE_URL`.

## AI Furniture Generation

The AI endpoint is disabled from the UI unless:

```env
NUXT_PUBLIC_FEATURES_PROMPT_FURNITURE=true
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_AI_API_TOKEN=...
```

Authenticated and verified users are rate limited per user, IP, and platform day. In dev mode only, `AI_FURNITURE_ALLOW_LOCAL_UNAUTH=true` allows local unauthenticated testing.

## Demo Import Script

The legacy demo import script is intentionally unconfigured by default:

```bash
DATABASE_URL=postgres://... \
POCKETBASE_DEMOS_URL='https://example.com/api/collections/projects/records?perPage=100' \
node scripts/import-pocketbase-demos.mjs
```

Set `DEMO_OWNER_ID` and `DEMO_OWNER_EMAIL` if you need a specific demo owner row.

## Development Checks

```bash
npm run typecheck
npm run build
```

## Data Notes

- Browser projects are stored locally in IndexedDB and can be exported as `.morti` files.
- The IndexedDB database name is still `madera` for backwards compatibility with older local projects.
- Cloud snapshots are stored in Postgres as binary Yjs updates.
- Published project routes only serve records with `visibility = public`, a non-deleted row, and a snapshot.

## Security Notes

- Never commit `.env`, `.secrets/`, deployment keys, or generated build output.
- Rotate any secret that was ever pushed to a public repository.
- Use HTTPS in production so `morti_session` cookies are sent securely.
- Keep `LOCAL_AUTH_BYPASS=false` and `AI_FURNITURE_ALLOW_LOCAL_UNAUTH=false` in production.

## License

MIT. See [LICENSE](LICENSE).
