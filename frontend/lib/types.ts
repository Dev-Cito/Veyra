/** Shapes returned by the Veyra API (backend/), as serialised over JSON. */

export type Role = "OWNER" | "ADMIN" | "MEMBER";
export type InvitationRole = Exclude<Role, "OWNER">;

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  /** The caller's role in this workspace. */
  role: Role;
}

export interface Member {
  id: string;
  workspaceId: string;
  userId: string;
  role: Role;
  status: "PENDING" | "ACTIVE";
  invitedAt: string;
  joinedAt: string | null;
  user: User;
}

export interface Board {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  position: number;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TaskPriority = "LOW" | "MEDIUM" | "HIGH";

export interface TaskAssignee {
  id: string;
  taskId: string;
  userId: string;
  assignedAt: string;
  user: User;
}

export interface Task {
  id: string;
  listId: string;
  title: string;
  description: string | null;
  /** Server-owned ordering key: never sent, never displayed. */
  position: number;
  dueDate: string | null;
  priority: TaskPriority;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  assignees: TaskAssignee[];
}

export interface List {
  id: string;
  boardId: string;
  name: string;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface ListWithTasks extends List {
  /** Sorted by position. */
  tasks: Task[];
}

/** GET /boards/:id/full: the whole Kanban view, sorted, in one request. */
export interface FullBoard extends Board {
  /** Sorted by position. */
  lists: ListWithTasks[];
}

/**
 * A move endpoint's answer: the item as written (a moved task comes back
 * without its assignees). `reindexed`: its siblings were renumbered too.
 */
export type Moved<T> = T & { reindexed: boolean };

export interface DeletedList {
  id: string;
  deletedTasks: number;
}

export interface Invitation {
  id: string;
  workspaceId: string;
  email: string;
  role: InvitationRole;
  invitedById: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * The creation response also carries the raw invitation token. It is typed
 * here only to be ignored: never display it, store it or log it.
 */
export type CreatedInvitation = Invitation & {
  token: string;
  emailSent: boolean;
};

export interface InvitationPreview {
  workspaceName: string;
  role: InvitationRole;
  invitedByName: string | null;
  expiresAt: string;
}

export interface DeletedWorkspace {
  id: string;
  deletedBoards: number;
  deletedLists: number;
  deletedTasks: number;
  deletedMembers: number;
}

export interface RemovedMember {
  workspaceId: string;
  userId: string;
  removedAssignments: number;
}

export interface RevokedInvitation {
  id: string;
  email: string;
  revokedAt: string;
}
