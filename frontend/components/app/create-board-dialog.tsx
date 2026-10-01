"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
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
import { useCreateBoard } from "@/hooks/use-boards";
import { isApiError } from "@/lib/api";
import { FieldError } from "./primitives";
import { SubmitButton } from "@/components/app/submit-button";

export function CreateBoardDialog({
  workspaceId,
  trigger,
}: {
  workspaceId: string;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const create = useCreateBoard(workspaceId);
  const errors = isApiError(create.error, 400) ? create.error.fieldErrors : {};

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const description = String(form.get("description")).trim();
    create.mutate(
      { name: String(form.get("name")), ...(description ? { description } : {}) },
      {
        onSuccess: (board) => {
          toast.success(`Tableau ${board.name} créé`);
          setOpen(false);
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
        <form method="post" onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Créer un tableau</DialogTitle>
            <DialogDescription>
              Un tableau organise le travail en colonnes. Tous les membres de l&apos;espace y
              ont accès.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="board-name">Nom</Label>
            <Input
              id="board-name"
              name="name"
              required
              maxLength={100}
              autoFocus
              placeholder="Feuille de route"
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? "board-name-error" : undefined}
            />
            <FieldError id="board-name-error" messages={errors.name} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="board-description">
              Description <span className="font-normal text-ink-3">(facultative)</span>
            </Label>
            <Input
              id="board-description"
              name="description"
              maxLength={5000}
              aria-invalid={errors.description ? true : undefined}
              aria-describedby={errors.description ? "board-description-error" : undefined}
            />
            <FieldError id="board-description-error" messages={errors.description} />
          </div>
          <DialogFooter>
            <SubmitButton pending={create.isPending} pendingLabel="Création…">
              Créer le tableau
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
