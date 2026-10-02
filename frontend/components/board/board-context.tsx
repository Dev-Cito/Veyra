"use client";

import { createContext, useContext } from "react";
import type { Member, Role } from "@/lib/types";

/**
 * What every piece of the board needs: where it is, who is looking, and what
 * they may do. The role is the workspace query's (re-read on every 403), never
 * a copy kept here.
 */
export interface BoardContextValue {
  workspaceId: string;
  boardId: string;
  boardName: string;
  role: Role | undefined;
  userId: string | undefined;
  /** OWNER or ADMIN: columns can be created, renamed, deleted and reordered. */
  manager: boolean;
  /** ACTIVE members only: the only ones the API lets us assign. */
  activeMembers: Member[];
  openTask: (taskId: string) => void;
  /** Opens "Déplacer vers…" for a card. */
  moveTaskTo: (taskId: string) => void;
  /** Asks to confirm, then deletes a card. */
  deleteTask: (taskId: string) => void;
  /** Opens the "new column" composer at the end of the board. */
  addList: () => void;
}

export const BoardContext = createContext<BoardContextValue | null>(null);

export function useBoardContext(): BoardContextValue {
  const value = useContext(BoardContext);
  if (!value) {
    throw new Error("useBoardContext must be used under <BoardContext>");
  }
  return value;
}
