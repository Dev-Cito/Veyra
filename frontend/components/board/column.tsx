"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MoreHorizontal, Plus } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCreateTask, useRenameList } from "@/hooks/use-board";
import { columnDropId, listSortId } from "@/lib/board-dnd";
import type { ListWithTasks, Task } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useBoardContext } from "./board-context";
import { SortableTask } from "./task-card";

export type DragKind = "task" | "list" | null;

/** Header: name, count, "•••". `handle` makes the name area the column's drag handle. */
export function ColumnHeader({
  list,
  count,
  handleRef,
  handleProps,
  onDelete,
}: {
  list: ListWithTasks;
  count: number;
  /** The column's drag handle (the name area), for OWNER and ADMIN. */
  handleRef?: (node: HTMLElement | null) => void;
  handleProps?: Record<string, unknown>;
  onDelete: (list: ListWithTasks) => void;
}) {
  const { manager, addList } = useBoardContext();
  const [renaming, setRenaming] = useState(false);

  return (
    <header className="mb-2 flex min-h-7 items-center gap-1">
      {renaming ? (
        <RenameField list={list} onDone={() => setRenaming(false)} />
      ) : (
        <div
          ref={handleRef}
          {...handleProps}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 rounded-button px-1 py-0.5",
            handleProps && "cursor-grab active:cursor-grabbing",
          )}
        >
          <h2 className="truncate text-[13px] font-semibold text-ink" title={list.name}>
            {list.name}
          </h2>
          <span className="rounded-[20px] bg-[#E6E4DE] px-[7px] py-px text-[11px] font-medium text-ink-2 tabular-nums">
            <span className="sr-only">, </span>
            {count}
            <span className="sr-only"> {count > 1 ? "cartes" : "carte"}</span>
          </span>
        </div>
      )}
      {/* Members cannot rename, delete or add columns (403): no menu at all. */}
      {manager && !renaming && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className="ml-auto text-ink-3 hover:text-ink"
              aria-label={`Actions pour la colonne ${list.name}`}
            >
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setRenaming(true)}>Renommer</DropdownMenuItem>
            <DropdownMenuItem onSelect={addList}>Nouvelle colonne</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => onDelete(list)}>
              Supprimer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </header>
  );
}

function RenameField({ list, onDone }: { list: ListWithTasks; onDone: () => void }) {
  const { workspaceId, boardId } = useBoardContext();
  const rename = useRenameList(workspaceId, boardId);
  const [value, setValue] = useState(list.name);

  const save = () => {
    const name = value.trim();
    if (name && name !== list.name) {
      rename.mutate({ listId: list.id, name });
    }
    onDone();
  };

  return (
    <input
      autoFocus
      aria-label="Nom de la colonne"
      value={value}
      maxLength={100}
      onChange={(event) => setValue(event.target.value)}
      onFocus={(event) => event.currentTarget.select()}
      onBlur={save}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          save();
        } else if (event.key === "Escape") {
          onDone();
        }
      }}
      className="h-7 min-w-0 flex-1 rounded-button border border-rail bg-surface px-1.5 text-[13px] font-semibold text-ink outline-none focus-visible:border-plum"
    />
  );
}

/** The "+" button under the header: any member can add a card. */
export function AddCardButton({ list, onClick }: { list: ListWithTasks; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Ajouter une carte dans ${list.name}`}
      className="mb-2.5 flex h-7 w-full shrink-0 items-center justify-center rounded-[8px] bg-[#EBE9E3] text-ink-2 transition-colors hover:bg-hair hover:text-ink"
    >
      <Plus className="size-4" aria-hidden="true" />
    </button>
  );
}

/**
 * Inline card creation: Enter creates and keeps the field open for the next
 * one, Escape closes it. New cards are appended by the server, so the field
 * sits where they appear: at the end of the column.
 */
export function TaskComposer({ listId, onClose }: { listId: string; onClose: () => void }) {
  const { workspaceId, boardId } = useBoardContext();
  const create = useCreateTask(workspaceId, boardId);
  const [title, setTitle] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    field.current?.scrollIntoView({ block: "nearest" });
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const value = title.trim();
      if (value) {
        create.mutate({ listId, title: value });
        setTitle("");
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div className="mb-[9px] rounded-card bg-surface px-[13px] py-2.5 shadow-card">
      <textarea
        ref={field}
        autoFocus
        rows={2}
        maxLength={200}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => !title.trim() && onClose()}
        aria-label="Titre de la nouvelle carte"
        placeholder="Titre de la carte…"
        className="block w-full resize-none bg-transparent text-[13px] leading-snug font-medium text-ink outline-none"
      />
      <p className="mt-1 text-[11px] text-ink-3">Entrée pour créer, Échap pour fermer</p>
    </div>
  );
}

/** Shown in a column with no card: the drop zone stays, and says so. */
export function EmptyColumnHint({ children }: { children: ReactNode }) {
  return (
    <p className="flex min-h-16 items-center justify-center rounded-card border border-dashed border-rail px-3 text-center text-[12px] text-ink-3">
      {children}
    </p>
  );
}

const columnShell = "flex max-h-full w-[238px] shrink-0 flex-col rounded-panel bg-stone p-[10px]";

/**
 * A desktop column: sortable among columns (by its header, for OWNER and
 * ADMIN only), and a drop zone for cards, empty or not.
 */
export function SortableColumn({
  list,
  taskIds,
  tasksById,
  dragKind,
  reducedMotion,
  onDelete,
}: {
  list: ListWithTasks;
  /** The column's cards in their current order (the drag's, while dragging). */
  taskIds: string[];
  tasksById: Map<string, Task>;
  dragKind: DragKind;
  reducedMotion: boolean;
  onDelete: (list: ListWithTasks) => void;
}) {
  const { manager } = useBoardContext();
  const [composing, setComposing] = useState(false);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: listSortId(list.id),
    data: { type: "list", listId: list.id },
    disabled: { draggable: !manager, droppable: dragKind === "task" },
    attributes: { roleDescription: "colonne déplaçable" },
    transition: reducedMotion ? null : undefined,
  });
  const { setNodeRef: setBodyRef } = useDroppable({
    id: columnDropId(list.id),
    data: { type: "column", listId: list.id },
    disabled: dragKind === "list",
  });

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      aria-label={list.name}
      className={cn(
        columnShell,
        // The drop slot while dragged; content kept mounted (keyboard focus
        // returns to the header after the drop) but hidden.
        isDragging && "border-2 border-dashed border-plum bg-plum-soft *:invisible",
      )}
    >
      <ColumnHeader
        list={list}
        count={taskIds.length}
        onDelete={onDelete}
        handleRef={manager ? setActivatorNodeRef : undefined}
        handleProps={manager ? { ...attributes, ...listeners } : undefined}
      />
      <AddCardButton list={list} onClick={() => setComposing(true)} />
      <div ref={setBodyRef} className="-mx-1 min-h-16 flex-1 overflow-y-auto px-1 pt-px">
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          {taskIds.map((id) => {
            const task = tasksById.get(id);
            return (
              task && (
                <SortableTask key={id} task={task} disabled={dragKind === "list"} reducedMotion={reducedMotion} />
              )
            );
          })}
        </SortableContext>
        {taskIds.length === 0 && !composing && (
          <EmptyColumnHint>Aucune carte. Déposez-en une ici, ou ajoutez-la avec +.</EmptyColumnHint>
        )}
        {composing && <TaskComposer listId={list.id} onClose={() => setComposing(false)} />}
      </div>
    </section>
  );
}

/** The column under the pointer while reordering columns. */
export function ColumnDragOverlay({ list, tasks }: { list: ListWithTasks; tasks: Task[] }) {
  return (
    <div className={cn(columnShell, "max-h-[60vh] cursor-grabbing overflow-hidden shadow-card")}>
      <div className="mb-2 flex items-center gap-2 px-1">
        <p className="truncate text-[13px] font-semibold text-ink">{list.name}</p>
        <span className="rounded-[20px] bg-[#E6E4DE] px-[7px] py-px text-[11px] font-medium text-ink-2 tabular-nums">
          {tasks.length}
        </span>
      </div>
      {tasks.slice(0, 6).map((task) => (
        <div key={task.id} className="mb-[9px] rounded-card bg-surface px-[13px] py-3 shadow-card">
          <p className="line-clamp-2 text-[13px] font-medium text-ink">{task.title}</p>
        </div>
      ))}
    </div>
  );
}
