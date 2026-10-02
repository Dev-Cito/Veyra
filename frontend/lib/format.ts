import type { Role, TaskPriority } from "./types";

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

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  HIGH: "Haute",
  MEDIUM: "Moyenne",
  LOW: "Basse",
};

const DAY = 24 * 3600 * 1000;
const TIME = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
const SHORT_DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
const SHORT_DATE_YEAR = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const startOfDay = (time: number) => new Date(time).setHours(0, 0, 0, 0);

/** "Aujourd'hui, 14:00", "Demain, 09:30", "12 oct.", "3 janv. 2027". */
export function formatDue(iso: string, now: number): string {
  const due = new Date(iso);
  const days = Math.round((startOfDay(due.getTime()) - startOfDay(now)) / DAY);
  if (days === 0) {
    return `Aujourd'hui, ${TIME.format(due)}`;
  }
  if (days === 1) {
    return `Demain, ${TIME.format(due)}`;
  }
  if (days === -1) {
    return `Hier, ${TIME.format(due)}`;
  }
  return due.getFullYear() === new Date(now).getFullYear()
    ? SHORT_DATE.format(due)
    : SHORT_DATE_YEAR.format(due);
}

/** Due within the next 24 hours, or already overdue: the ember tone. */
export const isDueSoon = (iso: string, now: number) => new Date(iso).getTime() - now < DAY;

/** ISO -> the value of an <input type="datetime-local">, in local time. */
export function toLocalInput(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The other way round; null for an empty or incomplete value. */
export function fromLocalInput(value: string): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Deleting a task: its creator, or whoever manages the workspace. */
export const canDeleteTask = (
  role: Role | undefined,
  userId: string | undefined,
  task: { createdById: string | null },
) => canManage(role) || (userId !== undefined && task.createdById === userId);

/** "1 carte", "3 cartes". */
export const cards = (count: number) => `${count} carte${count > 1 ? "s" : ""}`;
