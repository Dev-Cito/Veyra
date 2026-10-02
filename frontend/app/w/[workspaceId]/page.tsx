"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CreateBoardDialog } from "@/components/app/create-board-dialog";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/primitives";
import { CardGridSkeleton } from "@/components/app/skeletons";
import { Button } from "@/components/ui/button";
import { useBoards } from "@/hooks/use-boards";
import { useWorkspace } from "@/hooks/use-workspaces";
import { canManage, formatDate } from "@/lib/format";
import type { Board } from "@/lib/types";

export default function BoardsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const workspace = useWorkspace(workspaceId);
  const boards = useBoards(workspaceId);
  const manager = canManage(workspace.data?.role);

  const newBoard = (label: string) => (
    <CreateBoardDialog
      workspaceId={workspaceId}
      trigger={
        <Button>
          <Plus aria-hidden="true" />
          {label}
        </Button>
      }
    />
  );

  return (
    <>
      <PageHeader title="Tableaux" actions={manager && newBoard("Nouveau tableau")} />
      <PageBody>
        {boards.isPending ? (
          <CardGridSkeleton />
        ) : boards.isError ? (
          <EmptyState
            title="Les tableaux n'ont pas pu être chargés"
            action={<Button onClick={() => void boards.refetch()}>Réessayer</Button>}
          >
            Le serveur n&apos;a pas répondu. Vos tableaux ne sont pas perdus.
          </EmptyState>
        ) : boards.data.length === 0 ? (
          manager ? (
            <EmptyState title="Créez le premier tableau" action={newBoard("Créer un tableau")}>
              Un tableau découpe le travail en colonnes : à faire, en cours, terminé. Toute
              l&apos;équipe le voit et le fait avancer.
            </EmptyState>
          ) : (
            <EmptyState
              title="Aucun tableau pour l'instant"
              action={
                <Button variant="outline" asChild>
                  <Link href={`/w/${workspaceId}/members`}>Voir qui gère cet espace</Link>
                </Button>
              }
            >
              Les propriétaires et administrateurs créent les tableaux. Vous pourrez y
              travailler dès que le premier existera.
            </EmptyState>
          )
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-[14px]">
            {boards.data.map((board) => (
              <li key={board.id}>
                <BoardCard workspaceId={workspaceId} board={board} />
              </li>
            ))}
          </ul>
        )}
      </PageBody>
    </>
  );
}

/**
 * The card distribution bar and total are omitted: GET /boards does not
 * return per-list task counts, and nothing is invented in their place.
 */
function BoardCard({ workspaceId, board }: { workspaceId: string; board: Board }) {
  return (
    <article className="relative flex h-full flex-col gap-1.5 rounded-card bg-surface p-4 shadow-card transition-shadow hover:shadow-[0_1px_3px_rgba(26,29,33,0.08),0_0_0_1px_rgba(26,29,33,0.08)]">
      <h2 className="font-display truncate text-[15px] font-bold text-ink" title={board.name}>
        {/* The whole card is the link (::after), the title its accessible name. */}
        <Link
          href={`/w/${workspaceId}/b/${board.id}`}
          className="rounded-card after:absolute after:inset-0 after:rounded-card"
        >
          {board.name}
        </Link>
      </h2>
      {board.description && (
        <p className="line-clamp-2 text-[13px] text-ink-2">{board.description}</p>
      )}
      <p className="mt-auto pt-1 text-[12px] text-ink-3 tabular-nums">
        Modifié le {formatDate(board.updatedAt)}
      </p>
    </article>
  );
}
