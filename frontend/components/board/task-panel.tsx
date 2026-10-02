"use client";

import { Plus, Trash2, X } from "lucide-react";
import { motion } from "motion/react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useRef, useState, type ReactNode } from "react";
import { Avatar } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAssignTask, useUnassignTask, useUpdateTask } from "@/hooks/use-board";
import { useMembers } from "@/hooks/use-members";
import type { TaskChanges } from "@/lib/api";
import { findTask } from "@/lib/board-cache";
import { canDeleteTask, fromLocalInput, PRIORITY_LABELS, toLocalInput } from "@/lib/format";
import type { FullBoard, ListWithTasks, Task, TaskPriority } from "@/lib/types";
import { useBoardContext } from "./board-context";

const PRIORITIES: TaskPriority[] = ["HIGH", "MEDIUM", "LOW"];

/**
 * The detail drawer, open while the URL carries ?task={id}: 368px on the
 * right with the board dimmed behind it, full screen on mobile.
 */
export function TaskPanel({
  board,
  taskId,
  onClose,
}: {
  board: FullBoard;
  taskId: string | null;
  onClose: () => void;
}) {
  const found = taskId ? findTask(board, taskId) : null;
  return (
    <DialogPrimitive.Root open={taskId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[rgba(26,29,33,0.14)]" />
        <DialogPrimitive.Content
          asChild
          aria-describedby={undefined}
          // Escape in a field being edited cancels the edit, not the panel.
          onEscapeKeyDown={(event) => {
            const focused = document.activeElement;
            if (focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement) {
              event.preventDefault();
            }
          }}
        >
          <motion.aside
            initial={{ x: 24, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
            className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-surface md:inset-y-0 md:right-0 md:left-auto md:w-[368px] md:border-l md:border-hair"
          >
            <DialogPrimitive.Close asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="absolute top-3 right-3 text-ink-3"
                aria-label="Fermer le détail"
              >
                <X aria-hidden="true" />
              </Button>
            </DialogPrimitive.Close>
            {found ? (
              // Keyed: switching card resets every field being edited.
              <TaskDetail key={found.task.id} board={board} task={found.task} list={found.list} />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                <DialogPrimitive.Title className="font-display text-[19px] font-bold text-ink">
                  Cette carte n&apos;existe plus
                </DialogPrimitive.Title>
                <p className="text-[14px] text-ink-2">
                  Elle a peut-être été supprimée, ou elle appartient à un autre tableau.
                </p>
                <Button variant="outline" onClick={onClose}>
                  Revenir au tableau
                </Button>
              </div>
            )}
          </motion.aside>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function TaskDetail({ board, task, list }: { board: FullBoard; task: Task; list: ListWithTasks }) {
  const { workspaceId, boardId, role, userId, deleteTask } = useBoardContext();
  const update = useUpdateTask(workspaceId, boardId);
  const save = (changes: TaskChanges) => update.mutate({ taskId: task.id, changes });

  return (
    <div className="flex flex-col gap-5 px-6 pt-5 pb-8">
      <div className="flex flex-col gap-1.5 pr-8">
        <p className="truncate text-[11px] text-ink-3">
          {board.name} · {list.name}
        </p>
        <DialogPrimitive.Title className="sr-only">{task.title}</DialogPrimitive.Title>
        <InlineText
          label="Titre de la carte"
          value={task.title}
          maxLength={200}
          required
          onSave={(title) => save({ title })}
          className="font-display text-[19px] leading-snug font-bold text-ink"
        />
      </div>

      <dl className="grid grid-cols-[96px_1fr] items-center gap-x-3 gap-y-3 text-[13px]">
        <Row label="Échéance">
          <DueDateField task={task} onSave={(dueDate) => save({ dueDate })} />
        </Row>
        <Row label="Priorité">
          <Select value={task.priority} onValueChange={(priority) => save({ priority: priority as TaskPriority })}>
            <SelectTrigger size="sm" aria-label="Priorité" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITIES.map((priority) => (
                <SelectItem key={priority} value={priority}>
                  {PRIORITY_LABELS[priority]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row label="Assigné à" alignTop>
          <Assignees task={task} />
        </Row>
        <Row label="Créée par">
          <CreatedBy createdById={task.createdById} />
        </Row>
      </dl>

      <section className="flex flex-col gap-1.5">
        <h3 className="text-[12px] font-semibold text-ink-2">Description</h3>
        <InlineText
          label="Description"
          multiline
          value={task.description ?? ""}
          maxLength={10000}
          placeholder="Ajoutez une description…"
          onSave={(description) => save({ description: description || null })}
          className="min-h-24 text-[14px] leading-relaxed text-ink"
        />
      </section>

      {canDeleteTask(role, userId, task) && (
        <Button variant="ghost" className="self-start text-ember hover:bg-ember-soft hover:text-ember" onClick={() => deleteTask(task.id)}>
          <Trash2 aria-hidden="true" />
          Supprimer la carte
        </Button>
      )}
    </div>
  );
}

function Row({ label, alignTop, children }: { label: string; alignTop?: boolean; children: ReactNode }) {
  return (
    <>
      <dt className={alignTop ? "self-start pt-1.5 text-ink-3" : "text-ink-3"}>{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

/**
 * Text edited in place: what the server has, until focused; a draft while
 * focused. Saved on blur (and Enter for one line), only if it changed;
 * Escape restores the saved value.
 */
function InlineText({
  label,
  value,
  onSave,
  multiline,
  required,
  maxLength,
  placeholder,
  className,
}: {
  label: string;
  value: string;
  onSave: (value: string) => void;
  multiline?: boolean;
  required?: boolean;
  maxLength: number;
  placeholder?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  // Escape blurs too: the blur that follows must not save the cancelled draft.
  const cancelled = useRef(false);
  const shown = draft ?? value;

  const commit = () => {
    if (cancelled.current || draft === null) {
      cancelled.current = false;
      setDraft(null);
      return;
    }
    const next = multiline ? draft.replace(/\s+$/, "") : draft.trim();
    setDraft(null);
    if (next !== value && (!required || next.length > 0)) {
      onSave(next);
    }
  };

  return (
    <textarea
      aria-label={label}
      value={shown}
      rows={multiline ? 4 : 1}
      maxLength={maxLength}
      placeholder={placeholder}
      onFocus={() => setDraft(value)}
      onChange={(event) => setDraft(multiline ? event.target.value : event.target.value.replace(/\n/g, ""))}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          cancelled.current = true;
          event.currentTarget.blur();
        } else if (event.key === "Enter" && !multiline) {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      className={`field-sizing-content -mx-1.5 block w-[calc(100%+0.75rem)] resize-none rounded-button bg-transparent px-1.5 py-1 outline-none hover:bg-stone focus-visible:bg-surface focus-visible:outline-2 focus-visible:outline-plum ${className ?? ""}`}
    />
  );
}

function DueDateField({ task, onSave }: { task: Task; onSave: (dueDate: string | null) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  const saved = task.dueDate ? toLocalInput(task.dueDate) : "";
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="datetime-local"
        aria-label="Échéance"
        value={draft ?? saved}
        onFocus={() => setDraft(saved)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (!cancelled.current && draft !== null && draft !== saved) {
            const iso = fromLocalInput(draft);
            // An incomplete value is not a request to clear the date.
            if (iso || draft === "") {
              onSave(iso);
            }
          }
          cancelled.current = false;
          setDraft(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            cancelled.current = true;
            event.currentTarget.blur();
          }
        }}
        className="h-8 min-w-0 rounded-button border border-rail bg-surface px-2 text-[13px] text-ink tabular-nums outline-none focus-visible:border-plum"
      />
      {task.dueDate && (
        <Button variant="ghost" size="icon-sm" aria-label="Retirer l'échéance" onClick={() => onSave(null)}>
          <X aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}

/** Only ACTIVE members are offered: the API answers 400 for anyone else. */
function Assignees({ task }: { task: Task }) {
  const { workspaceId, boardId, activeMembers, userId } = useBoardContext();
  const assign = useAssignTask(workspaceId, boardId);
  const unassign = useUnassignTask(workspaceId, boardId);
  const assigned = new Set(task.assignees.map((a) => a.userId));
  const candidates = activeMembers.filter((member) => !assigned.has(member.userId));

  return (
    <div className="flex flex-col items-start gap-1.5">
      {task.assignees.length === 0 && <p className="py-1 text-ink-3">Personne</p>}
      {task.assignees.map((assignee) => (
        <span key={assignee.id} className="flex max-w-full items-center gap-2 rounded-full bg-stone py-0.5 pr-1 pl-0.5">
          <Avatar name={assignee.user.name} size={21} className="bg-surface" />
          <span className="truncate text-[13px] text-ink">
            {assignee.user.name}
            {assignee.userId === userId && <span className="text-ink-3"> (vous)</span>}
          </span>
          <button
            type="button"
            onClick={() => unassign.mutate({ taskId: task.id, userId: assignee.userId })}
            aria-label={`Retirer ${assignee.user.name}`}
            className="flex size-5 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-hair hover:text-ink"
          >
            <X className="size-3" aria-hidden="true" />
          </button>
        </span>
      ))}
      {candidates.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="-ml-1 text-plum hover:text-plum">
              <Plus aria-hidden="true" />
              Assigner
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
            {candidates.map((member) => (
              <DropdownMenuItem
                key={member.userId}
                onSelect={() => assign.mutate({ taskId: task.id, userId: member.userId })}
              >
                <Avatar name={member.user.name} size={21} />
                <span className="truncate">
                  {member.user.name}
                  {member.userId === userId && " (vous)"}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

function CreatedBy({ createdById }: { createdById: string | null }) {
  const { workspaceId, userId } = useBoardContext();
  const members = useMembers(workspaceId);
  if (createdById === null) {
    return <span className="text-ink-3">Compte supprimé</span>;
  }
  if (createdById === userId) {
    return <span className="text-ink">Vous</span>;
  }
  const creator = members.data?.find((member) => member.userId === createdById);
  if (!creator) {
    return <span className="text-ink-3">{members.isPending ? "…" : "Un ancien membre"}</span>;
  }
  return <span className="truncate text-ink">{creator.user.name}</span>;
}
