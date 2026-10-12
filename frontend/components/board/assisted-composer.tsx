"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { useCreateTask, useParseTask } from "@/hooks/use-board";
import { isApiError } from "@/lib/api";
import { errorMessage } from "@/lib/error-messages";
import { fromLocalInput, toLocalInput } from "@/lib/format";
import type { TaskPriority, TaskProposal } from "@/lib/types";
import { useBoardContext } from "./board-context";
import { DueDateInput, PrioritySelect } from "./task-fields";

const TEXT_MAX_LENGTH = 500;

/** Failures worth trying again as is (the provider, not the text). */
const RETRYABLE = [0, 429, 500, 502, 504];

/**
 * Card creation from one sentence. Three steps, and nothing exists until the
 * last one: the sentence, the model's PROPOSAL (editable, with the same
 * controls as the detail panel), then the ordinary creation. Whatever fails,
 * the sentence stays, and the manual composer is one click away with it.
 */
export function AssistedComposer({
  listId,
  onClose,
  onManual,
}: {
  listId: string;
  onClose: () => void;
  /** Switches to the manual composer, prefilled with the sentence. */
  onManual: (text: string) => void;
}) {
  const { workspaceId, boardId } = useBoardContext();
  const parse = useParseTask(workspaceId);
  const [text, setText] = useState("");
  const [proposal, setProposal] = useState<TaskProposal | null>(null);

  const submit = () => {
    const value = text.trim();
    if (!value || parse.isPending) {
      return;
    }
    parse.mutate({ listId, text: value }, { onSuccess: setProposal });
  };

  if (proposal) {
    return (
      <ProposalForm
        listId={listId}
        boardId={boardId}
        workspaceId={workspaceId}
        proposal={proposal}
        onCreated={onClose}
        // Back to the sentence, as written.
        onCancel={() => {
          setProposal(null);
          parse.reset();
        }}
      />
    );
  }

  const error = parse.error;
  return (
    <div className="mb-[9px] rounded-card bg-surface px-[13px] py-2.5 shadow-card">
      <label className="flex items-center gap-1.5 text-[11px] font-medium text-plum">
        <Sparkles className="size-3.5" aria-hidden="true" />
        Création assistée
      </label>
      <input
        autoFocus
        value={text}
        maxLength={TEXT_MAX_LENGTH}
        readOnly={parse.isPending}
        aria-busy={parse.isPending}
        aria-label="Décrivez la tâche en une phrase"
        placeholder="Décrivez la tâche en une phrase"
        onChange={(event) => {
          setText(event.target.value);
          if (parse.isError) {
            parse.reset();
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            submit();
          } else if (event.key === "Escape" && !parse.isPending) {
            event.preventDefault();
            onClose();
          }
        }}
        className="mt-1.5 block w-full bg-transparent text-[13px] leading-snug font-medium text-ink outline-none read-only:text-ink-2"
      />
      {parse.isPending ? (
        <p role="status" className="mt-2 flex items-center gap-1.5 text-[12px] text-ink-2">
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          Analyse en cours…
        </p>
      ) : error ? (
        <div role="alert" className="mt-2 flex flex-col gap-2">
          <p className="text-[12px] leading-snug text-ember">{errorMessage(error, "parseTask")}</p>
          <div className="flex flex-wrap gap-1.5">
            {isApiError(error) && RETRYABLE.includes(error.status) && (
              <Button size="xs" variant="outline" onClick={submit}>
                Réessayer
              </Button>
            )}
            {!isApiError(error, 400) && (
              <Button size="xs" variant="outline" onClick={() => onManual(text.trim())}>
                Créer manuellement
              </Button>
            )}
          </div>
        </div>
      ) : (
        <p className="mt-1 text-[11px] text-ink-3">Entrée pour analyser, Échap pour fermer</p>
      )}
    </div>
  );
}

function ProposalForm({
  workspaceId,
  boardId,
  listId,
  proposal,
  onCreated,
  onCancel,
}: {
  workspaceId: string;
  boardId: string;
  listId: string;
  proposal: TaskProposal;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const create = useCreateTask(workspaceId, boardId);
  const [title, setTitle] = useState(proposal.title);
  const [due, setDue] = useState(proposal.dueDate ? toLocalInput(proposal.dueDate) : "");
  const [priority, setPriority] = useState<TaskPriority>(proposal.priority);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = title.trim();
    if (!value) {
      return;
    }
    const dueDate = fromLocalInput(due);
    // The ordinary creation, under the ordinary rules: the model only proposed.
    create.mutate(
      { listId, title: value, priority, ...(dueDate ? { dueDate } : {}) },
      { onSuccess: onCreated },
    );
  };

  return (
    <form
      method="post"
      onSubmit={submit}
      aria-label="Proposition de carte"
      className="mb-[9px] flex flex-col gap-2.5 rounded-card bg-surface px-[13px] py-3 shadow-card ring-1 ring-plum/25"
    >
      <p className="flex items-center gap-1.5 text-[11px] font-medium text-plum">
        <Sparkles className="size-3.5" aria-hidden="true" />
        Proposition, à vérifier avant de créer
      </p>
      {proposal.confidence === "low" && (
        <p className="rounded-button bg-ember-soft px-2 py-1.5 text-[12px] leading-snug text-ink">
          Le texte était ambigu : vérifiez le titre et l&apos;échéance.
        </p>
      )}
      <textarea
        autoFocus
        required
        rows={2}
        maxLength={200}
        value={title}
        onChange={(event) => setTitle(event.target.value.replace(/\n/g, ""))}
        aria-label="Titre de la carte"
        className="field-sizing-content -mx-1 block w-[calc(100%+0.5rem)] resize-none rounded-button bg-transparent px-1 py-0.5 text-[13px] leading-snug font-medium text-ink outline-none hover:bg-stone focus-visible:outline-2 focus-visible:outline-plum"
      />
      <div className="flex flex-col gap-1">
        <span className="text-[11px] text-ink-3">Échéance</span>
        <DueDateInput
          value={due}
          onChange={(event) => setDue(event.target.value)}
          onClear={due ? () => setDue("") : undefined}
          className="w-full"
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[11px] text-ink-3">Priorité</span>
        <PrioritySelect value={priority} onChange={setPriority} />
      </div>
      <div className="flex flex-wrap gap-1.5 pt-0.5">
        <Button type="submit" size="sm" disabled={create.isPending || !title.trim()}>
          {create.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
          Créer la carte
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={create.isPending}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
