"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRemoveMember, useUpdateMemberRole } from "@/hooks/use-members";
import { isApiError } from "@/lib/api";
import { ROLE_CAPABILITIES, ROLE_LABELS } from "@/lib/format";
import type { Member, Role } from "@/lib/types";

const ROLES: Role[] = ["OWNER", "ADMIN", "MEMBER"];

/**
 * Change a member's role. Opened on one member (from its row), or with a
 * member to pick (`candidates`), e.g. to name another owner after a 409.
 */
export function RoleDialog({
  workspaceId,
  open,
  onOpenChange,
  member,
  candidates,
  initialRole,
}: {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member?: Member;
  candidates?: Member[];
  initialRole?: Role;
}) {
  const [pickedId, setPickedId] = useState<string | undefined>(candidates?.[0]?.id);
  const [role, setRole] = useState<Role>(initialRole ?? member?.role ?? "MEMBER");
  const update = useUpdateMemberRole(workspaceId);
  const remove = useRemoveMember(workspaceId);

  const target = member ?? candidates?.find((c) => c.id === pickedId);
  const unchanged = target?.role === role;

  const save = () => {
    if (!target) {
      return;
    }
    update.mutate(
      { memberId: target.id, role },
      {
        onSuccess: () => {
          toast.success(`Rôle changé : ${target.user.name} est maintenant ${ROLE_LABELS[role].toLowerCase()}`);
          onOpenChange(false);
        },
      },
    );
  };

  const removeMember = () => {
    if (!target) {
      return;
    }
    remove.mutate(target.id, {
      onSuccess: () => {
        toast.success(`${target.user.name} retiré de l'espace`);
        onOpenChange(false);
      },
      onError: (error) => {
        if (isApiError(error, 409)) {
          toast.error(error.message);
        }
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{member ? `Rôle de ${member.user.name}` : "Nommer un propriétaire"}</DialogTitle>
          <DialogDescription>{ROLE_CAPABILITIES[role]}.</DialogDescription>
        </DialogHeader>

        {!member && candidates && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="role-member">Membre</Label>
            <Select value={pickedId} onValueChange={setPickedId}>
              <SelectTrigger id="role-member" className="w-full">
                <SelectValue placeholder="Choisir un membre" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((candidate) => (
                  <SelectItem key={candidate.id} value={candidate.id}>
                    {candidate.user.name} · {candidate.user.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="role-value">Rôle</Label>
          <Select value={role} onValueChange={(value) => setRole(value as Role)}>
            <SelectTrigger id="role-value" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((option) => (
                <SelectItem key={option} value={option}>
                  {ROLE_LABELS[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter className="sm:justify-between">
          {member ? (
            <Button variant="destructive" onClick={removeMember} disabled={remove.isPending}>
              {remove.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Retirer de l&apos;espace
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={save} disabled={!target || unchanged || update.isPending}>
            {update.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
            Changer le rôle
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
