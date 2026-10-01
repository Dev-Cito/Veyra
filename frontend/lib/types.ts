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
