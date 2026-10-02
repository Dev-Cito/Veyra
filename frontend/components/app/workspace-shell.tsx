"use client";

import { LayoutGrid, Mail, Settings, Users, X } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Suspense, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useBoards } from "@/hooks/use-boards";
import { usePendingInvitations } from "@/hooks/use-invitations";
import { useMembers } from "@/hooks/use-members";
import { useWorkspace } from "@/hooks/use-workspaces";
import { canManage } from "@/lib/format";
import type { Workspace } from "@/lib/types";
import { cn } from "@/lib/utils";
import { WorkspaceNavContext } from "./page-header";
import { EmptyState } from "./primitives";
import { RoleMark } from "./role-mark";
import { ContextColumnSkeleton } from "./skeletons";

/** Context column (214px) + main zone, for one workspace. */
export function WorkspaceShell({
  workspaceId,
  children,
}: {
  workspaceId: string;
  children: ReactNode;
}) {
  const workspace = useWorkspace(workspaceId);
  const [navOpen, setNavOpen] = useState(false);

  if (workspace.isError) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <EmptyState
          title="Ce workspace est introuvable"
          action={
            <Button asChild>
              <Link href="/w">Voir mes workspaces</Link>
            </Button>
          }
        >
          Il a peut-être été supprimé, ou vous n&apos;en faites plus partie.
        </EmptyState>
      </main>
    );
  }

  return (
    <WorkspaceNavContext.Provider value={{ openNav: () => setNavOpen(true) }}>
      <aside className="hidden w-[214px] shrink-0 border-r border-hair bg-surface md:block">
        {workspace.data ? (
          <ContextColumn workspace={workspace.data} />
        ) : (
          <ContextColumnSkeleton />
        )}
      </aside>

      <DialogPrimitive.Root open={navOpen} onOpenChange={setNavOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/20 md:hidden" />
          <DialogPrimitive.Content asChild aria-describedby={undefined}>
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
              className="fixed inset-y-0 left-0 z-50 w-[264px] max-w-[85vw] bg-surface md:hidden"
            >
              <DialogPrimitive.Title className="sr-only">Menu de l&apos;espace</DialogPrimitive.Title>
              <DialogPrimitive.Close asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="absolute top-3 right-3"
                  aria-label="Fermer le menu"
                >
                  <X aria-hidden="true" />
                </Button>
              </DialogPrimitive.Close>
              {workspace.data ? (
                <ContextColumn workspace={workspace.data} onNavigate={() => setNavOpen(false)} />
              ) : (
                <ContextColumnSkeleton />
              )}
            </motion.div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</main>
    </WorkspaceNavContext.Provider>
  );
}

function ContextColumn({
  workspace,
  onNavigate,
}: {
  workspace: Workspace;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex flex-col gap-5 px-3 py-4">
      <div className="flex flex-col gap-1.5 px-2 pr-8 md:pr-2">
        <p className="font-display truncate text-[15px] font-bold text-ink" title={workspace.name}>
          {workspace.name}
        </p>
        <RoleMark role={workspace.role} />
      </div>
      <Suspense fallback={<NavFallback />}>
        <ContextNav workspace={workspace} onNavigate={onNavigate} />
      </Suspense>
    </div>
  );
}

function NavFallback() {
  return <div className="h-[140px]" aria-hidden="true" />;
}

function ContextNav({
  workspace,
  onNavigate,
}: {
  workspace: Workspace;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const manager = canManage(workspace.role);
  const boards = useBoards(workspace.id);
  const members = useMembers(workspace.id);
  const invitations = usePendingInvitations(workspace.id, manager);

  const base = `/w/${workspace.id}`;
  const onMembers = pathname === `${base}/members`;
  const showingInvitations = onMembers && searchParams.get("vue") === "invitations";

  const items: {
    href: string;
    label: string;
    icon: typeof LayoutGrid;
    active: boolean;
    count?: number;
  }[] = [
    {
      href: base,
      label: "Tableaux",
      icon: LayoutGrid,
      active: pathname === base || pathname.startsWith(`${base}/b/`),
      count: boards.data?.length,
    },
    {
      href: `${base}/members`,
      label: "Membres",
      icon: Users,
      active: onMembers && !showingInvitations,
      count: members.data?.filter((m) => m.status === "ACTIVE").length,
    },
    // Members cannot list invitations (403): the item is hidden for them.
    ...(manager
      ? [
          {
            href: `${base}/members?vue=invitations`,
            label: "Invitations",
            icon: Mail,
            active: showingInvitations,
            count: invitations.data?.length,
          },
        ]
      : []),
    {
      href: `${base}/settings`,
      label: "Paramètres",
      icon: Settings,
      active: pathname === `${base}/settings`,
    },
  ];

  return (
    <nav aria-label={`Navigation de ${workspace.name}`}>
      <ul className="flex flex-col gap-0.5">
        {items.map((item) => (
          <li key={item.label}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={item.active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-button px-2 py-1.5 text-[13px] text-ink-2 transition-colors hover:bg-stone hover:text-ink",
                item.active && "bg-stone font-semibold text-ink",
              )}
            >
              <item.icon className="size-4 shrink-0" aria-hidden="true" />
              <span className="flex-1">{item.label}</span>
              {item.count !== undefined && (
                <span className="text-[12px] text-ink-3 tabular-nums">{item.count}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
