# Count of Monte Cristo Experience

An interactive experience inspired by Alexandre Dumas's _The Count of Monte Cristo_.

## Stack

- **Next.js 16** (App Router, React 19, TypeScript) on **Vercel**
- **Supabase** for auth and data (`@supabase/ssr`)
- **Cloudflare R2** for object storage (S3-compatible API from API routes)

Frontend setup follows patterns from [stock-tracker](https://github.com/ashleyyoung/stock-tracker) (`dashboard/`).

## Prerequisites

- Node.js 20+
- A Supabase project
- A Vercel account
- A Cloudflare account (R2 storage only)

## Setup

```bash
yarn install
cp .env.example .env.local
```

Fill in `.env.local`. See `.env.example` for the full list.

## Development

```bash
yarn dev
```

Open [http://localhost:3001](http://localhost:3001).

## Deploy on Vercel

Deploys are automated through Vercel's GitHub integration for [count-of-monte-cristo-experience](https://github.com/ashleyyoung/count-of-monte-cristo-experience):

- **Production:** merge to `main`
- **Preview:** open a pull request or push a branch

One-time setup in the [Vercel dashboard](https://vercel.com/new): import the GitHub repo, confirm the framework preset (Next.js), and add environment variables for Preview and Production.

Required env vars: Supabase keys, R2 credentials, `NEXT_PUBLIC_SITE_URL`. See `.env.example`.

For local env sync after the project is linked:

```bash
vercel env pull .env.local
```

## Cloudflare R2

App data bucket: `count-of-monte-cristo-experience` (separate from Stock Pixie).

Set `R2_BUCKET_NAME=count-of-monte-cristo-experience` in `.env.local` and on Vercel.

## Scripts

| Script           | Description                               |
| ---------------- | ----------------------------------------- |
| `yarn dev`       | Next.js dev server (Turbopack, port 3001) |
| `yarn build`     | Production Next.js build                  |
| `yarn typecheck` | TypeScript check                          |
| `yarn check`     | Lint + typecheck                          |

## Project layout

```
app/                 Next.js App Router pages
lib/supabase/        Supabase browser, server, and session helpers
proxy.ts             Session refresh (Next.js 16 proxy)
```
