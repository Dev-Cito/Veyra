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

## The board (`/w/:workspaceId/b/:boardId`)

- One request for the whole board (`GET …/boards/:id/full`); every edit is
  merged into that cached board rather than refetched.
- **No `position` is ever sent**: the server is the only authority on it. A
  move names the neighbours the item was dropped between
  (`previousTaskId` / `nextTaskId`, `previousListId` / `nextListId`), computed by
  `lib/neighbours.ts` from the index dnd-kit reports (`lib/board-dnd.ts`). Both
  are unit-tested: `pnpm test`.
- Moves are optimistic (the card is in place the moment it is dropped) and
  serialised per board: a second drop shows at once but its request waits for
  the first. A refused move puts the card back **and says why** (409: the
  column changed, 404: something was deleted, 403: rights changed).
- Keyboard: Space or Enter grabs a card (or a column by its header), the arrows
  move it, Space or Enter drops it, Escape cancels. The pointer and the
  keyboard go through the same drop handler and send the same request.
- The open card is in the URL (`?task=…`): shareable, and the back button
  closes the panel.

## Known limitations

- **No touch drag and drop.** Below 768px the columns become tabs, and a card
  moves through its "•••" menu, "Déplacer vers…", which appends it to the
  chosen column. Dragging with a finger is out of scope for now.
- "Déplacer vers…" always appends: to place a card precisely, drag it (or use
  the keyboard) on a larger screen.

## Scripts

`pnpm dev` · `pnpm build` · `pnpm start` · `pnpm lint` · `pnpm typecheck` · `pnpm test`
