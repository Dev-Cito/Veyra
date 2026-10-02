"use client";

import { Plus } from "lucide-react";
import { useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState, KanbanMotif } from "@/components/app/primitives";
import { BoardSkeleton } from "@/components/app/skeletons";
import { Button } from "@/components/ui/button";
import { useMe } from "@/hooks/use-auth";
import { useBoard } from "@/hooks/use-board";
import { useIsMobile } from "@/hooks/use-media-query";
import { useMembers } from "@/hooks/use-members";
import { useTaskParam } from "@/hooks/use-task-param";
import { useWorkspace } from "@/hooks/use-workspaces";
import { isApiError } from "@/lib/api";
import { findTask } from "@/lib/board-cache";
import { canManage } from "@/lib/format";
import type { FullBoard, ListWithTasks } from "@/lib/types";
import { BoardCanvas } from "./board-canvas";
import { BoardContext, useBoardContext, type BoardContextValue } from "./board-context";
import { DeleteListDialog, DeleteTaskDialog, ListComposer, MoveToDialog } from "./board-dialogs";
import { MobileBoard } from "./mobile-board";
import { TaskPanel } from "./task-panel";

/** /w/[workspaceId]/b/[boardId]: the Kanban board. Under a <Suspense> (useTaskParam). */
export function BoardView({ workspaceId, boardId }: { workspaceId: string; boardId: string }) {
  const board = useBoard(workspaceId, boardId);

  if (board.isPending) {
    return (
      <>
        <PageHeader title={<span className="text-ink-3">Chargement…</span>} />
        <div className="min-h-0 flex-1">
          <BoardSkeleton />
        </div>
      </>
    );
  }
  if (board.isError) {
    // 400 (malformed id), 403, 404: one state, in the page, never a toast.
    const missing = [400, 403, 404].some((status) => isApiError(board.error, status));
    return (
      <>
        <PageHeader title={missing ? "Tableau introuvable" : "Tableau"} />
        <div className="flex flex-1 items-center justify-center bg-surface">
          {missing ? (
            <EmptyState
              title="Ce tableau est introuvable"
              action={
                <Button asChild>
                  <Link href={`/w/${workspaceId}`}>Voir les tableaux</Link>
                </Button>
              }
            >
              Il a peut-être été supprimé, ou le lien est incomplet.
            </EmptyState>
          ) : (
            <EmptyState
              title="Le tableau n'a pas pu être chargé"
              action={<Button onClick={() => void board.refetch()}>Réessayer</Button>}
            >
              Le serveur n&apos;a pas répondu. Vos cartes ne sont pas perdues.
            </EmptyState>
          )}
        </div>
      </>
    );
  }
  return <LoadedBoard workspaceId={workspaceId} board={board.data} />;
}

function LoadedBoard({ workspaceId, board }: { workspaceId: string; board: FullBoard }) {
  const workspace = useWorkspace(workspaceId);
  const me = useMe();
  const members = useMembers(workspaceId);
  const isMobile = useIsMobile();
  const reducedMotion = useReducedMotion() ?? false;
  const { taskId, open, close } = useTaskParam();

  const [addingList, setAddingList] = useState(false);
  const [movingTaskId, setMovingTaskId] = useState<string | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [deletingList, setDeletingList] = useState<ListWithTasks | null>(null);

  const role = workspace.data?.role;
  const manager = canManage(role);
  const activeMembers = useMemo(
    () => (members.data ?? []).filter((member) => member.status === "ACTIVE"),
    [members.data],
  );

  const context: BoardContextValue = {
    workspaceId,
    boardId: board.id,
    boardName: board.name,
    role,
    userId: me.data?.id,
    manager,
    activeMembers,
    openTask: open,
    moveTaskTo: setMovingTaskId,
    deleteTask: setDeletingTaskId,
    addList: () => setAddingList(true),
  };

  const deleteList = (list: ListWithTasks) => setDeletingList(list);
  const movingTask = movingTaskId ? (findTask(board, movingTaskId)?.task ?? null) : null;
  const deletingTask = deletingTaskId ? (findTask(board, deletingTaskId)?.task ?? null) : null;

  return (
    <BoardContext.Provider value={context}>
      <PageHeader title={board.name} />
      <div className="min-h-0 flex-1">
        {isMobile ? (
          <MobileBoard
            board={board}
            addingList={manager && addingList}
            onAddingListChange={setAddingList}
            onDeleteList={deleteList}
          />
        ) : board.lists.length === 0 ? (
          <EmptyBoard adding={manager && addingList} onAddingChange={setAddingList} />
        ) : (
          <BoardCanvas
            board={board}
            reducedMotion={reducedMotion}
            onDeleteList={deleteList}
            trailing={manager && <GhostColumn adding={addingList} onAddingChange={setAddingList} />}
          />
        )}
      </div>

      <TaskPanel board={board} taskId={taskId} onClose={close} />
      <MoveToDialog board={board} task={movingTask} onOpenChange={(next) => !next && setMovingTaskId(null)} />
      <DeleteTaskDialog
        task={deletingTask}
        onOpenChange={(next) => !next && setDeletingTaskId(null)}
        onDeleted={(id) => id === taskId && close()}
      />
      <DeleteListDialog list={deletingList} onOpenChange={(next) => !next && setDeletingList(null)} />
    </BoardContext.Provider>
  );
}

/** "+ Colonne", after the last column: OWNER and ADMIN only. */
function GhostColumn({ adding, onAddingChange }: { adding: boolean; onAddingChange: (adding: boolean) => void }) {
  const self = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (adding) {
      self.current?.scrollIntoView({ block: "nearest", inline: "end" });
    }
  }, [adding]);
  return (
    <div ref={self} className="w-[238px] shrink-0 pr-[18px]">
      {adding ? (
        <ListComposer onClose={() => onAddingChange(false)} />
      ) : (
        <button
          type="button"
          onClick={() => onAddingChange(true)}
          className="flex h-10 w-[238px] items-center gap-1.5 rounded-panel bg-transparent px-3 text-[13px] font-medium text-ink-3 transition-colors hover:bg-stone hover:text-ink"
        >
          <Plus className="size-4" aria-hidden="true" />
          Colonne
        </button>
      )}
    </div>
  );
}

function EmptyBoard({ adding, onAddingChange }: { adding: boolean; onAddingChange: (adding: boolean) => void }) {
  const { manager } = useBoardContext();
  return (
    <div className="flex h-full items-center justify-center bg-surface">
      {manager ? (
        <EmptyState
          title="Ajoutez votre première colonne"
          illustration={<KanbanMotif />}
          action={
            adding ? (
              <ListComposer className="w-[238px] text-left" onClose={() => onAddingChange(false)} />
            ) : (
              <Button onClick={() => onAddingChange(true)}>
                <Plus aria-hidden="true" />
                Ajouter une colonne
              </Button>
            )
          }
        >
          Une colonne par étape du travail : à faire, en cours, terminé. Les cartes passent de
          l&apos;une à l&apos;autre en glisser-déposer.
        </EmptyState>
      ) : (
        <EmptyState title="Ce tableau n'a pas encore de colonne" illustration={<KanbanMotif />}>
          Les propriétaires et administrateurs créent les colonnes. Vous pourrez y ajouter des cartes
          dès que la première existera.
        </EmptyState>
      )}
    </div>
  );
}
