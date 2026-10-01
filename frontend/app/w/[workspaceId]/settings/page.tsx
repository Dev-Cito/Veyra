"use client";

import { Loader2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { FieldError } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeleteWorkspace, useRenameWorkspace, useWorkspace } from "@/hooks/use-workspaces";
import { isApiError } from "@/lib/api";
import { canManage } from "@/lib/format";
import type { Workspace } from "@/lib/types";

export default function SettingsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const workspace = useWorkspace(workspaceId);

  return (
    <>
      <PageHeader title="Paramètres" />
      <PageBody>
        <div className="mx-auto flex max-w-[620px] flex-col gap-4">
          {workspace.data ? (
            <>
              <RenameSection workspace={workspace.data} />
              {workspace.data.role === "OWNER" && <DeleteSection workspace={workspace.data} />}
            </>
          ) : (
            <section className="flex flex-col gap-3 rounded-card bg-surface p-5 shadow-card" aria-hidden="true">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-9 w-full" />
            </section>
          )}
        </div>
      </PageBody>
    </>
  );
}

function RenameSection({ workspace }: { workspace: Workspace }) {
  const rename = useRenameWorkspace(workspace.id);
  const errors = isApiError(rename.error, 400) ? rename.error.fieldErrors : {};
  const editable = canManage(workspace.role);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name"));
    rename.mutate(name, {
      onSuccess: (renamed) => toast.success(`Espace renommé en ${renamed.name}`),
    });
  };

  return (
    <section className="rounded-card bg-surface p-5 shadow-card">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <h2 className="font-display text-[15px] font-bold text-ink">Nom de l&apos;espace</h2>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="settings-name" className="sr-only">
            Nom de l&apos;espace
          </Label>
          <Input
            id="settings-name"
            name="name"
            // Remount on rename so the field shows the saved value.
            key={workspace.name}
            defaultValue={workspace.name}
            required
            maxLength={100}
            disabled={!editable}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? "settings-name-error" : "settings-name-hint"}
          />
          <FieldError id="settings-name-error" messages={errors.name} />
          {!editable && (
            <p id="settings-name-hint" className="text-[12px] text-ink-2">
              Seuls les propriétaires et administrateurs peuvent renommer l&apos;espace.
            </p>
          )}
        </div>
        {editable && (
          <div>
            <Button type="submit" disabled={rename.isPending}>
              {rename.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Renommer l&apos;espace
            </Button>
          </div>
        )}
      </form>
    </section>
  );
}

function DeleteSection({ workspace }: { workspace: Workspace }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const remove = useDeleteWorkspace(workspace.id);

  const confirm = () =>
    remove.mutate(undefined, {
      onSuccess: (result) => {
        toast.success(`${workspace.name} supprimé`, {
          description: `${result.deletedBoards} tableaux, ${result.deletedTasks} tâches et ${result.deletedMembers} adhésions supprimés.`,
        });
        router.replace("/w");
      },
      onSettled: () => setOpen(false),
    });

  return (
    <section className="flex flex-col gap-3 rounded-card bg-surface p-5 shadow-card">
      <h2 className="font-display text-[15px] font-bold text-ink">Supprimer l&apos;espace</h2>
      <p className="text-[13px] text-ink-2">
        Supprime ses tableaux, leurs tâches et toutes les adhésions. Cette action est
        définitive.
      </p>
      <div>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          Supprimer l&apos;espace
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer {workspace.name}</DialogTitle>
            <DialogDescription>
              Tous les tableaux, toutes les tâches et toutes les adhésions de cet espace
              disparaîtront. Personne ne pourra les récupérer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Garder l&apos;espace
            </Button>
            <Button variant="destructive" onClick={confirm} disabled={remove.isPending}>
              {remove.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Supprimer définitivement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
