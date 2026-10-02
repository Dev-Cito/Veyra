"use client";

import { Check, Loader2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCreateList, useDeleteList, useDeleteTask, useMoveTask } from "@/hooks/use-board";
import { cards } from "@/lib/format";
import { neighbours } from "@/lib/neighbours";
import type { FullBoard, ListWithTasks, Task } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useBoardContext } from "./board-context";

function ConfirmDialog({
  open,
  onOpenChange,
  title,
  children,
  confirmLabel,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  pending: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{children}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The count comes from the board on screen; the toast confirms the server's (deletedTasks). */
export function DeleteListDialog({
  list,
  onOpenChange,
}: {
  list: ListWithTasks | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { workspaceId, boardId } = useBoardContext();
  const remove = useDeleteList(workspaceId, boardId);
  const count = list?.tasks.length ?? 0;
  return (
    <ConfirmDialog
      open={list !== null}
      onOpenChange={onOpenChange}
      title={`Supprimer la colonne ${list?.name ?? ""} ?`}
      confirmLabel={count > 0 ? `Supprimer la colonne et ${cards(count)}` : "Supprimer la colonne"}
      pending={remove.isPending}
      onConfirm={() =>
        list &&
        remove.mutate(list.id, {
          onSuccess: ({ deletedTasks }) => {
            toast.success(
              deletedTasks > 0
                ? `Colonne ${list.name} supprimée, avec ${cards(deletedTasks)}.`
                : `Colonne ${list.name} supprimée.`,
            );
            onOpenChange(false);
          },
        })
      }
    >
      {count > 0
        ? `Ses ${cards(count)} seront supprimées définitivement, avec la colonne.`
        : "Elle ne contient aucune carte. La suppression est définitive."}
    </ConfirmDialog>
  );
}

export function DeleteTaskDialog({
  task,
  onOpenChange,
  onDeleted,
}: {
  task: Task | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: (taskId: string) => void;
}) {
  const { workspaceId, boardId } = useBoardContext();
  const remove = useDeleteTask(workspaceId, boardId);
  return (
    <ConfirmDialog
      open={task !== null}
      onOpenChange={onOpenChange}
      title="Supprimer cette carte ?"
      confirmLabel="Supprimer la carte"
      pending={remove.isPending}
      onConfirm={() =>
        task &&
        remove.mutate(task.id, {
          onSuccess: () => {
            toast.success("Carte supprimée.");
            onOpenChange(false);
            onDeleted(task.id);
          },
        })
      }
    >
      « {task?.title} » sera supprimée définitivement, avec ses assignations.
    </ConfirmDialog>
  );
}

/**
 * "Déplacer vers…": the way to move a card without drag and drop (touch
 * screens, or by choice). Appends to the chosen column, through the same
 * neighbours() and the same move mutation as a drop.
 */
export function MoveToDialog({
  board,
  task,
  onOpenChange,
}: {
  board: FullBoard;
  task: Task | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { workspaceId, boardId } = useBoardContext();
  const move = useMoveTask(workspaceId, boardId);

  const moveTo = (target: ListWithTasks) => {
    if (!task) {
      return;
    }
    // The end of the target, the task itself excluded (neighbours filters it).
    const end = target.tasks.filter((t) => t.id !== task.id).length;
    move.mutate({ taskId: task.id, targetListId: target.id, ...neighbours(target.tasks, task.id, end) });
    onOpenChange(false);
  };

  return (
    <Dialog open={task !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Déplacer vers…</DialogTitle>
          <DialogDescription>
            La carte « {task?.title} » ira à la fin de la colonne choisie.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-1">
          {board.lists.map((list) => {
            const here = list.id === task?.listId;
            return (
              <li key={list.id}>
                <button
                  type="button"
                  disabled={here}
                  onClick={() => moveTo(list)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-button px-3 py-2.5 text-left text-[14px] text-ink transition-colors hover:bg-stone disabled:cursor-default disabled:hover:bg-transparent",
                    here && "text-ink-3",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{list.name}</span>
                  {here ? (
                    <span className="flex items-center gap-1 text-[12px]">
                      <Check className="size-3.5" aria-hidden="true" />
                      Colonne actuelle
                    </span>
                  ) : (
                    <span className="text-[12px] text-ink-3 tabular-nums">{cards(list.tasks.length)}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

/**
 * New column, inline: Enter creates and stays open for the next one, Escape
 * closes. The server appends it after the last column.
 */
export function ListComposer({ onClose, className }: { onClose: () => void; className?: string }) {
  const { workspaceId, boardId } = useBoardContext();
  const create = useCreateList(workspaceId, boardId);
  const [name, setName] = useState("");
  return (
    <div className={cn("rounded-panel bg-stone p-[10px]", className)}>
      <input
        autoFocus
        maxLength={100}
        value={name}
        onChange={(event) => setName(event.target.value)}
        onBlur={() => !name.trim() && onClose()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            const value = name.trim();
            if (value) {
              create.mutate(value);
              setName("");
            }
          } else if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
        aria-label="Nom de la nouvelle colonne"
        placeholder="Nom de la colonne…"
        className="h-8 w-full rounded-button border border-rail bg-surface px-2 text-[13px] font-semibold text-ink outline-none focus-visible:border-plum"
      />
      <p className="mt-1.5 text-[11px] text-ink-3">Entrée pour créer, Échap pour fermer</p>
    </div>
  );
}
