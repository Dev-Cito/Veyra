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
  | "logout"
  | "createList"
  | "renameList"
  | "deleteList"
  | "moveList"
  | "createTask"
  | "updateTask"
  | "deleteTask"
  | "moveTask"
  | "assignTask"
  | "unassignTask";

/** Same status, same action, two different states: the caller says which. */
export interface ErrorHints {
  /** 409 on invite: the email belongs to a member, or already has an invitation. */
  inviteConflict?: "member" | "pending";
}

const MANAGERS_ONLY_LISTS =
  "Seuls les propriétaires et les administrateurs gèrent les colonnes. Vos droits ont été actualisés.";
const BOARD_REFRESHED = "Le tableau a été actualisé.";

const LAST_OWNER =
  "Cet espace doit garder au moins un propriétaire actif. Nommez-en un autre d'abord.";

type Copy = Partial<Record<ErrorContext | "default", string>>;

const COPY: Record<number, Copy> = {
  400: {
    createTask: "Le titre doit contenir entre 1 et 200 caractères.",
    updateTask: "Cette modification n'est pas valide. Vérifiez le champ modifié.",
    createList: "Le nom doit contenir entre 1 et 100 caractères.",
    renameList: "Le nom doit contenir entre 1 et 100 caractères.",
    assignTask: "Seuls les membres actifs de l'espace peuvent être assignés.",
    // A bug in the neighbours computation, not a user mistake.
    moveTask: "Le déplacement n'a pas pu être enregistré. La carte a repris sa place.",
    moveList: "Le déplacement n'a pas pu être enregistré. La colonne a repris sa place.",
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
    createList: MANAGERS_ONLY_LISTS,
    renameList: MANAGERS_ONLY_LISTS,
    deleteList: MANAGERS_ONLY_LISTS,
    moveList: MANAGERS_ONLY_LISTS,
    deleteTask:
      "Seuls l'auteur de la carte, les propriétaires et les administrateurs peuvent la supprimer.",
    moveTask: "Vous ne pouvez plus modifier ce tableau. La carte a repris sa place.",
    default: "Votre rôle dans cet espace ne permet pas cette action.",
  },
  404: {
    previewInvitation: "Cette invitation n'est plus valide.",
    acceptInvitation: "Cette invitation n'est plus valide.",
    revokeInvitation: "Cette invitation n'existe plus.",
    renameList: `Cette colonne n'existe plus. ${BOARD_REFRESHED}`,
    deleteList: `Cette colonne n'existe plus. ${BOARD_REFRESHED}`,
    moveList: `Cette colonne n'existe plus. ${BOARD_REFRESHED}`,
    createTask: `Cette colonne n'existe plus. ${BOARD_REFRESHED}`,
    updateTask: `Cette carte n'existe plus. ${BOARD_REFRESHED}`,
    deleteTask: `Cette carte n'existe plus. ${BOARD_REFRESHED}`,
    assignTask: `Cette carte n'existe plus. ${BOARD_REFRESHED}`,
    unassignTask: `Cette personne n'était déjà plus assignée. ${BOARD_REFRESHED}`,
    default: "Cet élément n'existe plus. Rechargez la page.",
  },
  409: {
    register: "Un compte existe déjà avec cet email.",
    updateRole: LAST_OWNER,
    removeMember: LAST_OWNER,
    leaveWorkspace: LAST_OWNER,
    acceptInvitation: "Vous faites déjà partie de cet espace.",
    createWorkspace: "L'espace n'a pas pu être créé pour l'instant. Réessayez.",
    moveTask: `Cette colonne a changé entre-temps. ${BOARD_REFRESHED}`,
    moveList: `Ce tableau a changé entre-temps. ${BOARD_REFRESHED}`,
    assignTask: `Cette personne est déjà assignée, ou n'existe plus. ${BOARD_REFRESHED}`,
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
  if (error.status === 404 && context === "moveTask") {
    // The moved card, its target column or a neighbour: the server says which.
    return /list/i.test(error.message)
      ? `Cette colonne n'existe plus. ${BOARD_REFRESHED}`
      : `Cette carte, ou sa voisine, n'existe plus. ${BOARD_REFRESHED}`;
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
  title: "Le titre doit contenir entre 1 et 200 caractères.",
  dueDate: "Saisissez une date valide.",
};

export function fieldErrorMessages(errors: FieldErrors): FieldErrors {
  const french: FieldErrors = {};
  for (const [field, messages] of Object.entries(errors)) {
    french[field] = FIELD_COPY[field] ? [FIELD_COPY[field]] : messages;
  }
  return french;
}
