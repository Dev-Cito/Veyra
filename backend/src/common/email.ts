/** Trim + lowercase: the one canonical form for storing and comparing emails. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
