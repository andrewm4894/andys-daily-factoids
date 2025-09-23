# Frontend (Next.js)

This directory hosts the new Next.js + TypeScript frontend for Andy's Daily Factoids. It consumes the Django API served from `http://localhost:8000/api` (configurable via `NEXT_PUBLIC_FACTOIDS_API_BASE`).

## Getting started

```bash
cd frontend
npm install
npm run dev
```

Helpful commands:

- `npm run lint` – ESLint with the Next.js config
- `npm run build` / `npm start` – production build & serve

For local development, start the backend first:

```bash
make migrate-backend
make local-backend
```

Set up environment variables by copying `.env.local.example` to `.env.local` and adjusting values as needed.
