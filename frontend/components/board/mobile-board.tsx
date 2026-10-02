"use client";

import { Plus } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";
import type { FullBoard, ListWithTasks } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useBoardContext } from "./board-context";
import { ListComposer } from "./board-dialogs";
import { AddCardButton, ColumnHeader, EmptyColumnHint, TaskComposer } from "./column";
import { StaticTaskCard } from "./task-card";

/**
 * Below 768px: one column at a time, picked from tabs with their counts. No
 * drag and drop (touch is out of scope): "Déplacer vers…" in each card's menu.
 */
export function MobileBoard({
  board,
  addingList,
  onAddingListChange,
  onDeleteList,
}: {
  board: FullBoard;
  addingList: boolean;
  onAddingListChange: (adding: boolean) => void;
  onDeleteList: (list: ListWithTasks) => void;
}) {
  const { manager, addList } = useBoardContext();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  // The chosen tab, or the first one if it was deleted (or none chosen yet).
  const selected = board.lists.find((list) => list.id === selectedId) ?? board.lists[0];

  const select = (index: number) => {
    const list = board.lists[index];
    if (list) {
      setSelectedId(list.id);
      setComposing(false);
      tabs.current[index]?.focus();
    }
  };

  const onTabKeyDown = (event: KeyboardEvent, index: number) => {
    const last = board.lists.length - 1;
    const target =
      event.key === "ArrowRight" ? (index === last ? 0 : index + 1)
      : event.key === "ArrowLeft" ? (index === 0 ? last : index - 1)
      : event.key === "Home" ? 0
      : event.key === "End" ? last
      : null;
    if (target !== null) {
      event.preventDefault();
      select(target);
    }
  };

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-hair px-3 py-2">
        <div role="tablist" aria-label="Colonnes" className="flex items-center gap-1">
          {board.lists.map((list, index) => {
            const active = list.id === selected?.id;
            return (
              <button
                key={list.id}
                ref={(node) => {
                  tabs.current[index] = node;
                }}
                type="button"
                role="tab"
                id={`tab-${list.id}`}
                aria-selected={active}
                aria-controls={`panel-${list.id}`}
                tabIndex={active ? 0 : -1}
                onClick={() => select(index)}
                onKeyDown={(event) => onTabKeyDown(event, index)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] whitespace-nowrap text-ink-2",
                  active && "bg-stone font-semibold text-ink",
                )}
              >
                {list.name}
                <span className="rounded-[20px] bg-[#E6E4DE] px-[7px] text-[11px] font-medium tabular-nums">
                  {list.tasks.length}
                </span>
              </button>
            );
          })}
        </div>
        {manager && (
          <button
            type="button"
            onClick={addList}
            className="flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[13px] whitespace-nowrap text-ink-3 hover:bg-stone hover:text-ink"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Colonne
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {addingList && <ListComposer className="mb-3" onClose={() => onAddingListChange(false)} />}
        {selected && (
          <section
            role="tabpanel"
            id={`panel-${selected.id}`}
            aria-labelledby={`tab-${selected.id}`}
            className="rounded-panel bg-stone p-[10px]"
          >
            <ColumnHeader list={selected} count={selected.tasks.length} onDelete={onDeleteList} />
            <AddCardButton list={selected} onClick={() => setComposing(true)} />
            {selected.tasks.map((task) => (
              <StaticTaskCard key={task.id} task={task} />
            ))}
            {selected.tasks.length === 0 && !composing && (
              <EmptyColumnHint>Aucune carte. Ajoutez-en une avec +.</EmptyColumnHint>
            )}
            {composing && <TaskComposer listId={selected.id} onClose={() => setComposing(false)} />}
          </section>
        )}
      </div>
    </div>
  );
}
