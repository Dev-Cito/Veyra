import type { Role } from "./types";

/** "Équipe Produit" -> "ÉP", "acme" -> "AC". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return "?";
  }
  const letters =
    words.length === 1
      ? Array.from(words[0]).slice(0, 2)
      : [Array.from(words[0])[0], Array.from(words[1])[0]];
  return letters.join("").toLocaleUpperCase("fr-FR");
}

const DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });
const DATE_TIME = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export const formatDate = (iso: string) => DATE.format(new Date(iso));
export const formatDateTime = (iso: string) => DATE_TIME.format(new Date(iso));

export const ROLE_LABELS: Record<Role | "PENDING", string> = {
  OWNER: "Propriétaire",
  ADMIN: "Administrateur",
  MEMBER: "Membre",
  PENDING: "En attente",
};

/** What a role lets you do, in concrete terms. */
export const ROLE_CAPABILITIES: Record<Role, string> = {
  OWNER: "Gère tout l'espace, y compris sa suppression et les propriétaires",
  ADMIN: "Gère aussi les tableaux et les membres",
  MEMBER: "Crée et déplace des cartes",
};

export const canManage = (role: Role | undefined) => role === "OWNER" || role === "ADMIN";
