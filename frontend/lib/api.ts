// Fails the build if a Server Component ever imports this module: the session
// cookie belongs to the API's domain, only the browser can send it.
import "client-only";
import type {
  Board,
  CreatedInvitation,
  DeletedList,
  DeletedWorkspace,
  FullBoard,
  Invitation,
  InvitationPreview,
  InvitationRole,
  List,
  Member,
  Moved,
  RemovedMember,
  RevokedInvitation,
  Role,
  Task,
  TaskAssignee,
  TaskPriority,
  User,
  Workspace,
} from "./types";

/**
 * The single point of contact with the Veyra API.
 *
 * Every call runs in the BROWSER, with credentials: 'include': the session is
 * an httpOnly cookie owned by the API's domain, which neither the Next server
 * nor document.cookie can read. Authentication state comes from GET /auth/me
 * only. Never import this module from a Server Component.
 */

const BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "");

/** Validation messages, keyed by field ("email", "password"...). */
export type FieldErrors = Partial<Record<string, string[]>>;

export class ApiError extends Error {
  /** 0 for a network failure (no response at all). */
  readonly status: number;
  readonly fieldErrors: FieldErrors;

  constructor(status: number, message: string, fieldErrors: FieldErrors = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }

  get isServerError(): boolean {
    return this.status === 0 || this.status >= 500;
  }
}

export function isApiError(error: unknown, status?: number): error is ApiError {
  return (
    error instanceof ApiError && (status === undefined || error.status === status)
  );
}

/**
 * NestJS error bodies: { statusCode, message, error }. On a 400 from the
 * validation pipe, `message` is an array of sentences that start with the
 * field name ("email must be an email"): those become field errors.
 */
function toApiError(status: number, body: unknown): ApiError {
  const raw = (body as { message?: unknown } | null)?.message;
  const messages = Array.isArray(raw)
    ? raw.filter((m): m is string => typeof m === "string")
    : typeof raw === "string"
      ? [raw]
      : [];

  const fieldErrors: FieldErrors = {};
  if (status === 400 && Array.isArray(raw)) {
    for (const message of messages) {
      const field = /^([A-Za-z][\w.]*)\s/.exec(message)?.[1] ?? "form";
      (fieldErrors[field] ??= []).push(message);
    }
  }
  const message = messages[0] ?? `La requête a échoué (${status}).`;
  return new ApiError(status, message, fieldErrors);
}

async function request<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      credentials: "include",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // No response at all: a network failure, or CORS refusing this origin (the
    // browser reports both the same way). In development, name the suspects.
    throw new ApiError(
      0,
      process.env.NODE_ENV === "development"
        ? "L'API est injoignable : serveur arrêté, ou CORS qui refuse cette origine. Vérifiez FRONTEND_URL (backend) et NEXT_PUBLIC_API_URL (frontend)."
        : "Le serveur ne répond pas. Vérifiez votre connexion.",
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw toApiError(response.status, data);
  }
  return data as T;
}

const get = <T>(path: string) => request<T>("GET", path);
const post = <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {});
const patch = <T>(path: string, body: unknown) => request<T>("PATCH", path, body);
const del = <T>(path: string) => request<T>("DELETE", path);

/** PATCH /tasks/:id. `null` clears the description or the due date. */
export interface TaskChanges {
  title?: string;
  description?: string | null;
  dueDate?: string | null;
  priority?: TaskPriority;
}

const ws = (workspaceId: string) => `/workspaces/${encodeURIComponent(workspaceId)}`;

export const api = {
  auth: {
    me: () => get<User>("/auth/me"),
    login: (body: { email: string; password: string }) =>
      post<User>("/auth/login", body),
    register: (body: { email: string; name: string; password: string; timezone?: string }) =>
      post<User>("/auth/register", body),
    logout: () => post<void>("/auth/logout"),
  },

  workspaces: {
    list: () => get<Workspace[]>("/workspaces"),
    get: (workspaceId: string) => get<Workspace>(ws(workspaceId)),
    create: (body: { name: string }) => post<Workspace>("/workspaces", body),
    rename: (workspaceId: string, body: { name: string }) =>
      patch<Workspace>(ws(workspaceId), body),
    remove: (workspaceId: string) => del<DeletedWorkspace>(ws(workspaceId)),
  },

  members: {
    list: (workspaceId: string) => get<Member[]>(`${ws(workspaceId)}/members`),
    updateRole: (workspaceId: string, memberId: string, body: { role: Role }) =>
      patch<Member>(`${ws(workspaceId)}/members/${encodeURIComponent(memberId)}`, body),
    remove: (workspaceId: string, memberId: string) =>
      del<RemovedMember>(`${ws(workspaceId)}/members/${encodeURIComponent(memberId)}`),
  },

  boards: {
    list: (workspaceId: string) => get<Board[]>(`${ws(workspaceId)}/boards`),
    create: (workspaceId: string, body: { name: string; description?: string }) =>
      post<Board>(`${ws(workspaceId)}/boards`, body),
    full: (workspaceId: string, boardId: string) =>
      get<FullBoard>(`${ws(workspaceId)}/boards/${encodeURIComponent(boardId)}/full`),
  },

  // No `position` anywhere below: the server is its only authority. Moves
  // name the neighbours the item was dropped between (lib/neighbours.ts).
  lists: {
    create: (workspaceId: string, boardId: string, body: { name: string }) =>
      post<List>(`${ws(workspaceId)}/boards/${encodeURIComponent(boardId)}/lists`, body),
    rename: (workspaceId: string, listId: string, body: { name: string }) =>
      patch<List>(`${ws(workspaceId)}/lists/${encodeURIComponent(listId)}`, body),
    move: (
      workspaceId: string,
      listId: string,
      body: { previousListId: string | null; nextListId: string | null },
    ) => patch<Moved<List>>(`${ws(workspaceId)}/lists/${encodeURIComponent(listId)}/move`, body),
    remove: (workspaceId: string, listId: string) =>
      del<DeletedList>(`${ws(workspaceId)}/lists/${encodeURIComponent(listId)}`),
  },

  tasks: {
    create: (workspaceId: string, listId: string, body: { title: string }) =>
      post<Task>(`${ws(workspaceId)}/lists/${encodeURIComponent(listId)}/tasks`, body),
    update: (workspaceId: string, taskId: string, body: TaskChanges) =>
      patch<Task>(`${ws(workspaceId)}/tasks/${encodeURIComponent(taskId)}`, body),
    move: (
      workspaceId: string,
      taskId: string,
      body: { targetListId: string; previousTaskId: string | null; nextTaskId: string | null },
    ) => patch<Moved<Task>>(`${ws(workspaceId)}/tasks/${encodeURIComponent(taskId)}/move`, body),
    remove: (workspaceId: string, taskId: string) =>
      del<{ id: string }>(`${ws(workspaceId)}/tasks/${encodeURIComponent(taskId)}`),
    assign: (workspaceId: string, taskId: string, userId: string) =>
      post<TaskAssignee>(`${ws(workspaceId)}/tasks/${encodeURIComponent(taskId)}/assignees`, {
        userId,
      }),
    unassign: (workspaceId: string, taskId: string, userId: string) =>
      del<{ taskId: string; userId: string }>(
        `${ws(workspaceId)}/tasks/${encodeURIComponent(taskId)}/assignees/${encodeURIComponent(userId)}`,
      ),
  },

  invitations: {
    listPending: (workspaceId: string) =>
      get<Invitation[]>(`${ws(workspaceId)}/invitations`),
    create: (workspaceId: string, body: { email: string; role: InvitationRole }) =>
      post<CreatedInvitation>(`${ws(workspaceId)}/invitations`, body),
    revoke: (workspaceId: string, invitationId: string) =>
      del<RevokedInvitation>(
        `${ws(workspaceId)}/invitations/${encodeURIComponent(invitationId)}`,
      ),
    // The token is a bearer secret: always in the body, never in a URL.
    preview: (token: string) => post<InvitationPreview>("/invitations/preview", { token }),
    accept: (token: string) => post<Workspace>("/invitations/accept", { token }),
  },
};
