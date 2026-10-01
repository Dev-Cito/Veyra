"use client";

import {
  AuthField,
  AuthForm,
  AuthShell,
  SwitchLink,
  useRedirectIfSignedIn,
} from "@/components/app/auth-form";
import { useLogin } from "@/hooks/use-auth";
import { isApiError } from "@/lib/api";
import { errorMessage, fieldErrorMessages } from "@/lib/error-messages";

export default function LoginPage() {
  // Also takes over after a successful login: useLogin stores the user.
  useRedirectIfSignedIn();
  const login = useLogin();

  // Bad credentials: the server's message, which deliberately does not say
  // which of the two fields is wrong.
  const banner = isApiError(login.error, 401) ? errorMessage(login.error, "login") : null;
  const fieldErrors = isApiError(login.error, 400) ? fieldErrorMessages(login.error.fieldErrors) : {};

  return (
    <AuthShell
      title="Connectez-vous à votre espace"
      footer={
        <>
          Pas encore de compte ? <SwitchLink href="/register">Créer un compte</SwitchLink>
        </>
      }
    >
      <AuthForm
        banner={banner}
        submitting={login.isPending}
        submitLabel="Se connecter"
        submittingLabel="Connexion…"
        onSubmit={(form) =>
          login.mutate({
            email: String(form.get("email")),
            password: String(form.get("password")),
          })
        }
      >
        <AuthField name="email" label="Email" type="email" autoComplete="email" errors={fieldErrors} />
        <AuthField
          name="password"
          label="Mot de passe"
          type="password"
          autoComplete="current-password"
          errors={fieldErrors}
        />
      </AuthForm>
    </AuthShell>
  );
}
