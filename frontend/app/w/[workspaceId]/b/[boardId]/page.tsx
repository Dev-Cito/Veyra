"use client";

import { useParams } from "next/navigation";
import { Suspense } from "react";
import { BoardView } from "@/components/board/board-view";
import { BoardSkeleton } from "@/components/app/skeletons";

export default function BoardPage() {
  const { workspaceId, boardId } = useParams<{ workspaceId: string; boardId: string }>();
  return (
    // The open card is read from ?task= (useSearchParams).
    <Suspense fallback={<BoardSkeleton />}>
      <BoardView workspaceId={workspaceId} boardId={boardId} />
    </Suspense>
  );
}
