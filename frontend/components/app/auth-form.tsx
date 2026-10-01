"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMe } from "@/hooks/use-auth";
import type { FieldErrors } from "@/lib/api";
import { pendingInvitation } from "@/lib/pending-invitation";
import { resetLoginRedirect } from "@/lib/session";
import { Banner, FieldError } from "./primitives";

/** Where to go once signed in: back to a pending invitation, or home. */
export function useAfterAuth() {
  const router = useRouter();
  return useCallback(() => {
    if (pendingInvitation.get()) {
      pendingInvitation.requestAcceptance();
      router.replace("/invite");
    } else {
      router.replace("/w");
    }
  }, [router]);
}

/** Already signed in: no reason to stay on /login or /register. */
export function useRedirectIfSignedIn() {
  const me = useMe({ anonymous: true });
  const afterAuth = useAfterAuth();
  // Arrived: the redirect to /login is over, a later 401 may redirect again.
  useEffect(() => resetLoginRedirect(), []);
  useEffect(() => {
    if (me.data) {
      afterAuth();
    }
  }, [me.data, afterAuth]);
}

export function AuthShell({
  title,
  children,
  footer,
}: {
  title: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-stone px-4 py-10">
      <div className="w-full max-w-[338px]">
        <p className="font-display mb-1 text-[26px] font-bold text-ink">Veyra</p>
        <h1 className="mb-6 text-[15px] text-ink-2">{title}</h1>
        {children}
        <p className="mt-6 text-center text-[13px] text-ink-2">{footer}</p>
      </div>
    </main>
  );
}

export function AuthForm({
  onSubmit,
  banner,
  submitting,
  submitLabel,
  submittingLabel,
  children,
}: {
  onSubmit: (form: FormData) => void;
  banner?: string | null;
  submitting: boolean;
  submitLabel: string;
  submittingLabel: string;
  children: ReactNode;
}) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(new FormData(event.currentTarget));
  };
  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {banner && <Banner>{banner}</Banner>}
      {children}
      <Button type="submit" size="lg" className="w-full" disabled={submitting}>
        {submitting && <Loader2 className="animate-spin" aria-hidden="true" />}
        {submitting ? submittingLabel : submitLabel}
      </Button>
    </form>
  );
}

export function AuthField({
  name,
  label,
  type = "text",
  autoComplete,
  errors,
  hint,
  minLength,
}: {
  name: string;
  label: string;
  type?: string;
  autoComplete: string;
  errors: FieldErrors;
  hint?: string;
  minLength?: number;
}) {
  const errorId = `${name}-error`;
  const hintId = `${name}-hint`;
  const messages = errors[name];
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name} className="text-[13px] font-medium text-ink">
        {label}
      </Label>
      <Input
        id={name}
        name={name}
        type={type}
        required
        minLength={minLength}
        autoComplete={autoComplete}
        aria-invalid={messages ? true : undefined}
        aria-describedby={[messages ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined}
        className="bg-surface"
      />
      {hint && !messages && (
        <p id={hintId} className="text-[12px] text-ink-3">
          {hint}
        </p>
      )}
      <FieldError id={errorId} messages={messages} />
    </div>
  );
}

export function SwitchLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-medium text-plum underline-offset-4 hover:underline">
      {children}
    </Link>
  );
}
