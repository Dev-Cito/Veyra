"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AuthField,
  AuthForm,
  AuthShell,
  SwitchLink,
  useRedirectIfSignedIn,
} from "@/components/app/auth-form";
import { useRegister } from "@/hooks/use-auth";
import { isApiError } from "@/lib/api";
import { errorMessage, fieldErrorMessages } from "@/lib/error-messages";

/** The browser's IANA zone, for dates in emails; omitted if it cannot be read. */
function browserTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

export default function RegisterPage() {
  // Also takes over after a successful sign-up: useRegister stores the user.
  useRedirectIfSignedIn();
  const router = useRouter();
  const register = useRegister();
  const fieldErrors = isApiError(register.error, 400)
    ? fieldErrorMessages(register.error.fieldErrors)
    : {};

  return (
    <AuthShell
      title="Créez votre compte"
      footer={
        <>
          Déjà un compte ? <SwitchLink href="/login">Se connecter</SwitchLink>
        </>
      }
    >
      <AuthForm
        submitting={register.isPending}
        submitLabel="Créer mon compte"
        submittingLabel="Création du compte…"
        onSubmit={(form) =>
          register.mutate(
            {
              name: String(form.get("name")),
              email: String(form.get("email")),
              password: String(form.get("password")),
              timezone: browserTimeZone(),
            },
            {
              // 409: the email already has an account. Say so, and offer the way out.
              onError: (error) => {
                if (isApiError(error, 409)) {
                  toast.error(errorMessage(error, "register"), {
                    action: { label: "Se connecter", onClick: () => router.push("/login") },
                  });
                }
              },
            },
          )
        }
      >
        <AuthField name="name" label="Nom" autoComplete="name" errors={fieldErrors} />
        <AuthField name="email" label="Email" type="email" autoComplete="email" errors={fieldErrors} />
        <AuthField
          name="password"
          label="Mot de passe"
          type="password"
          autoComplete="new-password"
          minLength={8}
          hint="Au moins 8 caractères."
          errors={fieldErrors}
        />
      </AuthForm>
    </AuthShell>
  );
}
