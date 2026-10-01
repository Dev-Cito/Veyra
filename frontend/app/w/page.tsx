"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { CreateWorkspaceDialog } from "@/components/app/create-workspace-dialog";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { EmptyState, KanbanMotif, WorkspaceBadge } from "@/components/app/primitives";
import { RoleMark } from "@/components/app/role-mark";
import { CardGridSkeleton } from "@/components/app/skeletons";
import { Button } from "@/components/ui/button";
import { useWorkspaces } from "@/hooks/use-workspaces";

export default function WorkspacesPage() {
  const workspaces = useWorkspaces();
  const hasWorkspaces = (workspaces.data?.length ?? 0) > 0;

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader
        title="Vos workspaces"
        actions={
          hasWorkspaces && (
            <CreateWorkspaceDialog
              trigger={
                <Button>
                  <Plus aria-hidden="true" />
                  Nouveau workspace
                </Button>
              }
            />
          )
        }
      />
      <PageBody>
        {workspaces.isPending ? (
          <CardGridSkeleton />
        ) : workspaces.isError ? (
          <EmptyState
            title="Vos workspaces n'ont pas pu être chargés"
            action={<Button onClick={() => void workspaces.refetch()}>Réessayer</Button>}
          >
            Le serveur n&apos;a pas répondu. Vos données ne sont pas perdues.
          </EmptyState>
        ) : !hasWorkspaces ? (
          <EmptyState
            className="mx-auto min-h-[330px] max-w-[560px] rounded-card bg-surface shadow-card"
            illustration={<KanbanMotif />}
            title="Créez votre premier workspace"
            action={<CreateWorkspaceDialog trigger={<Button>Créer un workspace</Button>} />}
          >
            Un workspace réunit une équipe et ses tableaux. Vous en serez propriétaire et
            pourrez y inviter qui vous voulez.
          </EmptyState>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-[14px]">
            {workspaces.data.map((workspace) => (
              <li key={workspace.id}>
                <Link
                  href={`/w/${workspace.id}`}
                  className="flex items-center gap-3 rounded-card bg-surface p-4 shadow-card transition-colors hover:bg-surface/80"
                >
                  <WorkspaceBadge name={workspace.name} />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="font-display truncate text-[15px] font-bold text-ink">
                      {workspace.name}
                    </span>
                    <RoleMark role={workspace.role} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PageBody>
    </main>
  );
}
