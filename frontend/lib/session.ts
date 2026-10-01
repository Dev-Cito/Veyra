/**
 * Sends the user to /login once, however many requests answer 401 at the
 * same time.
 *
 * Every caller (the global error policy, the /w guard) goes through here.
 * Calling router.replace again while a navigation is under way restarts it,
 * and clearing the query cache while the page is still mounted makes its
 * observers refetch: together they looped on GET /auth/me without ever
 * reaching /login (in dev, where /login takes a while to compile).
 */

type Router = { replace: (href: string) => void };

const NAVIGATION_GRACE_MS = 5_000;
let redirectingSince = 0;

export function redirectToLogin(router: Router): void {
  if (typeof window === "undefined" || window.location.pathname === "/login") {
    return;
  }
  const now = Date.now();
  if (now - redirectingSince < NAVIGATION_GRACE_MS) {
    return; // already on its way
  }
  redirectingSince = now;
  router.replace("/login");
}

/** A new session started: a later 401 must redirect again. */
export function resetLoginRedirect(): void {
  redirectingSince = 0;
}
