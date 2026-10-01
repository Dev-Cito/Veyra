/**
 * Keeps an invitation token across the sign-up / sign-in detour, in this tab
 * only. The token arrives once in /invite?token=…; it is moved here and the
 * address bar is cleaned, so it travels through no other URL.
 */

const TOKEN_KEY = "veyra.invitation";
const ACCEPT_KEY = "veyra.invitation.accept";

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null; // storage disabled (private mode, policies)
  }
}

export const pendingInvitation = {
  get(): string | null {
    try {
      return storage()?.getItem(TOKEN_KEY) ?? null;
    } catch {
      return null;
    }
  },
  set(token: string) {
    try {
      storage()?.setItem(TOKEN_KEY, token);
    } catch {
      // Without storage the flow still works on this page, just not across a detour.
    }
  },
  /** Ask /invite to accept as soon as the user is signed in. */
  requestAcceptance() {
    try {
      storage()?.setItem(ACCEPT_KEY, "1");
    } catch {
      // Same as above.
    }
  },
  /** Reads and clears the acceptance request. */
  takeAcceptanceRequest(): boolean {
    try {
      const requested = storage()?.getItem(ACCEPT_KEY) === "1";
      storage()?.removeItem(ACCEPT_KEY);
      return requested;
    } catch {
      return false;
    }
  },
  clear() {
    try {
      storage()?.removeItem(TOKEN_KEY);
      storage()?.removeItem(ACCEPT_KEY);
    } catch {
      // Nothing to clear.
    }
  },
};
