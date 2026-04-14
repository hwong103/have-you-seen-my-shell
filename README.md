# Have You Seen My Shell?

An infinite collaborative children's book built on Cloudflare. Readers can read for free, but only one reader can turn the current last page by choosing one of three words. That word steers the next AI-generated page.

## Stack

- Frontend: React + TypeScript + Vite
- API/Backend: Cloudflare Worker + Hono
- State: D1 + KV + Durable Objects
- AI text: `@cf/meta/llama-3.3-70b-instruct`
- AI image: `@cf/black-forest-labs/flux-1-schnell`

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Create Cloudflare resources and update `wrangler.toml`:

- `d1_databases[0].database_id`
- `kv_namespaces[0].id`

3. Apply migration and seed:

```bash
npm run d1:migrate
npm run d1:seed
```

4. Build frontend assets and run worker:

```bash
npm run build
npm run dev:worker
```

5. Open the app and routes:

- `/1` for page 1
- `/api/bible` to inspect the current story bible

## Important Notes

- The worker caches fully-rendered pages (`image_status = done`) in KV forever.
- Page turns are race-safe using `UPDATE ... WHERE chosen_word IS NULL`.
- Generation runs in the background via `ctx.executionCtx.waitUntil(...)`.
- If image generation fails, reading still continues (`image_status = failed`).
- If Vite cannot build in a local path containing `?`, run from a path without `?`.
