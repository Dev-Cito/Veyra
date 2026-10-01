"use client";

import { Loader2, Mail, UserPlus } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { InviteDialog } from "@/components/app/invite-dialog";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { Avatar, Banner, EmptyState, Pill } from "@/components/app/primitives";
import { RoleDialog } from "@/components/app/role-dialog";
import { RoleMark } from "@/components/app/role-mark";
import { RowsSkeleton } from "@/components/app/skeletons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMe } from "@/hooks/use-auth";
import { usePendingInvitations, useRevokeInvitation } from "@/hooks/use-invitations";
import { useMembers, useRemoveMember } from "@/hooks/use-members";
import { useWorkspace } from "@/hooks/use-workspaces";
import { canManage, formatDate, ROLE_LABELS } from "@/lib/format";
import { isApiError } from "@/lib/api";
import type { Invitation, Member, Workspace } from "@/lib/types";

export default function MembersPage() {
  return (
    <Suspense fallback={<MembersFallback />}>
      <MembersContent />
    </Suspense>
  );
}

function MembersFallback() {
  return (
    <>
      <PageHeader title="Membres" />
      <PageBody>
        <Panel>
          <RowsSkeleton />
        </Panel>
      </PageBody>
    </>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <section className="overflow-hidden rounded-card bg-surface shadow-card">{children}</section>;
}

function MembersContent() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const onlyInvitations = useSearchParams().get("vue") === "invitations";
  const router = useRouter();
  const me = useMe();
  const workspace = useWorkspace(workspaceId);
  const members = useMembers(workspaceId);
  const manager = canManage(workspace.data?.role);
  const invitations = usePendingInvitations(workspaceId, manager);
  const revoke = useRevokeInvitation(workspaceId);
  const leave = useRemoveMember(workspaceId);

  const [editing, setEditing] = useState<Member | null>(null);
  const [namingOwner, setNamingOwner] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const lastOwner = isApiError(leave.error, 409) ? leave.error : null;

  const userId = me.data?.id;
  const isOwner = workspace.data?.role === "OWNER";
  const others = members.data?.filter((m) => m.userId !== userId && m.status === "ACTIVE") ?? [];
  const self = members.data?.find((m) => m.userId === userId);

  const leaveWorkspace = () => {
    if (!self || !workspace.data) {
      return;
    }
    const name = workspace.data.name;
    leave.mutate(self.id, {
      onSuccess: () => {
        toast.success(`Vous avez quitté ${name}`);
        router.replace("/w");
      },
      onSettled: () => setConfirmLeave(false),
    });
  };

  const loading = members.isPending || !workspace.data || (manager && invitations.isPending);

  return (
    <>
      <PageHeader
        title={onlyInvitations ? "Invitations en attente" : "Membres"}
        actions={
          manager &&
          workspace.data &&
          members.data && (
            <InviteDialog
              workspaceId={workspaceId}
              actorRole={workspace.data.role}
              members={members.data}
              trigger={
                <Button>
                  <UserPlus aria-hidden="true" />
                  Inviter quelqu&apos;un
                </Button>
              }
            />
          )
        }
      />
      <PageBody>
        <div className="mx-auto flex max-w-[860px] flex-col gap-4">
          {lastOwner && (
            // A 409 always offers the way out: name another owner first.
            <Banner
              action={
                others.length > 0 ? (
                  <Button size="sm" onClick={() => setNamingOwner(true)}>
                    Nommer un propriétaire
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/w/${workspaceId}/settings`}>Supprimer l&apos;espace</Link>
                  </Button>
                )
              }
            >
              {lastOwner.message}
            </Banner>
          )}

          <Panel>
            {loading ? (
              <RowsSkeleton />
            ) : members.isError ? (
              <EmptyState
                title="Les membres n'ont pas pu être chargés"
                action={<Button onClick={() => void members.refetch()}>Réessayer</Button>}
              >
                Le serveur n&apos;a pas répondu. Réessayez dans un instant.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-hair">
                {!onlyInvitations &&
                  members.data.map((member) => (
                    <MemberRow
                      key={member.id}
                      member={member}
                      isSelf={member.userId === userId}
                      canEdit={isOwner && member.userId !== userId}
                      onEdit={() => setEditing(member)}
                      onLeave={() => setConfirmLeave(true)}
                    />
                  ))}
                {manager &&
                  invitations.data?.map((invitation) => (
                    <InvitationRow
                      key={invitation.id}
                      invitation={invitation}
                      revoking={revoke.isPending && revoke.variables === invitation.id}
                      onRevoke={() =>
                        revoke.mutate(invitation.id, {
                          onSuccess: () => toast.success(`Invitation de ${invitation.email} révoquée`),
                        })
                      }
                    />
                  ))}
              </ul>
            )}
            {onlyInvitations && !loading && invitations.data?.length === 0 && workspace.data && members.data && (
              <EmptyState
                title="Aucune invitation en attente"
                action={
                  <InviteDialog
                    workspaceId={workspaceId}
                    actorRole={workspace.data.role}
                    members={members.data}
                    trigger={<Button>Inviter quelqu&apos;un</Button>}
                  />
                }
              >
                Invitez quelqu&apos;un par email : l&apos;invitation apparaîtra ici jusqu&apos;à ce
                qu&apos;elle soit acceptée ou révoquée.
              </EmptyState>
            )}
          </Panel>
        </div>
      </PageBody>

      {editing && (
        <RoleDialog
          key={editing.id}
          workspaceId={workspaceId}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          member={editing}
        />
      )}
      {namingOwner && (
        <RoleDialog
          workspaceId={workspaceId}
          open
          onOpenChange={(open) => {
            if (!open) {
              setNamingOwner(false);
              leave.reset();
            }
          }}
          candidates={others}
          initialRole="OWNER"
        />
      )}
      {workspace.data && (
        <LeaveDialog
          workspace={workspace.data}
          open={confirmLeave}
          onOpenChange={setConfirmLeave}
          pending={leave.isPending}
          onConfirm={leaveWorkspace}
        />
      )}
    </>
  );
}

function MemberRow({
  member,
  isSelf,
  canEdit,
  onEdit,
  onLeave,
}: {
  member: Member;
  isSelf: boolean;
  canEdit: boolean;
  onEdit: () => void;
  onLeave: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <Avatar name={member.user.name} />
      <div className="flex min-w-0 flex-1 basis-[180px] flex-col">
        <span className="flex items-center gap-2 text-[14px] font-medium text-ink">
          <span className="truncate">{member.user.name}</span>
          {isSelf && <Pill tone="plum">Vous</Pill>}
        </span>
        <span className="truncate text-[12px] text-ink-2">{member.user.email}</span>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <RoleMark role={member.status === "ACTIVE" ? member.role : "PENDING"} />
        {canEdit && (
          <Button variant="outline" size="sm" onClick={onEdit} aria-label={`Modifier le rôle de ${member.user.name}`}>
            Modifier
          </Button>
        )}
        {isSelf && (
          <Button variant="ghost" size="sm" onClick={onLeave}>
            Quitter l&apos;espace
          </Button>
        )}
      </div>
    </li>
  );
}

function InvitationRow({
  invitation,
  revoking,
  onRevoke,
}: {
  invitation: Invitation;
  revoking: boolean;
  onRevoke: () => void;
}) {
  // No RoleMark: an invitee holds no authority yet.
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed border-rail text-ink-2">
        <Mail className="size-4" aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-1 basis-[180px] flex-col">
        <span className="truncate text-[14px] font-medium text-ink">{invitation.email}</span>
        <span className="text-[12px] text-ink-2 tabular-nums">
          Invité comme {ROLE_LABELS[invitation.role].toLowerCase()} · envoyée le{" "}
          {formatDate(invitation.createdAt)}
        </span>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <Pill tone="ember">En attente</Pill>
        <Button
          variant="outline"
          size="sm"
          onClick={onRevoke}
          disabled={revoking}
          aria-label={`Révoquer l'invitation de ${invitation.email}`}
        >
          {revoking && <Loader2 className="animate-spin" aria-hidden="true" />}
          Révoquer
        </Button>
      </div>
    </li>
  );
}

function LeaveDialog({
  workspace,
  open,
  onOpenChange,
  pending,
  onConfirm,
}: {
  workspace: Workspace;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Quitter {workspace.name}</DialogTitle>
          <DialogDescription>
            Vous perdrez l&apos;accès à ses tableaux, et vos tâches assignées dans cet espace
            seront désassignées. Il faudra une nouvelle invitation pour revenir.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Rester
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
            Quitter l&apos;espace
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
