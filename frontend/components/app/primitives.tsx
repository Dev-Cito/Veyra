import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";

/** A workspace's mark: initials on plum-soft. */
export function WorkspaceBadge({
  name,
  size = 34,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "font-display inline-flex shrink-0 items-center justify-center rounded-card bg-plum-soft font-bold text-plum",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {initials(name)}
    </span>
  );
}

/** A person: round, initials on stone. */
export function Avatar({
  name,
  size = 32,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-stone font-semibold text-ink-2",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {initials(name)}
    </span>
  );
}

/** A small rounded tag ("Vous", "En attente"). */
export function Pill({
  tone = "stone",
  children,
}: {
  tone?: "stone" | "ember" | "plum" | "teal";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        tone === "stone" && "bg-stone text-ink-2",
        tone === "ember" && "bg-ember-soft text-ember",
        tone === "plum" && "bg-plum-soft text-plum",
        tone === "teal" && "bg-teal-soft text-teal",
      )}
    >
      {children}
    </span>
  );
}

/** Ember-soft banner: what happened, and what to do. */
export function Banner({
  children,
  action,
  className,
}: {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col gap-2 rounded-card bg-ember-soft px-3.5 py-2.5 text-[13px] text-ink sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <p>{children}</p>
      {action}
    </div>
  );
}

/** Validation messages under a field, as the server wrote them. */
export function FieldError({ id, messages }: { id: string; messages?: string[] }) {
  if (!messages?.length) {
    return null;
  }
  return (
    <p id={id} className="text-[12px] text-ember">
      {messages.join(" · ")}
    </p>
  );
}

/**
 * Every list's empty state: a title, a sentence, an action. An empty state is
 * an invitation to act, never a bare "no results".
 */
export function EmptyState({
  title,
  children,
  action,
  illustration,
  className,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  illustration?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-10 text-center",
        className,
      )}
    >
      {illustration}
      <h2 className="font-display text-[20px] font-bold text-ink">{title}</h2>
      <p className="max-w-[360px] text-[14px] leading-relaxed text-ink-2">{children}</p>
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}

/** Three columns evoking a Kanban board, for the "no workspace yet" state. */
export function KanbanMotif() {
  return (
    <div aria-hidden="true" className="mb-2 flex items-start gap-2">
      {[34, 22, 44].map((height) => (
        <div key={height} className="flex h-[60px] w-[42px] items-start justify-center rounded-[8px] bg-stone p-1.5">
          <div className="w-full rounded-[3px] bg-rail" style={{ height }} />
        </div>
      ))}
    </div>
  );
}
