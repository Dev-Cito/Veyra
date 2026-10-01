"use client";

import { Loader2, UserRoundX } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useEffectEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { WorkspaceBadge } from "@/components/app/primitives";
import { RoleMark } from "@/components/app/role-mark";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLogout, useMe } from "@/hooks/use-auth";
import { useAcceptInvitation, useInvitationPreview } from "@/hooks/use-invitations";
import { isApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { pendingInvitation } from "@/lib/pending-invitation";
import type { InvitationRole } from "@/lib/types";

const ROLE_SENTENCES: Record<InvitationRole, string> = {
  MEMBER: "Vous pourrez créer, modifier et déplacer des cartes sur les tableaux de l'espace.",
  ADMIN:
    "Vous pourrez aussi créer des tableaux, inviter des personnes et gérer les membres de l'espace.",
};

export default function InvitePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-stone px-4 py-10">
      <Suspense fallback={<InviteSkeleton />}>
        <Invite />
      </Suspense>
    </main>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="flex w-full max-w-[382px] flex-col items-center gap-4 rounded-card bg-surface p-6 text-center shadow-card">
      {children}
    </div>
  );
}

function InviteSkeleton() {
  return (
    <Card>
      <Skeleton className="size-[46px] rounded-card" />
      <Skeleton className="h-5 w-56" />
      <Skeleton className="h-3.5 w-64" />
      <Skeleton className="h-10 w-full" />
    </Card>
  );
}

function Invite() {
  const router = useRouter();
  const urlToken = useSearchParams().get("token");
  // The token arrives once in the URL (the email link). It is kept in this
  // tab's storage and the address bar is cleaned right away, so it reaches
  // no other URL, and every API call carries it in the request body.
  const token = urlToken ?? pendingInvitation.get();

  useEffect(() => {
    if (urlToken) {
      pendingInvitation.set(urlToken);
      router.replace("/invite");
    }
  }, [urlToken, router]);

  const me = useMe({ anonymous: true });
  const preview = useInvitationPreview(token);
  const accept = useAcceptInvitation();

  const join = () => {
    if (!token) {
      return;
    }
    accept.mutate(token, {
      onSuccess: (workspace) => {
        pendingInvitation.clear();
        toast.success(`Vous avez rejoint ${workspace.name}`);
        router.replace(`/w/${workspace.id}`);
      },
    });
  };

  // Right after signing up (or in) for this invitation: accept straight away.
  const signedIn = Boolean(me.data);
  const previewed = Boolean(preview.data);
  const acceptIfRequested = useEffectEvent(() => {
    if (pendingInvitation.takeAcceptanceRequest()) {
      join();
    }
  });
  useEffect(() => {
    if (signedIn && previewed) {
      acceptIfRequested();
    }
  }, [signedIn, previewed]);

  if (!token || isApiError(preview.error, 404) || isApiError(accept.error, 404)) {
    return <NoLongerValid signedIn={signedIn} />;
  }
  if (isApiError(accept.error, 403)) {
    return <WrongAccount />;
  }
  if (preview.isError) {
    return (
      <Card>
        <h1 className="font-display text-[20px] font-bold text-ink">L&apos;invitation n&apos;a pas pu être chargée</h1>
        <p className="text-[14px] text-ink-2">Le serveur n&apos;a pas répondu. Réessayez dans un instant.</p>
        <Button className="w-full" onClick={() => void preview.refetch()}>
          Réessayer
        </Button>
      </Card>
    );
  }
  if (!preview.data || me.isPending) {
    return <InviteSkeleton />;
  }

  const { workspaceName, invitedByName, role, expiresAt } = preview.data;
  return (
    <Card>
      <WorkspaceBadge name={workspaceName} size={46} />
      <h1 className="font-display text-[20px] leading-snug font-bold text-ink">
        {invitedByName
          ? `${invitedByName} vous invite à rejoindre ${workspaceName}`
          : `Vous êtes invité à rejoindre ${workspaceName}`}
      </h1>
      <RoleMark role={role} />
      <p className="text-[14px] leading-relaxed text-ink-2">{ROLE_SENTENCES[role]}</p>

      {me.data ? (
        <>
          <Button size="lg" className="w-full" onClick={join} disabled={accept.isPending}>
            {accept.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
            Rejoindre {workspaceName}
          </Button>
          <p className="text-[12px] text-ink-2">Connecté en tant que {me.data.email}</p>
        </>
      ) : (
        <>
          <Button size="lg" className="w-full" asChild>
            <Link href="/register">Créer un compte pour rejoindre</Link>
          </Button>
          <p className="text-[13px] text-ink-2">
            Déjà un compte ?{" "}
            <Link href="/login" className="font-medium text-plum underline-offset-4 hover:underline">
              Se connecter
            </Link>
          </p>
        </>
      )}
      <p className="text-[11px] text-ink-3 tabular-nums">Expire le {formatDateTime(expiresAt)}</p>
    </Card>
  );
}

/** Expired, revoked, used or unknown: one message, never confirming a token existed. */
function NoLongerValid({ signedIn }: { signedIn: boolean }) {
  useEffect(() => pendingInvitation.clear(), []);
  return (
    <Card>
      <h1 className="font-display text-[20px] font-bold text-ink">Cette invitation n&apos;est plus valide</h1>
      <p className="text-[14px] leading-relaxed text-ink-2">
        Demandez à la personne qui vous a invité de vous en envoyer une nouvelle.
      </p>
      <Button className="w-full" variant="outline" asChild>
        <Link href={signedIn ? "/w" : "/login"}>{signedIn ? "Voir mes workspaces" : "Se connecter"}</Link>
      </Button>
    </Card>
  );
}

/**
 * Signed in with another account than the invited one. Usually someone with
 * two accounts, not an intruder: no accusation, and the invited address is
 * not revealed.
 */
function WrongAccount() {
  const router = useRouter();
  const logout = useLogout();
  return (
    <Card>
      <span className="flex size-[46px] items-center justify-center rounded-full bg-ember-soft text-ember">
        <UserRoundX className="size-5" aria-hidden="true" />
      </span>
      <h1 className="font-display text-[20px] font-bold text-ink">Cette invitation ne concerne pas ce compte</h1>
      <p className="text-[14px] leading-relaxed text-ink-2">
        Elle a été envoyée à une autre adresse email. Connectez-vous avec le compte qui a reçu
        l&apos;invitation pour rejoindre l&apos;espace.
      </p>
      <Button
        size="lg"
        className="w-full"
        disabled={logout.isPending}
        // The token stays in this tab: after signing in, the invitation resumes.
        onClick={() => logout.mutate(undefined, { onSettled: () => router.push("/login") })}
      >
        Se connecter avec un autre compte
      </Button>
      <Link href="/w" className="text-[13px] font-medium text-plum underline-offset-4 hover:underline">
        Retour à mes workspaces
      </Link>
    </Card>
  );
}
