# Veyra — frontend

Next.js (App Router) client for the Veyra API in `../backend`.

## Run it locally

```bash
# 1. The API must be running on http://localhost:3001 (see ../backend)
# 2. Then, from this folder:
pnpm install
cp .env.example .env.local   # NEXT_PUBLIC_API_URL=http://localhost:3001
pnpm dev                     # http://localhost:3000
```

The backend's `FRONTEND_URL` must match this app's origin (`http://localhost:3000`
locally): CORS is locked to it, with credentials.

## How data flows

- Every API call is made **from the browser**, through `lib/api.ts`, with
  `credentials: 'include'`. The session is an httpOnly cookie owned by the API's
  domain: neither the Next server nor `document.cookie` can read it, so
  authentication state comes from `GET /auth/me` only.
- Server Components only render structure; data lives in react-query hooks
  (`hooks/`), in client components.
- The global error policy (400 fields, 401 sign-in, 403/409/429 toasts, 404 page
  states, 5xx retry) is in `app/providers.tsx`.

## Scripts

`pnpm dev` · `pnpm build` · `pnpm start` · `pnpm lint`
