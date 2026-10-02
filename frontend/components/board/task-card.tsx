"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MoreHorizontal } from "lucide-react";
import { Avatar, Pill } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNow } from "@/hooks/use-now";
import { canDeleteTask, formatDue, isDueSoon, PRIORITY_LABELS } from "@/lib/format";
import type { Task } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useBoardContext } from "./board-context";

const PRIORITY_TONE = { HIGH: "ember", MEDIUM: "plum", LOW: "stone" } as const;

/** What a card shows. No position: an implementation detail. */
export function TaskCardContent({ task }: { task: Task }) {
  const { userId } = useBoardContext();
  const now = useNow();
  const mine = userId !== undefined && task.assignees.some((a) => a.userId === userId);
  const soon = task.dueDate !== null && now !== null && isDueSoon(task.dueDate, now);

  return (
    <>
      {/* pr: room for the "•••" button, which sits over the card. */}
      <p className="line-clamp-2 pr-6 text-[13px] leading-snug font-medium text-ink">{task.title}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Pill tone={PRIORITY_TONE[task.priority]}>
          <span className="sr-only">Priorité </span>
          {PRIORITY_LABELS[task.priority]}
        </Pill>
        {task.dueDate && now !== null && (
          <Pill tone={soon ? "ember" : "stone"}>
            <span className="sr-only">Échéance </span>
            <span className="tabular-nums">{formatDue(task.dueDate, now)}</span>
          </Pill>
        )}
        {mine && <Pill tone="teal">Vous</Pill>}
      </div>
      {task.assignees.length > 0 && (
        <div className="mt-2.5 flex items-center">
          <span className="sr-only">
            Assignée à {task.assignees.map((a) => a.user.name).join(", ")}
          </span>
          {task.assignees.map((assignee, index) => (
            <span key={assignee.id} title={assignee.user.name} className={cn(index > 0 && "-ml-[7px]")}>
              <Avatar name={assignee.user.name} size={21} className="ring-2 ring-surface" />
            </span>
          ))}
        </div>
      )}
    </>
  );
}

const cardSurface = "rounded-card bg-surface px-[13px] py-3 shadow-card";

/** The "•••" menu of a card: open, move to another column, delete (if allowed). */
export function TaskMenu({ task, className }: { task: Task; className?: string }) {
  const { role, userId, openTask, moveTaskTo, deleteTask } = useBoardContext();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          className={cn("text-ink-3 hover:text-ink", className)}
          aria-label={`Actions pour la carte ${task.title}`}
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => openTask(task.id)}>Ouvrir</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => moveTaskTo(task.id)}>Déplacer vers…</DropdownMenuItem>
        {/* Hidden, not disabled: the API would answer 403. */}
        {canDeleteTask(role, userId, task) && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => deleteTask(task.id)}>
              Supprimer
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A card without drag and drop (mobile): click to open, "•••" to move. */
export function StaticTaskCard({ task }: { task: Task }) {
  const { openTask } = useBoardContext();
  return (
    <div className="relative mb-[9px]">
      <button
        type="button"
        onClick={() => openTask(task.id)}
        className={cn(cardSurface, "block w-full text-left")}
      >
        <TaskCardContent task={task} />
      </button>
      <TaskMenu task={task} className="absolute top-2 right-2" />
    </div>
  );
}

/**
 * A draggable card. The card itself is the drag activator (pointer and
 * keyboard); its "•••" menu is a sibling over it, not a child, so the two are
 * not nested interactive elements and the menu never starts a drag. While
 * dragged, the card in the column becomes the drop slot; the DragOverlay
 * shows the card under the pointer.
 */
export function SortableTask({
  task,
  disabled,
  reducedMotion,
}: {
  task: Task;
  /** Another kind of item (a column) is being dragged: not a drop target. */
  disabled: boolean;
  reducedMotion: boolean;
}) {
  const { openTask } = useBoardContext();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({
      id: task.id,
      data: { type: "task", listId: task.listId },
      disabled: { draggable: false, droppable: disabled },
      attributes: { roleDescription: "carte déplaçable" },
      transition: reducedMotion ? null : undefined,
    });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className="relative mb-[9px]"
    >
      <div
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        onClick={() => openTask(task.id)}
        className={cn(
          "cursor-pointer touch-manipulation",
          isDragging
            ? "h-16 rounded-card border-2 border-dashed border-plum bg-plum-soft"
            : cardSurface,
        )}
      >
        {/* Kept mounted (focus returns to this card after a keyboard drop). */}
        <div className={cn(isDragging && "sr-only")}>
          <TaskCardContent task={task} />
        </div>
      </div>
      {!isDragging && <TaskMenu task={task} className="absolute top-2 right-2" />}
    </div>
  );
}

/** The card under the pointer while dragging: the app's only rotation and strong shadow. */
export function TaskDragOverlay({ task, reducedMotion }: { task: Task; reducedMotion: boolean }) {
  return (
    <div
      className={cn(cardSurface, "w-[218px] cursor-grabbing", !reducedMotion && "rotate-[-1.2deg]")}
      style={{ boxShadow: "0 10px 24px rgba(26, 29, 33, 0.15)" }}
    >
      <TaskCardContent task={task} />
    </div>
  );
}
