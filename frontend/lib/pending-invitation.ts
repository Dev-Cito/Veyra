/**
 * Carries an invitation token across the sign-up / sign-in detour, in this
 * tab only, and nothing more.
 *
 * Single-use and owned by the invitation flow:
 * - written ONLY by /invite, when the user chooses to create an account or to
 *   sign in in order to accept;
 * - erased as soon as /invite reads it back, before any acceptance attempt,
 *   and when /invite unmounts without handing it off.
 * So a link opened then abandoned leaves nothing behind: a later, ordinary
 * sign-in goes to /w, not to /invite.
 */

const TOKEN_KEY = "veyra.invitation";

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null; // storage disabled (private mode, policies)
  }
}

export const pendingInvitation = {
  /** /invite only: the user is leaving to sign in or up, to come back and accept. */
  handOff(token: string) {
    try {
      storage()?.setItem(TOKEN_KEY, token);
    } catch {
      // Without storage the detour cannot resume; the email link still works.
    }
  },
  /** Is an acceptance waiting? Does not consume it (see /invite for that). */
  isWaiting(): boolean {
    try {
      return Boolean(storage()?.getItem(TOKEN_KEY));
    } catch {
      return false;
    }
  },
  /** Reads without erasing: /invite erases it right after, in an effect. */
  peek(): string | null {
    try {
      return storage()?.getItem(TOKEN_KEY) ?? null;
    } catch {
      return null;
    }
  },
  clear() {
    try {
      storage()?.removeItem(TOKEN_KEY);
    } catch {
      // Nothing to clear.
    }
  },
};
