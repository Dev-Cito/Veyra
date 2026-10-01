"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
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
import { useCreateWorkspace } from "@/hooks/use-workspaces";
import { isApiError } from "@/lib/api";
import { FieldError } from "./primitives";

export function CreateWorkspaceDialog({ trigger }: { trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const create = useCreateWorkspace();
  const errors = isApiError(create.error, 400) ? create.error.fieldErrors : {};

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name"));
    create.mutate(
      { name },
      {
        onSuccess: (workspace) => {
          toast.success(`Workspace ${workspace.name} créé`);
          setOpen(false);
          router.push(`/w/${workspace.id}`);
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
          create.reset();
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Créer un workspace</DialogTitle>
            <DialogDescription>
              Vous en serez propriétaire et pourrez y inviter votre équipe.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="workspace-name">Nom</Label>
            <Input
              id="workspace-name"
              name="name"
              required
              maxLength={100}
              autoFocus
              placeholder="Équipe produit"
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? "workspace-name-error" : undefined}
            />
            <FieldError id="workspace-name-error" messages={errors.name} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Créer le workspace
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
