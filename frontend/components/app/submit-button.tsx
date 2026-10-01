"use client";

import { Loader2 } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useMounted } from "@/hooks/use-mounted";

/**
 * The submit button of every form. Disabled until React has hydrated: before
 * that, a click would submit the form natively, without our handler (and
 * with method="post" the credentials would at least stay out of the URL).
 * A disabled default button also blocks implicit submission with Enter.
 */
export function SubmitButton({
  pending,
  pendingLabel,
  children,
  disabled,
  ...props
}: Omit<ComponentProps<typeof Button>, "type"> & {
  pending: boolean;
  /** Shown while the request runs, e.g. "Connexion…". */
  pendingLabel?: ReactNode;
}) {
  const mounted = useMounted();
  return (
    <Button
      type="submit"
      disabled={!mounted || pending || disabled}
      aria-busy={pending || undefined}
      {...props}
    >
      {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
