"use client";

import { LogOut, Plus } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLogout } from "@/hooks/use-auth";
import { useWorkspaces } from "@/hooks/use-workspaces";
import type { User } from "@/lib/types";
import { redirectToLogin } from "@/lib/session";
import { cn } from "@/lib/utils";
import { CreateWorkspaceDialog } from "./create-workspace-dialog";
import { Avatar, WorkspaceBadge } from "./primitives";
import { RailSkeleton } from "./skeletons";

/**
 * The workspace rail: 58px wide, one 34px badge per workspace. On small
 * screens it becomes a horizontal bar at the top.
 */
export function Rail({ user }: { user: User }) {
  const params = useParams<{ workspaceId?: string }>();
  const workspaces = useWorkspaces();

  return (
    <nav
      aria-label="Workspaces"
      className="flex h-14 shrink-0 items-center gap-3 border-b border-hair bg-surface px-3 md:h-auto md:w-[58px] md:flex-col md:border-r md:border-b-0 md:px-0 md:py-3"
    >
      <ul className="flex min-w-0 flex-1 items-center gap-2.5 overflow-x-auto md:flex-none md:flex-col md:overflow-visible">
        {workspaces.isPending ? (
          <RailSkeleton />
        ) : (
          workspaces.data?.map((workspace) => {
            const current = workspace.id === params.workspaceId;
            return (
              <li key={workspace.id} className="relative flex shrink-0">
                {current && (
                  <span
                    aria-hidden="true"
                    className="absolute -bottom-[11px] left-1/2 h-[3px] w-5 -translate-x-1/2 rounded-full bg-plum md:top-1/2 md:bottom-auto md:-left-3 md:h-5 md:w-[3px] md:translate-x-0 md:-translate-y-1/2"
                  />
                )}
                <Link
                  href={`/w/${workspace.id}`}
                  aria-label={workspace.name}
                  aria-current={current ? "page" : undefined}
                  title={workspace.name}
                  className="rounded-card"
                >
                  <WorkspaceBadge name={workspace.name} />
                </Link>
              </li>
            );
          })
        )}
        <li className="flex shrink-0">
          <CreateWorkspaceDialog
            trigger={
              <button
                type="button"
                aria-label="Créer un workspace"
                title="Créer un workspace"
                className="flex size-[34px] items-center justify-center rounded-card border border-dashed border-rail text-ink-2 transition-colors hover:border-plum hover:text-plum"
              >
                <Plus className="size-4" aria-hidden="true" />
              </button>
            }
          />
        </li>
      </ul>
      <UserMenu user={user} className="md:mt-auto" />
    </nav>
  );
}

function UserMenu({ user, className }: { user: User; className?: string }) {
  const router = useRouter();
  const logout = useLogout();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Compte de ${user.name}`}
        className={cn("shrink-0 rounded-full", className)}
      >
        <Avatar name={user.name} size={32} />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end" className="min-w-[220px]">
        <DropdownMenuLabel className="flex flex-col gap-0.5 font-normal">
          <span className="text-[13px] font-semibold text-ink">{user.name}</span>
          <span className="truncate text-[12px] text-ink-2">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => logout.mutate(undefined, { onSettled: () => redirectToLogin(router) })}
        >
          <LogOut aria-hidden="true" />
          Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
