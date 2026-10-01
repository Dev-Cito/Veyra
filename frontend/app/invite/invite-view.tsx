"use client";

import { Loader2, UserRoundX } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
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

/**
 * Where the token comes from, read once when the page mounts (browser only:
 * this view is loaded with ssr: false, the fragment does not exist server-side).
 *
 * - `#token=…`: the email link. The fragment is never sent to a server, so the
 *   token reaches no access log (not Render's, not the Next server's).
 * - `?token=…`: older links. The front's server has seen it; at least the URL
 *   and the browser history are cleaned at once.
 * - the hand-off: back from /login or /register, where /invite sent the user.
 */
interface InitialToken {
  token: string | null;
  /** Back from signing in or up for this invitation: accept straight away. */
  resumed: boolean;
}

function readInitialToken(): InitialToken {
  const fromHash = new URLSearchParams(window.location.hash.slice(1)).get("token");
  const fromQuery = new URLSearchParams(window.location.search).get("token");
  if (fromHash || fromQuery) {
    return { token: fromHash ?? fromQuery, resumed: false };
  }
  const handedOff = pendingInvitation.peek();
  return { token: handedOff, resumed: handedOff !== null };
}

export function InviteSkeleton() {
  return (
    <Card>
      <Skeleton className="size-[46px] rounded-card" />
      <Skeleton className="h-5 w-56" />
      <Skeleton className="h-3.5 w-64" />
      <Skeleton className="h-10 w-full" />
    </Card>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="flex w-full max-w-[382px] flex-col items-center gap-4 rounded-card bg-surface p-6 text-center shadow-card">
      {children}
    </div>
  );
}

export default function InviteView() {
  const router = useRouter();
  // Pure read (no side effect), so React may call it twice in development.
  const [{ token, resumed }] = useState(readInitialToken);
  // Set when the user leaves to sign in or up: the token must survive the unmount.
  const handingOff = useRef(false);

  useEffect(() => {
    // Single-use: consumed now, before any acceptance attempt.
    pendingInvitation.clear();
    // Clean the URL and the history entry: no token left in the address bar.
    if (window.location.hash || window.location.search) {
      window.history.replaceState(window.history.state, "", "/invite");
    }
    return () => {
      // Leaving /invite any other way than to sign in or up: forget it.
      if (!handingOff.current) {
        pendingInvitation.clear();
      }
    };
  }, []);

  const me = useMe({ anonymous: true });
  const preview = useInvitationPreview(token);
  const accept = useAcceptInvitation();
  const attempted = useRef(false);

  const handOffTo = (path: "/login" | "/register") => {
    if (token) {
      handingOff.current = true;
      pendingInvitation.handOff(token);
    }
    router.push(path);
  };

  const join = () => {
    if (!token || attempted.current) {
      return;
    }
    attempted.current = true;
    accept.mutate(token, {
      onSuccess: (workspace) => {
        toast.success(`Vous avez rejoint ${workspace.name}`);
        router.replace(`/w/${workspace.id}`);
      },
      onError: () => {
        attempted.current = false;
      },
    });
  };

  // Back from signing in or up for this very invitation: accept straight away.
  const signedIn = Boolean(me.data);
  const previewed = Boolean(preview.data);
  const resume = useEffectEvent(() => join());
  useEffect(() => {
    if (resumed && signedIn && previewed) {
      resume();
    }
  }, [resumed, signedIn, previewed]);

  if (!token) {
    return <MissingLink signedIn={signedIn} />;
  }
  if (isApiError(preview.error, 404) || isApiError(accept.error, 404)) {
    return <NoLongerValid signedIn={signedIn} />;
  }
  if (isApiError(accept.error, 403)) {
    return <WrongAccount onSwitchAccount={() => handOffTo("/login")} />;
  }
  if (preview.isError) {
    return (
      <Card>
        <h1 className="font-display text-[20px] font-bold text-ink">
          L&apos;invitation n&apos;a pas pu être chargée
        </h1>
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
          <Button size="lg" className="w-full" onClick={() => handOffTo("/register")}>
            Créer un compte pour rejoindre
          </Button>
          <p className="text-[13px] text-ink-2">
            Déjà un compte ?{" "}
            <button
              type="button"
              onClick={() => handOffTo("/login")}
              className="font-medium text-plum underline-offset-4 hover:underline"
            >
              Se connecter
            </button>
          </p>
        </>
      )}
      <p className="text-[11px] text-ink-3 tabular-nums">Expire le {formatDateTime(expiresAt)}</p>
    </Card>
  );
}

/** No token at all: the page was opened without the email link (or reloaded). */
function MissingLink({ signedIn }: { signedIn: boolean }) {
  return (
    <Card>
      <h1 className="font-display text-[20px] font-bold text-ink">Ouvrez le lien reçu par email</h1>
      <p className="text-[14px] leading-relaxed text-ink-2">
        Cette page s&apos;ouvre depuis le bouton de l&apos;email d&apos;invitation. Si vous
        l&apos;avez déjà quitté, cliquez de nouveau sur ce bouton.
      </p>
      <Button className="w-full" variant="outline" asChild>
        <Link href={signedIn ? "/w" : "/login"}>{signedIn ? "Voir mes workspaces" : "Se connecter"}</Link>
      </Button>
    </Card>
  );
}

/** Expired, revoked, used or unknown: one message, never confirming a token existed. */
function NoLongerValid({ signedIn }: { signedIn: boolean }) {
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
 * not revealed. Switching account is an explicit "sign in" choice, so the
 * token is handed off again for the return trip.
 */
function WrongAccount({ onSwitchAccount }: { onSwitchAccount: () => void }) {
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
        onClick={() => logout.mutate(undefined, { onSettled: onSwitchAccount })}
      >
        Se connecter avec un autre compte
      </Button>
      <Link href="/w" className="text-[13px] font-medium text-plum underline-offset-4 hover:underline">
        Retour à mes workspaces
      </Link>
    </Card>
  );
}
