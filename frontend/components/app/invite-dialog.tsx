"use client";

import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateInvitation } from "@/hooks/use-invitations";
import { isApiError } from "@/lib/api";
import { errorMessage, fieldErrorMessages } from "@/lib/error-messages";
import { ROLE_CAPABILITIES, ROLE_LABELS } from "@/lib/format";
import type { InvitationRole, Member, Role } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Banner, FieldError } from "./primitives";
import { SubmitButton } from "@/components/app/submit-button";

// OWNER is not offered: the API refuses it (400), so the UI does not propose it.
const ROLES: InvitationRole[] = ["MEMBER", "ADMIN"];

export function InviteDialog({
  workspaceId,
  actorRole,
  members,
  trigger,
}: {
  workspaceId: string;
  actorRole: Role;
  members: Member[];
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<InvitationRole>("MEMBER");
  const [email, setEmail] = useState("");
  const invite = useCreateInvitation(workspaceId);
  const errors = isApiError(invite.error, 400) ? fieldErrorMessages(invite.error.fieldErrors) : {};
  const conflict = isApiError(invite.error, 409) ? invite.error : null;
  const conflictIsMember = members.some(
    (m) => m.status === "ACTIVE" && m.user.email === email.trim().toLowerCase(),
  );

  const close = () => setOpen(false);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    invite.mutate(
      { email: email.trim(), role },
      {
        // The response also carries the raw token: deliberately never read.
        onSuccess: ({ email: invited, emailSent }) => {
          if (emailSent) {
            toast.success(`Invitation envoyée à ${invited}`);
          } else {
            toast.warning(`L'email n'a pas pu partir vers ${invited}`, {
              description: "L'invitation reste valide : elle apparaît dans les invitations en attente.",
            });
          }
          // The response holds the raw token: do not keep it in the mutation cache.
          invite.reset();
          close();
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          invite.reset();
          setEmail("");
          setRole("MEMBER");
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[440px]">
        <form method="post" onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Inviter quelqu&apos;un</DialogTitle>
            <DialogDescription>
              La personne reçoit un lien par email, valable 7 jours.
            </DialogDescription>
          </DialogHeader>

          {conflict && (
            // A 409 always offers the way out.
            <Banner
              action={
                <Button variant="outline" size="sm" asChild>
                  <Link
                    href={`/w/${workspaceId}/members${conflictIsMember ? "" : "?vue=invitations"}`}
                    onClick={close}
                  >
                    {conflictIsMember ? "Voir les membres" : "Voir les invitations"}
                  </Link>
                </Button>
              }
            >
              {errorMessage(conflict, "invite", {
                inviteConflict: conflictIsMember ? "member" : "pending",
              })}
            </Banner>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              name="email"
              type="email"
              required
              autoFocus
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="prenom@entreprise.fr"
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={errors.email ? "invite-email-error" : undefined}
            />
            <FieldError id="invite-email-error" messages={errors.email} />
          </div>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-sm font-medium">Rôle</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {ROLES.map((option) => {
                const disabled = option === "ADMIN" && actorRole !== "OWNER";
                const checked = role === option;
                return (
                  <label
                    key={option}
                    className={cn(
                      "flex cursor-pointer flex-col gap-1 rounded-card border border-rail bg-surface p-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-plum",
                      checked && "border-plum bg-plum-soft",
                      disabled && "cursor-not-allowed bg-stone",
                    )}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={option}
                      checked={checked}
                      disabled={disabled}
                      onChange={() => setRole(option)}
                      className="sr-only"
                    />
                    <span className={cn("text-[14px] font-semibold", disabled ? "text-ink-2" : "text-ink")}>
                      {ROLE_LABELS[option]}
                    </span>
                    <span className="text-[12px] text-ink-2">{ROLE_CAPABILITIES[option]}</span>
                    {disabled && (
                      <span className="text-[12px] text-ink-2">
                        Seul un propriétaire peut inviter un administrateur
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
            <FieldError id="invite-role-error" messages={errors.role} />
          </fieldset>

          <DialogFooter>
            <SubmitButton pending={invite.isPending} pendingLabel="Envoi…">
              Envoyer l&apos;invitation
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
