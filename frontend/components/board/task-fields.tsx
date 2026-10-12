"use client";

import { X } from "lucide-react";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PRIORITY_LABELS } from "@/lib/format";
import type { TaskPriority } from "@/lib/types";
import { cn } from "@/lib/utils";

/** The controls a card's priority and due date are edited with: detail panel and proposal alike. */

const PRIORITIES: TaskPriority[] = ["HIGH", "MEDIUM", "LOW"];

export function PrioritySelect({
  value,
  onChange,
}: {
  value: TaskPriority;
  onChange: (priority: TaskPriority) => void;
}) {
  return (
    <Select value={value} onValueChange={(priority) => onChange(priority as TaskPriority)}>
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
  );
}

/** A local date and time (`toLocalInput` / `fromLocalInput`), with a clear button when set. */
export function DueDateInput({
  onClear,
  className,
  ...input
}: Omit<ComponentProps<"input">, "type"> & { onClear?: () => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="datetime-local"
        aria-label="Échéance"
        {...input}
        className={cn(
          "h-8 min-w-0 rounded-button border border-rail bg-surface px-2 text-[13px] text-ink tabular-nums outline-none focus-visible:border-plum",
          className,
        )}
      />
      {onClear && (
        <Button variant="ghost" size="icon-sm" aria-label="Retirer l'échéance" onClick={onClear}>
          <X aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
