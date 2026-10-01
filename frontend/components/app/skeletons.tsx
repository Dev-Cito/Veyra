import { Skeleton } from "@/components/ui/skeleton";

/** Placeholders shaped like the content they stand for. */

export function RailSkeleton() {
  return (
    <>
      {[0, 1, 2].map((key) => (
        <Skeleton key={key} className="size-[34px] shrink-0 rounded-card" />
      ))}
    </>
  );
}

export function ContextColumnSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-4" aria-hidden="true">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-3 w-24" />
      <div className="mt-4 flex flex-col gap-2">
        {[0, 1, 2, 3].map((key) => (
          <Skeleton key={key} className="h-7 w-full" />
        ))}
      </div>
    </div>
  );
}

export function CardGridSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-[14px]" aria-hidden="true">
      {Array.from({ length: count }, (_, key) => (
        <div key={key} className="flex h-[104px] flex-col gap-2 rounded-card bg-surface p-4 shadow-card">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}

export function RowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="divide-y divide-hair" aria-hidden="true">
      {Array.from({ length: rows }, (_, key) => (
        <div key={key} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="size-8 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-36" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

/** The whole shell while /auth/me answers: never a blank screen. */
export function ShellSkeleton() {
  return (
    <div className="flex h-dvh flex-col bg-stone md:flex-row" aria-busy="true" aria-label="Chargement">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-hair bg-surface px-3 md:h-auto md:w-[58px] md:flex-col md:border-r md:border-b-0 md:px-0 md:py-3">
        <RailSkeleton />
      </div>
      <div className="hidden w-[214px] shrink-0 border-r border-hair bg-surface md:block">
        <ContextColumnSkeleton />
      </div>
      <div className="flex-1 p-6">
        <CardGridSkeleton />
      </div>
    </div>
  );
}
