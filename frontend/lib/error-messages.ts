import { ApiError, type FieldErrors } from "./api";

/**
 * French copy for API errors. The API answers in English (its e2e tests and
 * the Bruno collection rely on those messages), so the interface owns its
 * own wording, indexed by HTTP status and by the action being attempted.
 * The server's message is only a fallback, for a case not foreseen here.
 */

export type ErrorContext =
  | "login"
  | "register"
  | "createWorkspace"
  | "renameWorkspace"
  | "deleteWorkspace"
  | "createBoard"
  | "invite"
  | "revokeInvitation"
  | "previewInvitation"
  | "acceptInvitation"
  | "updateRole"
  | "removeMember"
  | "leaveWorkspace"
  | "logout";

/** Same status, same action, two different states: the caller says which. */
export interface ErrorHints {
  /** 409 on invite: the email belongs to a member, or already has an invitation. */
  inviteConflict?: "member" | "pending";
}

const LAST_OWNER =
  "Cet espace doit garder au moins un propriétaire actif. Nommez-en un autre d'abord.";

type Copy = Partial<Record<ErrorContext | "default", string>>;

const COPY: Record<number, Copy> = {
  400: {
    default: "Certaines informations sont invalides. Vérifiez le formulaire.",
  },
  401: {
    login: "Email ou mot de passe incorrect.",
    default: "Votre session a expiré. Reconnectez-vous.",
  },
  403: {
    invite: "Seul un propriétaire peut inviter un administrateur.",
    acceptInvitation: "Cette invitation ne concerne pas ce compte.",
    updateRole: "Votre rôle ne vous permet pas de modifier ce membre.",
    removeMember: "Votre rôle ne vous permet pas de retirer ce membre.",
    deleteWorkspace: "Seul un propriétaire peut supprimer l'espace.",
    default: "Votre rôle dans cet espace ne permet pas cette action.",
  },
  404: {
    previewInvitation: "Cette invitation n'est plus valide.",
    acceptInvitation: "Cette invitation n'est plus valide.",
    revokeInvitation: "Cette invitation n'existe plus.",
    default: "Cet élément n'existe plus. Rechargez la page.",
  },
  409: {
    register: "Un compte existe déjà avec cet email.",
    updateRole: LAST_OWNER,
    removeMember: LAST_OWNER,
    leaveWorkspace: LAST_OWNER,
    acceptInvitation: "Vous faites déjà partie de cet espace.",
    createWorkspace: "L'espace n'a pas pu être créé pour l'instant. Réessayez.",
  },
  429: {
    default: "Trop de tentatives. Réessayez dans une minute.",
  },
};

const SERVER_ERROR = "Le serveur a rencontré un problème. Votre action n'a pas été enregistrée.";

export function errorMessage(
  error: unknown,
  context?: ErrorContext,
  hints: ErrorHints = {},
): string {
  if (!(error instanceof ApiError)) {
    return "Une erreur inattendue s'est produite.";
  }
  if (error.isNetworkError) {
    return error.message; // already French (see lib/api.ts), and dev-aware
  }
  if (error.status >= 500) {
    return SERVER_ERROR;
  }
  if (error.status === 409 && context === "invite") {
    return hints.inviteConflict === "member"
      ? "Cette personne fait déjà partie de l'espace."
      : "Une invitation est déjà en attente pour cet email.";
  }
  if (error.status === 409 && context === "revokeInvitation") {
    // Same status and action for both states: the server's wording tells them apart.
    return /accepted/i.test(error.message)
      ? "Cette invitation a déjà été acceptée : la personne est membre de l'espace."
      : "Cette invitation a déjà été révoquée.";
  }
  const copy = COPY[error.status];
  return (context && copy?.[context]) ?? copy?.default ?? error.message;
}

/** Validation messages, per field, in French; the server's for an unknown field. */
const FIELD_COPY: Record<string, string> = {
  email: "Saisissez une adresse email valide.",
  password: "Le mot de passe doit contenir entre 8 et 72 caractères.",
  name: "Le nom doit contenir entre 1 et 100 caractères.",
  description: "La description est trop longue.",
  role: "Choisissez un rôle.",
};

export function fieldErrorMessages(errors: FieldErrors): FieldErrors {
  const french: FieldErrors = {};
  for (const [field, messages] of Object.entries(errors)) {
    french[field] = FIELD_COPY[field] ? [FIELD_COPY[field]] : messages;
  }
  return french;
}
